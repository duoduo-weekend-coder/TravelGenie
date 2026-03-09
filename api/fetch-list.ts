import type { VercelRequest, VercelResponse } from '@vercel/node';

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie:
    'CONSENT=YES+cb; SOCS=CAISHAgBEhJnd3NfMjAyNTAxMDEtMF9SQzEaAmVuIAEaBgiA_LSmBg',
};

function unescapeUrl(u: string): string {
  return u
    .replace(/\\x([0-9a-fA-F]{2})/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&amp;/g, '&');
}

async function tryGetlist(getlistUrl: string) {
  const listResponse = await fetch(getlistUrl, { headers: HEADERS });
  const listText = await listResponse.text();
  if (listResponse.status !== 200) return null;

  const jsonStr = listText.replace(/^\)\]\}'\n?/, '');
  const data = JSON.parse(jsonStr);

  const listName = data?.[0]?.[1] || 'Unnamed List';
  const rawPlaces = data?.[0]?.[8] || [];
  if (rawPlaces.length === 0) return null;

  const places = rawPlaces
    .map((p: any) => {
      try {
        const comment =
          typeof p?.[3] === 'string' && p[3].length > 0 ? p[3] : null;
        return {
          name: p?.[2] || 'Unknown',
          address: p?.[1]?.[4] || p?.[1]?.[2] || '',
          lat: p?.[1]?.[5]?.[2] ?? null,
          lng: p?.[1]?.[5]?.[3] ?? null,
          comment,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { listName, places };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url as string | undefined;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // Step 1: Fetch the Google Maps page (follows redirects)
    const pageResponse = await fetch(targetUrl, {
      redirect: 'follow',
      headers: HEADERS,
    });
    const resolvedUrl = pageResponse.url;
    const html = await pageResponse.text();

    // Strategy A: Find getlist URL in HTML
    const htmlPatterns = [
      /https?:\/\/www\.google\.com\/maps\/preview\/entitylist\/getlist\?[^"'\s<>]+/,
      /https?:\/\/www\.google\.com\/maps\/rpc\/page\/entitylist\/getlist\?[^"'\s<>]+/,
      /\/maps\/preview\/entitylist\/getlist\?[^"'\s<>]+/,
      /\/maps\/rpc\/page\/entitylist\/getlist\?[^"'\s<>]+/,
    ];

    for (const pattern of htmlPatterns) {
      const match = html.match(pattern);
      if (match) {
        let getlistUrl = unescapeUrl(match[0]);
        if (getlistUrl.startsWith('/'))
          getlistUrl = 'https://www.google.com' + getlistUrl;
        const result = await tryGetlist(getlistUrl);
        if (result) {
          return res.status(200).json(result);
        }
      }
    }

    // Strategy B: Extract list ID from resolved URL and construct getlist URL
    const listIdMatch = resolvedUrl.match(/!2s([A-Za-z0-9_-]+)/);
    if (listIdMatch) {
      const listId = listIdMatch[1];
      const candidateUrls = [
        `https://www.google.com/maps/rpc/page/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m3!1s${listId}!6m1!4e2`,
        `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m3!1s${listId}!6m1!4e2`,
      ];

      for (const candidateUrl of candidateUrls) {
        try {
          const result = await tryGetlist(candidateUrl);
          if (result) {
            return res.status(200).json(result);
          }
        } catch {
          // candidate failed, try next
        }
      }
    }

    // Strategy C: Parse list data directly from embedded page data
    const afMatches = [
      ...html.matchAll(
        /AF_initDataCallback\(\{[^}]*?data:function\(\)\{return\s*/g,
      ),
    ];
    for (const afMatch of afMatches) {
      try {
        const startIdx = (afMatch.index ?? 0) + afMatch[0].length;
        let depth = 0;
        let endIdx = startIdx;
        for (let j = startIdx; j < html.length && j < startIdx + 500000; j++) {
          if (html[j] === '[') depth++;
          else if (html[j] === ']') depth--;
          if (depth === 0 && j > startIdx) {
            endIdx = j + 1;
            break;
          }
        }
        const dataStr = html.substring(startIdx, endIdx);
        const data = JSON.parse(dataStr);
        if (
          data?.[0]?.[8] &&
          Array.isArray(data[0][8]) &&
          data[0][8].length > 0
        ) {
          const listName = data?.[0]?.[1] || 'Unnamed List';
          const places = data[0][8]
            .map((p: any) => {
              try {
                const comment =
                  typeof p?.[3] === 'string' && p[3].length > 0
                    ? p[3]
                    : null;
                return {
                  name: p?.[2] || 'Unknown',
                  address: p?.[1]?.[4] || p?.[1]?.[2] || '',
                  lat: p?.[1]?.[5]?.[2] ?? null,
                  lng: p?.[1]?.[5]?.[3] ?? null,
                  comment,
                };
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          if (places.length > 0) {
            return res.status(200).json({ listName, places });
          }
        }
      } catch {
        // This AF_initDataCallback didn't contain parseable list data
      }
    }

    // No strategy worked
    return res
      .status(200)
      .json({ error: 'Could not extract list data', isNotList: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
