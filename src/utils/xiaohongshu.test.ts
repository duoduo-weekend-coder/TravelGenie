import { describe, expect, it } from 'vitest';

import { mapXhsResponseToAgendaDraft } from './xiaohongshu';

describe('mapXhsResponseToAgendaDraft', () => {
  it('maps parser payload to agenda draft', () => {
    const draft = mapXhsResponseToAgendaDraft({
      originalUrl: 'https://xhs',
      title: 'Cafe',
      fullText: 'Long content',
      images: ['https://img1'],
      location: { placeName: 'Cafe', lat: 1, lng: 2 },
      status: 'parsed'
    });

    expect(draft.sourceType).toBe('xiaohongshu');
    expect(draft.lat).toBe(1);
  });
});
