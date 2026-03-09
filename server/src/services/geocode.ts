import type { XhsLocation } from '../types/xhs';

export async function geocodeLocation(placeName?: string): Promise<XhsLocation | null> {
  if (!placeName) {
    return null;
  }

  return {
    placeName,
  };
}
