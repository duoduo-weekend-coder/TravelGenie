import { describe, expect, it } from 'vitest';

import { parseXiaohongshuPayload } from '../src/routes/parseXiaohongshu';

describe('parseXiaohongshuPayload', () => {
  it('returns parsed response shape with coordinates', async () => {
    const result = await parseXiaohongshuPayload(
      { url: 'https://www.xiaohongshu.com/explore/abc' },
      {
        resolveUrl: async (url) => url,
        extractPost: async () => ({
          title: 'Cafe',
          fullText: 'Long content',
          images: Array.from({ length: 40 }, (_, i) => `https://img${i}`),
          locationText: 'Cafe Shanghai',
          author: 'Author',
          publishTime: '2026-03-07',
        }),
        geocode: async (placeName) => ({
          placeName,
          lat: 31.2,
          lng: 121.5,
        }),
      }
    );

    expect(result.status).toBe('parsed');
    expect(result.location?.lat).toBe(31.2);
    expect(result.images).toHaveLength(30);
    expect(result.warnings).toContain('image list truncated to 30');
  });

  it('returns partial response shape without coordinates', async () => {
    const result = await parseXiaohongshuPayload(
      { url: 'https://xhslink.com/partial' },
      {
        resolveUrl: async (url) => url,
        extractPost: async () => ({
          title: 'No geocode',
          fullText: 'text',
          images: ['https://img1'],
          locationText: 'Unknown place',
        }),
        geocode: async () => null,
      }
    );

    expect(result.status).toBe('partial');
    expect(result.warnings).toContain('location not resolved');
    expect(result.location?.placeName).toBe('Unknown place');
  });

  it('uses extracted coordinates when geocode is unavailable', async () => {
    const result = await parseXiaohongshuPayload(
      { url: 'https://xhslink.com/with-coords' },
      {
        resolveUrl: async (url) => url,
        extractPost: async () => ({
          title: 'Has coords',
          fullText: 'text',
          images: [],
          locationText: 'Pin source',
          lat: 30.1,
          lng: 120.2,
        }),
        geocode: async () => null,
      }
    );

    expect(result.status).toBe('parsed');
    expect(result.location?.lat).toBe(30.1);
    expect(result.location?.lng).toBe(120.2);
  });

  it('returns unsupported_link failure', async () => {
    const result = await parseXiaohongshuPayload({ url: 'https://example.com/not-xhs' });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('unsupported_link');
  });

  it('returns timeout failure', async () => {
    const result = await parseXiaohongshuPayload(
      { url: 'https://www.xiaohongshu.com/explore/slow' },
      {
        timeoutMs: 1,
        resolveUrl: async (url) => url,
        extractPost: async () => new Promise(() => undefined),
        geocode: async () => null,
      }
    );

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('timeout');
  });

  it('returns private_or_blocked failure', async () => {
    const result = await parseXiaohongshuPayload(
      { url: 'https://www.xiaohongshu.com/explore/private' },
      {
        resolveUrl: async (url) => url,
        extractPost: async () => {
          throw new Error('private content blocked by platform');
        },
        geocode: async () => null,
      }
    );

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('private_or_blocked');
  });
});
