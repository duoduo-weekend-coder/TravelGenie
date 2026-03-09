import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseXiaohongshuPayload } from '../../server/src/routes/parseXiaohongshu';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'object' ? req.body : {};
    const response = await parseXiaohongshuPayload(body);
    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(500).json({
      status: 'failed',
      errorCode: 'unknown',
      errorMessage: error?.message || 'Unexpected parser error',
    });
  }
}
