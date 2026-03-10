import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { nanoid } from 'nanoid';

const MAX_PAYLOAD_BYTES = 900 * 1024; // 900 KB (KV 1 MB limit)
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { trip, shareId: existingShareId } = req.body;

    if (!trip || !trip.title || !trip.days) {
      return res.status(400).json({ error: 'Invalid trip payload' });
    }

    // Check payload size
    const payload = JSON.stringify(trip);
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Trip data too large (max 900 KB). Try removing some items.' });
    }

    const shareId = existingShareId || nanoid(8);
    await kv.set(`trip:${shareId}`, trip, { ex: TTL_SECONDS });

    return res.status(200).json({ shareId });
  } catch (e: any) {
    console.error('Save trip error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
