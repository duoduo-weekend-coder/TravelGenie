/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleParseXiaohongshuRequest } from './server/src/routes/parseXiaohongshu'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'resolve-short-url',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/resolve-url')) {
            return next();
          }
          const parsed = new URL(req.url, 'http://localhost');
          const targetUrl = parsed.searchParams.get('url');
          if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
          }
          try {
            // Manually follow redirects — Google serves a 200 interstitial page
            // (DurableDeepLinkUi) to browser-like User-Agents instead of a 302,
            // so we use redirect:'manual' and chase the Location header ourselves.
            let url = targetUrl;
            let hops = 0;
            while (hops++ < 10) {
              const response = await fetch(url, { redirect: 'manual' });
              const location = response.headers.get('location');
              if (response.status >= 300 && response.status < 400 && location) {
                url = location;
              } else {
                break;
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ resolvedUrl: url }));
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      },
    },
    {
      name: 'fetch-list',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/fetch-list')) {
            return next();
          }
          const parsed = new URL(req.url, 'http://localhost');
          const targetUrl = parsed.searchParams.get('url');
          if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
          }

          const HEADERS = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': 'CONSENT=YES+cb; SOCS=CAISHAgBEhJnd3NfMjAyNTAxMDEtMF9SQzEaAmVuIAEaBgiA_LSmBg',
          };

          // Helper: unescape Google's JS-encoded URLs
          const unescapeUrl = (u: string) =>
            u.replace(/\\x([0-9a-fA-F]{2})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
             .replace(/\\u([0-9a-fA-F]{4})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
             .replace(/&amp;/g, '&');

          // Helper: try to fetch getlist URL and parse places
          const tryGetlist = async (getlistUrl: string) => {
            console.log('[fetch-list] Trying getlist URL:', getlistUrl.substring(0, 120) + '...');
            const listResponse = await fetch(getlistUrl, { headers: HEADERS });
            const listText = await listResponse.text();
            console.log('[fetch-list] getlist response: status=' + listResponse.status + ' length=' + listText.length);
            if (listResponse.status !== 200) return null;

            const jsonStr = listText.replace(/^\)\]\}'\n?/, '');
            const data = JSON.parse(jsonStr);

            const listName = data?.[0]?.[1] || 'Unnamed List';
            const rawPlaces = data?.[0]?.[8] || [];
            if (rawPlaces.length === 0) return null;

            console.log('[fetch-list] List:', listName, '| Places:', rawPlaces.length);
            const places = rawPlaces.map((p: any) => {
              try {
                  // p[3] is the comment/note text field; p[12] is author info — not a comment
                  const comment = (typeof p?.[3] === 'string' && p[3].length > 0) ? p[3] : null;

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
            }).filter(Boolean);
            return { listName, places };
          };

          try {
            // Step 1: Fetch the Google Maps page (follows redirects)
            const pageResponse = await fetch(targetUrl, { redirect: 'follow', headers: HEADERS });
            const resolvedUrl = pageResponse.url;
            const html = await pageResponse.text();
            console.log('[fetch-list] Fetched:', resolvedUrl);
            console.log('[fetch-list] HTML length:', html.length, '| contains "entitylist":', html.includes('entitylist'));

            // Strategy A: Find getlist URL in HTML (broadened regex — allow \xNN escapes)
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
                if (getlistUrl.startsWith('/')) getlistUrl = 'https://www.google.com' + getlistUrl;
                console.log('[fetch-list] Strategy A: found getlist in HTML');
                const result = await tryGetlist(getlistUrl);
                if (result) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(result));
                  return;
                }
              }
            }

            // Strategy B: Extract list ID from resolved URL and construct getlist URL
            const listIdMatch = resolvedUrl.match(/!2s([A-Za-z0-9_-]+)/);
            if (listIdMatch) {
              const listId = listIdMatch[1];
              console.log('[fetch-list] Strategy B: extracted list ID:', listId);

              // Try known getlist URL formats
              const candidateUrls = [
                `https://www.google.com/maps/rpc/page/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m3!1s${listId}!6m1!4e2`,
                `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m3!1s${listId}!6m1!4e2`,
              ];

              for (const candidateUrl of candidateUrls) {
                try {
                  const result = await tryGetlist(candidateUrl);
                  if (result) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                    return;
                  }
                } catch (e: any) {
                  console.log('[fetch-list] Strategy B candidate failed:', e.message);
                }
              }
            }

            // Strategy C: Parse list data directly from embedded page data
            const afMatches = [...html.matchAll(/AF_initDataCallback\(\{[^}]*?data:function\(\)\{return\s*/g)];
            console.log('[fetch-list] Strategy C: found', afMatches.length, 'AF_initDataCallback blocks');
            for (const afMatch of afMatches) {
              try {
                // Find the matching return value — starts after "return " and ends with "})"
                const startIdx = (afMatch.index ?? 0) + afMatch[0].length;
                // Find the closing }); by tracking bracket depth
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
                // Check if this contains list data (array at [0][8])
                if (data?.[0]?.[8] && Array.isArray(data[0][8]) && data[0][8].length > 0) {
                  console.log('[fetch-list] Strategy C: found embedded list data with', data[0][8].length, 'places');
                  const listName = data?.[0]?.[1] || 'Unnamed List';
                  const places = data[0][8].map((p: any) => {
                    try {
                      const comment = (typeof p?.[3] === 'string' && p[3].length > 0) ? p[3] : null;
                      return {
                        name: p?.[2] || 'Unknown',
                        address: p?.[1]?.[4] || p?.[1]?.[2] || '',
                        lat: p?.[1]?.[5]?.[2] ?? null,
                        lng: p?.[1]?.[5]?.[3] ?? null,
                        comment,
                      };
                    } catch { return null; }
                  }).filter(Boolean);
                  if (places.length > 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ listName, places }));
                    return;
                  }
                }
              } catch {
                // This AF_initDataCallback didn't contain parseable list data
              }
            }

            // No strategy worked
            console.log('[fetch-list] All strategies failed. HTML preview:', html.substring(0, 300));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Could not extract list data', isNotList: true }));
          } catch (e: any) {
            console.log('[fetch-list] Error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      },
    },
    {
      name: 'parse-xiaohongshu',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/parse/xiaohongshu')) {
            return next();
          }

          await handleParseXiaohongshuRequest(req, res);
        });
      },
    },
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
