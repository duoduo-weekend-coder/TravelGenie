import { describe, expect, it } from 'vitest';

import { classifyImportInput } from './importSources';

describe('classifyImportInput', () => {
  it('classifies xiaohongshu urls', () => {
    expect(classifyImportInput('https://www.xiaohongshu.com/explore/abc')).toBe('xiaohongshu');
    expect(classifyImportInput('https://xhslink.com/abc')).toBe('xiaohongshu');
  });

  it('classifies google maps urls and short links', () => {
    expect(classifyImportInput('https://maps.google.com/?q=abc')).toBe('google_maps');
    expect(classifyImportInput('https://goo.gl/maps/abc')).toBe('google_maps');
    expect(classifyImportInput('https://maps.app.goo.gl/NnicMDnxgKkreb878')).toBe('google_maps');
  });

  it('falls back to text for plain input', () => {
    expect(classifyImportInput('some itinerary note')).toBe('text');
  });
});
