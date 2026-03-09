import type { AgendaItem } from '../types';

export type XhsParseStatus = 'parsed' | 'partial' | 'failed';

export interface XhsLocationPayload {
  placeName?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface XhsParseResponse {
  status: XhsParseStatus;
  originalUrl: string;
  title?: string;
  fullText?: string;
  images?: string[];
  author?: string;
  publishTime?: string;
  location?: XhsLocationPayload;
  warnings?: string[];
  errorCode?: string;
  errorMessage?: string;
}

export async function parseXiaohongshuUrl(url: string): Promise<XhsParseResponse> {
  const response = await fetch('/api/parse/xiaohongshu', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    throw new Error(`Xiaohongshu parse request failed (${response.status})`);
  }

  return response.json() as Promise<XhsParseResponse>;
}

export function mapXhsResponseToAgendaDraft(payload: XhsParseResponse): Omit<AgendaItem, 'id'> {
  const title = payload.title?.trim() || payload.location?.placeName?.trim() || 'Xiaohongshu post';
  const fullText = payload.fullText?.trim();
  const images = payload.images || [];

  return {
    title,
    location: payload.location?.address || payload.location?.placeName || '',
    lat: payload.location?.lat,
    lng: payload.location?.lng,
    category: 'other',
    notes: fullText,
    imageUrl: images[0],
    sourceType: 'xiaohongshu',
    sourceUrl: payload.originalUrl,
    sourceMeta: {
      author: payload.author,
      publishTime: payload.publishTime
    },
    sourceContent: {
      fullText,
      images
    }
  };
}
