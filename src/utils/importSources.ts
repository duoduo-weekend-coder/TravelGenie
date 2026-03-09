export type ImportInputType = 'xiaohongshu' | 'google_maps' | 'text';

const XHS_HOSTS = new Set(['xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com', 'www.xhslink.com']);
const GOOGLE_MAPS_HOSTS = new Set([
  'maps.google.com',
  'www.google.com',
  'google.com',
  'goo.gl',
  'maps.app.goo.gl'
]);

function tryParseUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

export function classifyImportInput(input: string): ImportInputType {
  const parsed = tryParseUrl(input);

  if (!parsed) {
    return 'text';
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  if (XHS_HOSTS.has(host) || host.endsWith('.xiaohongshu.com') || host.endsWith('.xhslink.com')) {
    return 'xiaohongshu';
  }

  if (
    GOOGLE_MAPS_HOSTS.has(host) ||
    host.endsWith('.google.com') ||
    path.startsWith('/maps') ||
    path.startsWith('/maps/') ||
    (host === 'goo.gl' && path.startsWith('/maps'))
  ) {
    return 'google_maps';
  }

  return 'text';
}
