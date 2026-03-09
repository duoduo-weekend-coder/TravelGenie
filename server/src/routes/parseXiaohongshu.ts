import type { IncomingMessage, ServerResponse } from 'node:http';

import { geocodeLocation } from '../services/geocode';
import { extractXhsPost } from '../services/xhsExtractor';
import type { ExtractedXhsPost, XhsErrorCode, XhsNormalizedResponse } from '../types/xhs';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_IMAGE_LIMIT = 30;

export interface ParseXhsDependencies {
  extractPost: (url: string) => Promise<ExtractedXhsPost>;
  geocode: (placeName?: string) => Promise<{ placeName?: string; address?: string; lat?: number; lng?: number } | null>;
  resolveUrl: (url: string) => Promise<string>;
  timeoutMs: number;
  imageLimit: number;
}

function isXiaohongshuUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host.includes('xiaohongshu.com') || host.includes('xhslink.com');
  } catch {
    return false;
  }
}

async function defaultResolveUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!parsed.hostname.includes('xhslink.com')) {
    return url;
  }

  const response = await fetch(url, { redirect: 'follow' });
  return response.url || url;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function mapErrorCode(error: unknown): XhsErrorCode {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('private') || message.includes('blocked')) return 'private_or_blocked';
  return 'unknown';
}

function normalizeFailure(originalUrl: string, code: XhsErrorCode, errorMessage: string): XhsNormalizedResponse {
  return {
    status: 'failed',
    originalUrl,
    errorCode: code,
    errorMessage,
  };
}

function normalizeSuccess(
  originalUrl: string,
  resolvedUrl: string,
  extracted: ExtractedXhsPost,
  geocoded: { placeName?: string; address?: string; lat?: number; lng?: number } | null,
  imageLimit: number
): XhsNormalizedResponse {
  const warnings: string[] = [];
  const images = (extracted.images || []).slice(0, imageLimit);

  if ((extracted.images || []).length > imageLimit) {
    warnings.push(`image list truncated to ${imageLimit}`);
  }

  const finalLat = geocoded?.lat ?? extracted.lat;
  const finalLng = geocoded?.lng ?? extracted.lng;

  if (typeof finalLat !== 'number' || typeof finalLng !== 'number') {
    warnings.push('location not resolved');
  }

  return {
    status: typeof finalLat === 'number' && typeof finalLng === 'number' ? 'parsed' : 'partial',
    originalUrl,
    resolvedUrl,
    title: extracted.title,
    fullText: extracted.fullText,
    images,
    author: extracted.author,
    publishTime: extracted.publishTime,
    location: {
      placeName: geocoded?.placeName || extracted.locationText,
      address: geocoded?.address || extracted.locationAddress,
      lat: finalLat,
      lng: finalLng,
    },
    warnings,
  };
}

export async function parseXiaohongshuPayload(
  payload: { url?: string },
  deps?: Partial<ParseXhsDependencies>
): Promise<XhsNormalizedResponse> {
  const url = payload.url?.trim() || '';

  if (!isXiaohongshuUrl(url)) {
    return normalizeFailure(url, 'unsupported_link', 'Only xiaohongshu.com and xhslink.com URLs are supported');
  }

  const mergedDeps: ParseXhsDependencies = {
    extractPost: deps?.extractPost || extractXhsPost,
    geocode: deps?.geocode || geocodeLocation,
    resolveUrl: deps?.resolveUrl || defaultResolveUrl,
    timeoutMs: deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    imageLimit: deps?.imageLimit ?? DEFAULT_IMAGE_LIMIT,
  };

  try {
    const resolvedUrl = await mergedDeps.resolveUrl(url);
    const extracted = await withTimeout(mergedDeps.extractPost(resolvedUrl), mergedDeps.timeoutMs);
    const geocoded = await withTimeout(mergedDeps.geocode(extracted.locationText), mergedDeps.timeoutMs);
    return normalizeSuccess(url, resolvedUrl, extracted, geocoded, mergedDeps.imageLimit);
  } catch (error) {
    const mappedCode = mapErrorCode(error);
    const code = mappedCode === 'unknown' && String((error as Error)?.message || '').toUpperCase() === 'TIMEOUT'
      ? 'timeout'
      : mappedCode;

    const message = code === 'timeout'
      ? 'Parser timed out while extracting this post'
      : String((error as Error)?.message || 'Parser failed');

    return normalizeFailure(url, code, message);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function handleParseXiaohongshuRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const response = await parseXiaohongshuPayload(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (error: any) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'failed',
      errorCode: 'unknown',
      errorMessage: error?.message || 'Unexpected parser error',
    }));
  }
}
