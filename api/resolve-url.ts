import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url as string | undefined;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
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
    return res.status(200).json({ resolvedUrl: url });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
