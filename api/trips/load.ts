import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/kv';

function getKV() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return createClient({ url, token });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const kv = getKV();
  if (!kv) {
    return res.status(503).json({ error: 'Sharing is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.' });
  }

  const shareId = req.query.id as string;
  if (!shareId) {
    return res.status(400).json({ error: 'Missing id parameter' });
  }

  try {
    const trip = await kv.get(`trip:${shareId}`);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or expired' });
    }

    return res.status(200).json({ trip });
  } catch (e: any) {
    console.error('Load trip error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
