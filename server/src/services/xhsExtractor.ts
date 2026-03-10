import type { ExtractedXhsPost } from '../types/xhs';

// Rotate User-Agents to reduce fingerprinting-based blocks
const USER_AGENTS = [
  // Desktop Chrome (Mac)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Desktop Chrome (Windows)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Mobile Safari (iPhone)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  // Mobile Chrome (Android)
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
];

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildHeaders(ua?: string): Record<string, string> {
  return {
    'User-Agent': ua || pickUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };
}

// Keep a static ref for legacy callers (Playwright context, API calls)
const REQUEST_HEADERS = {
  'User-Agent': USER_AGENTS[0],
  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Only match block-page-specific patterns; avoid generic words like "verify"
// that appear in normal JS code.
const XHS_BLOCK_PATTERNS = ['访问受限', '请完成验证', '安全验证', 'captcha'];

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractMeta(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${key}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*name=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${key}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return undefined;
}

function parseStateJson(html: string): unknown[] {
  const states: unknown[] = [];

  // Approach 1: regex-based extraction (handles window.__STATE__ = {...};)
  const regexPatterns = [
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/g,
    /window\.__INITIAL_SSR_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/g,
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/g,
  ];

  for (const pattern of regexPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      try {
        states.push(JSON.parse(match[1]));
      } catch {
        // Try fixing JS-specific values (undefined → null)
        try {
          states.push(JSON.parse(match[1].replace(/:\s*undefined/g, ':null')));
        } catch {
          // ignore unparseable blobs
        }
      }
    }
  }

  // Approach 2: brace-matching extraction (handles bare __INITIAL_STATE__={...})
  // This catches cases where there's no "window." prefix or no trailing semicolon.
  const stateNames = ['__INITIAL_STATE__', '__INITIAL_SSR_STATE__', '__PRELOADED_STATE__'];
  for (const name of stateNames) {
    let searchFrom = 0;
    while (true) {
      const idx = html.indexOf(name, searchFrom);
      if (idx < 0) break;
      searchFrom = idx + name.length;

      // Find the '=' after the name
      const eqIdx = html.indexOf('=', idx + name.length);
      if (eqIdx < 0 || eqIdx > idx + name.length + 5) continue;

      const startIdx = eqIdx + 1;
      // Skip whitespace
      let i = startIdx;
      while (i < html.length && (html[i] === ' ' || html[i] === '\n' || html[i] === '\r')) i++;
      if (html[i] !== '{') continue;

      // Track braces to find end
      let depth = 0;
      let endIdx = i;
      for (let j = i; j < html.length && j < i + 500000; j++) {
        if (html[j] === '{') depth++;
        else if (html[j] === '}') depth--;
        if (depth === 0 && j > i) {
          endIdx = j + 1;
          break;
        }
      }
      if (depth !== 0) continue;

      const jsonStr = html.substring(i, endIdx);
      try {
        states.push(JSON.parse(jsonStr));
      } catch {
        // Fix JS-specific: undefined → null
        try {
          states.push(JSON.parse(jsonStr.replace(/:\s*undefined/g, ':null')));
        } catch {
          // ignore
        }
      }
    }
  }

  return states;
}

function looksLikeImageUrl(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    (normalized.startsWith('http://') || normalized.startsWith('https://')) &&
    (normalized.includes('sns-webpic-qc.xhscdn.com') ||
      normalized.includes('xhslink.com') ||
      normalized.includes('xhscdn.com') ||
      /\.(jpg|jpeg|png|webp)(\?|$)/.test(normalized))
  );
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseCookieString(cookieStr?: string): Array<{ name: string; value: string }> {
  if (!cookieStr) return [];
  return cookieStr
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const firstEq = part.indexOf('=');
      if (firstEq <= 0) return null;
      const name = part.slice(0, firstEq).trim();
      const value = part.slice(firstEq + 1).trim();
      if (!name) return null;
      return { name, value };
    })
    .filter((x): x is { name: string; value: string } => Boolean(x));
}

function getCookieHeader(cookieStr?: string): string | undefined {
  const cookies = parseCookieString(cookieStr);
  if (cookies.length === 0) return undefined;
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function collectFromUnknown(
  node: unknown,
  ctx: {
    images: Set<string>;
    longText: string[];
    titles: string[];
    authors: string[];
    locationNames: string[];
    locationAddresses: string[];
    publishTimes: string[];
    coords: Array<{ lat: number; lng: number }>;
  },
  depth = 0,
  seen = new Set<unknown>()
): void {
  if (node == null || depth > 12 || seen.has(node)) return;

  if (typeof node === 'string') {
    const value = cleanText(node);
    if (!value) return;
    if (looksLikeImageUrl(value)) ctx.images.add(value);
    if (value.length > 25) ctx.longText.push(value);
    return;
  }

  if (typeof node !== 'object') {
    return;
  }

  seen.add(node);

  if (Array.isArray(node)) {
    for (const entry of node) {
      collectFromUnknown(entry, ctx, depth + 1, seen);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  const keySet = Object.keys(record);

  const lat = typeof record.lat === 'number' ? record.lat : undefined;
  const lng = typeof record.lng === 'number' ? record.lng : undefined;
  if (typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    ctx.coords.push({ lat, lng });
  }

  for (const key of keySet) {
    const value = record[key];
    if (typeof value === 'string') {
      const text = cleanText(value);
      const keyLower = key.toLowerCase();

      if (!text) continue;
      if (looksLikeImageUrl(text)) ctx.images.add(text);
      if ((keyLower.includes('title') || keyLower.includes('name')) && text.length >= 2) ctx.titles.push(text);
      if ((keyLower.includes('desc') || keyLower.includes('content') || keyLower.includes('text')) && text.length > 25) {
        ctx.longText.push(text);
      }
      if ((keyLower.includes('author') || keyLower.includes('nickname') || keyLower === 'user') && text.length >= 2) {
        ctx.authors.push(text);
      }
      if ((keyLower.includes('location') || keyLower.includes('poi') || keyLower.includes('place')) && text.length >= 2) {
        ctx.locationNames.push(text);
      }
      if (keyLower.includes('address') && text.length >= 4) {
        ctx.locationAddresses.push(text);
      }
      if (keyLower.includes('time') || keyLower.includes('date') || keyLower.includes('publish')) {
        ctx.publishTimes.push(text);
      }
    }

    collectFromUnknown(value, ctx, depth + 1, seen);
  }
}

function chooseBest(candidates: string[], minLen = 1): string | undefined {
  const deduped = Array.from(new Set(candidates.map(cleanText))).filter((v) => v.length >= minLen);
  if (deduped.length === 0) return undefined;
  return deduped.sort((a, b) => b.length - a.length)[0];
}

function htmlLooksBlocked(html: string): boolean {
  const lower = html.toLowerCase();
  return XHS_BLOCK_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

/**
 * Try to extract note data from known XHS state structures.
 * These are more reliable than generic deep traversal.
 */
function extractFromKnownStructures(states: unknown[]): ExtractedXhsPost | null {
  for (const state of states) {
    if (!state || typeof state !== 'object') continue;
    const root = state as Record<string, any>;

    // Structure: { noteData: { data: { noteData: { title, desc, imageList, ... } } } }
    const noteData = root?.noteData?.data?.noteData;
    if (noteData && typeof noteData === 'object') {
      const images = (noteData.imageList || [])
        .map((img: any) => {
          // Prefer H5_DTL scene, fall back to top-level url
          const infoList = img?.infoList || [];
          const best = infoList.find((i: any) => i?.imageScene === 'H5_DTL' && i?.url) ||
                       infoList.find((i: any) => typeof i?.url === 'string' && i.url.startsWith('http'));
          return best?.url || img?.url;
        })
        .filter((u: any): u is string => typeof u === 'string' && u.startsWith('http'));

      const user = noteData.user;
      const time = typeof noteData.time === 'number' ? new Date(noteData.time).toISOString() : undefined;

      return {
        title: noteData.title || undefined,
        fullText: noteData.desc || undefined,
        images,
        author: user?.nickname || user?.name || undefined,
        publishTime: time,
        locationText: undefined,
        locationAddress: undefined,
        lat: undefined,
        lng: undefined,
      };
    }

    // Structure: { note: { noteDetailMap: { <id>: { note: { ... } } } } }
    const noteDetailMap = root?.note?.noteDetailMap;
    if (noteDetailMap && typeof noteDetailMap === 'object') {
      for (const entry of Object.values(noteDetailMap)) {
        const note = (entry as any)?.note;
        if (!note) continue;
        const images = (note.imageList || [])
          .map((img: any) => {
            const infoList = img?.infoList || [];
            const best = infoList.find((i: any) => i?.imageScene === 'WB_DFT' && i?.url) ||
                         infoList.find((i: any) => typeof i?.url === 'string' && i.url.startsWith('http'));
            return best?.url || img?.url;
          })
          .filter((u: any): u is string => typeof u === 'string' && u.startsWith('http'));

        return {
          title: note.title || undefined,
          fullText: note.desc || undefined,
          images,
          author: note.user?.nickname || note.user?.name || undefined,
          publishTime: typeof note.time === 'number' ? new Date(note.time).toISOString() : undefined,
          locationText: note.ipLocation || undefined,
          locationAddress: undefined,
          lat: undefined,
          lng: undefined,
        };
      }
    }
  }
  return null;
}

function parseFromHtml(html: string): ExtractedXhsPost {
  const states = parseStateJson(html);

  // Try known structures first (more reliable)
  const structured = extractFromKnownStructures(states);
  if (structured && hasMeaningfulContent(structured)) {
    return structured;
  }

  // Fall back to generic deep traversal
  const context = {
    images: new Set<string>(),
    longText: [] as string[],
    titles: [] as string[],
    authors: [] as string[],
    locationNames: [] as string[],
    locationAddresses: [] as string[],
    publishTimes: [] as string[],
    coords: [] as Array<{ lat: number; lng: number }>,
  };

  for (const state of states) {
    collectFromUnknown(state, context);
  }

  const ogTitle = extractMeta(html, 'og:title');
  const ogDescription = extractMeta(html, 'og:description') || extractMeta(html, 'description');
  const ogImage = extractMeta(html, 'og:image');
  if (ogImage && looksLikeImageUrl(ogImage)) {
    context.images.add(ogImage);
  }

  const title = chooseBest([ogTitle || '', ...context.titles], 2);
  const fullText = chooseBest([ogDescription || '', ...context.longText], 20);
  const author = chooseBest(context.authors, 2);
  const publishTime = chooseBest(context.publishTimes, 4) || extractMeta(html, 'article:published_time');
  const locationText = chooseBest(context.locationNames, 2);
  const locationAddress = chooseBest(context.locationAddresses, 4);
  const coords = context.coords[0];

  const images = Array.from(context.images)
    .filter((image) => image.startsWith('http'))
    .slice(0, 60);

  return {
    title,
    fullText,
    images,
    author,
    publishTime,
    locationText,
    locationAddress,
    lat: coords?.lat,
    lng: coords?.lng,
  };
}

function hasMeaningfulContent(post: ExtractedXhsPost): boolean {
  return Boolean(
    post.title ||
    (post.fullText && post.fullText.length > 15) ||
    (post.images && post.images.length > 0)
  );
}

function mapApiNoteToPost(item: any): ExtractedXhsPost {
  const card = item?.note_card || {};
  const images = (card?.image_list || [])
    .map((image: any) => {
      const infoList = image?.info_list || [];
      const best = infoList.find((it: any) => typeof it?.url === 'string' && it.url.startsWith('http'));
      return best?.url;
    })
    .filter((url: string | undefined): url is string => Boolean(url));

  const poi = card?.poi || {};

  return {
    title: card?.title,
    fullText: card?.desc,
    images,
    author: card?.user?.nickname,
    publishTime: typeof card?.time === 'number' ? new Date(card.time).toISOString() : undefined,
    locationText: poi?.name,
    locationAddress: poi?.address,
    lat: typeof poi?.latitude === 'number' ? poi.latitude : undefined,
    lng: typeof poi?.longitude === 'number' ? poi.longitude : undefined,
  };
}

function parseNoteTarget(url: string): { noteId: string; xsecToken?: string; xsecSource: string } {
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const noteId = segments[segments.length - 1] || '';
  return {
    noteId,
    xsecToken: parsed.searchParams.get('xsec_token') || undefined,
    xsecSource: parsed.searchParams.get('xsec_source') || 'pc_search',
  };
}

async function extractViaWebApi(url: string, cookieStr: string): Promise<ExtractedXhsPost> {
  const { noteId, xsecToken, xsecSource } = parseNoteTarget(url);
  if (!noteId) {
    throw new Error('invalid_note_url');
  }

  const payload: Record<string, unknown> = {
    source_note_id: noteId,
    image_formats: ['jpg', 'webp', 'avif'],
    extra: { need_body_topic: '1' },
    xsec_source: xsecSource,
  };
  if (xsecToken) {
    payload.xsec_token = xsecToken;
  }

  const response = await fetch('https://edith.xiaohongshu.com/api/sns/web/v1/feed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://www.xiaohongshu.com',
      'Referer': 'https://www.xiaohongshu.com/',
      'User-Agent': REQUEST_HEADERS['User-Agent'],
      'Accept-Language': REQUEST_HEADERS['Accept-Language'],
      'Cookie': getCookieHeader(cookieStr) || '',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`api_http_${response.status}`);
  }

  const json = await response.json() as any;
  if (!json?.success || !json?.data?.items?.[0]) {
    throw new Error(json?.msg || 'api_response_invalid');
  }

  return mapApiNoteToPost(json.data.items[0]);
}

/**
 * Convert a desktop XHS URL to mobile format.
 * Mobile pages are more likely to return full SSR content without auth.
 */
function toMobileUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Already mobile
    if (parsed.hostname === 'm.xiaohongshu.com') return null;
    if (parsed.hostname === 'www.xiaohongshu.com' || parsed.hostname === 'xiaohongshu.com') {
      // /explore/<noteId> → /discovery/item/<noteId>
      const exploreMatch = parsed.pathname.match(/\/explore\/([a-f0-9]+)/);
      if (exploreMatch) {
        return `https://m.xiaohongshu.com/discovery/item/${exploreMatch[1]}${parsed.search}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchWithRetry(
  url: string,
  cookieStr?: string,
  maxAttempts = 2,
): Promise<{ html: string }> {
  let lastError: Error | null = null;
  const cookieHeader = getCookieHeader(cookieStr);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const headers = buildHeaders();
    if (cookieHeader) headers.Cookie = cookieHeader;

    try {
      const response = await fetch(url, { redirect: 'follow', headers });

      if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new Error('private_or_blocked');
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch Xiaohongshu page (${response.status})`);
      }

      const html = await response.text();
      if (htmlLooksBlocked(html)) {
        lastError = new Error('private_or_blocked');
        continue; // retry with different UA
      }

      return { html };
    } catch (e: any) {
      lastError = e;
      if (e.message === 'private_or_blocked' && attempt < maxAttempts - 1) {
        continue; // retry
      }
    }
  }

  throw lastError || new Error('private_or_blocked');
}

async function extractViaHttp(url: string, cookieStr?: string): Promise<ExtractedXhsPost> {
  // Try the original URL first
  try {
    const { html } = await fetchWithRetry(url, cookieStr);
    const parsed = parseFromHtml(html);
    if (hasMeaningfulContent(parsed)) return parsed;
  } catch (e: any) {
    if (e.message !== 'private_or_blocked') throw e;
  }

  // Fallback: try mobile URL (often returns richer SSR without auth)
  const mobileUrl = toMobileUrl(url);
  if (mobileUrl) {
    try {
      const { html } = await fetchWithRetry(mobileUrl, cookieStr);
      const parsed = parseFromHtml(html);
      if (hasMeaningfulContent(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  throw new Error('private_or_blocked');
}

async function extractViaBrowser(url: string, cookieStr?: string): Promise<ExtractedXhsPost> {
  const playwrightModule = await import('playwright').catch(() => null);
  if (!playwrightModule?.chromium) {
    throw new Error('playwright_not_installed');
  }

  const browser = await playwrightModule.chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      userAgent: REQUEST_HEADERS['User-Agent'],
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': REQUEST_HEADERS['Accept-Language'],
      },
    });

    const parsedCookies = parseCookieString(cookieStr);
    if (parsedCookies.length > 0) {
      const cookies = parsedCookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: '.xiaohongshu.com',
        path: '/',
      }));
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Number(process.env.XHS_PARSE_TIMEOUT_MS || 30000) });
    await page.waitForTimeout(2500);

    let html = '';
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
        html = await page.content();
        break;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(1000);
      }
    }

    if (!html) {
      throw lastError instanceof Error ? lastError : new Error('Unable to read browser page content');
    }

    if (htmlLooksBlocked(html)) {
      throw new Error('private_or_blocked');
    }

    const parsed = parseFromHtml(html);
    if (hasMeaningfulContent(parsed)) {
      return parsed;
    }

    const hydrated = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('script'))
        .map((script) => script.textContent || '')
        .join('\n');
      return {
        title: document.title,
        html: document.documentElement?.outerHTML || '',
        scripts: all,
      };
    });

    const merged = parseFromHtml(`${hydrated.html}\n${hydrated.scripts}`);
    if (!merged.title && hydrated.title) {
      merged.title = hydrated.title;
    }

    return merged;
  } finally {
    await browser.close();
  }
}

export async function extractXhsPost(url: string): Promise<ExtractedXhsPost> {
  const cookieStr = process.env.XHS_COOKIE || '';

  // Stage 1: Fast HTTP extraction (with UA rotation, retry, and mobile fallback)
  try {
    const fastResult = await extractViaHttp(url, cookieStr);
    if (hasMeaningfulContent(fastResult)) {
      return fastResult;
    }
  } catch (error) {
    const msg = String((error as Error)?.message || '');
    if (msg !== 'private_or_blocked') {
      throw error;
    }
  }

  // Stage 2: Web API (requires cookies)
  if (cookieStr) {
    try {
      const apiResult = await extractViaWebApi(url, cookieStr);
      if (hasMeaningfulContent(apiResult)) {
        return apiResult;
      }
    } catch {
      // continue to browser fallback
    }
  }

  // Stage 3: Browser automation (optional, requires Playwright)
  try {
    const browserResult = await extractViaBrowser(url, cookieStr);
    if (hasMeaningfulContent(browserResult)) {
      return browserResult;
    }
  } catch {
    // Playwright not installed or browser failed — that's OK
  }

  throw new Error('private_or_blocked');
}
