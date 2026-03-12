import { Trip } from '../types';
import { stripPhotosForStorage } from '../photoStore';

const SHARE_IDS_KEY = 'travel-share-ids'; // maps itineraryId → shareId

function getShareIds(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SHARE_IDS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setShareId(itineraryId: string, shareId: string) {
  const ids = getShareIds();
  ids[itineraryId] = shareId;
  localStorage.setItem(SHARE_IDS_KEY, JSON.stringify(ids));
}

export function getExistingShareId(itineraryId: string): string | undefined {
  return getShareIds()[itineraryId];
}

/** Given a shareId, find the local itinerary already linked to it (if any). */
export function getItineraryByShareId(shareId: string): string | undefined {
  const ids = getShareIds();
  return Object.keys(ids).find(k => ids[k] === shareId);
}

/**
 * Strip photos and POST to /api/trips/save.
 * Returns the share ID (reuses existing if the itinerary was previously shared).
 */
export async function saveSharedTrip(trip: Trip, itineraryId: string): Promise<string> {
  // Strip base64 photos to keep payload small
  const lightTrip: Trip = {
    ...trip,
    days: trip.days.map(day => ({
      ...day,
      items: stripPhotosForStorage(day.items),
      startLocation: day.startLocation
        ? stripPhotosForStorage([day.startLocation])[0]
        : undefined,
      endLocation: day.endLocation
        ? stripPhotosForStorage([day.endLocation])[0]
        : undefined,
    })),
    unassignedItems: stripPhotosForStorage(trip.unassignedItems),
  };

  const existingShareId = getExistingShareId(itineraryId);

  const res = await fetch('/api/trips/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trip: lightTrip, shareId: existingShareId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Save failed (${res.status})`);
  }

  const { shareId } = await res.json();
  setShareId(itineraryId, shareId);
  return shareId;
}

/**
 * Fetch a shared trip by share ID.
 */
export async function loadSharedTrip(shareId: string): Promise<Trip> {
  const res = await fetch(`/api/trips/load?id=${encodeURIComponent(shareId)}`);

  if (res.status === 404) {
    throw new Error('This shared trip was not found or has expired.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Load failed (${res.status})`);
  }

  const { trip } = await res.json();
  return trip as Trip;
}

/**
 * Read `?share=<id>` from the current URL.
 */
export function getShareIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('share');
}

/**
 * Remove the `?share=` param from the URL without reloading.
 */
export function clearShareIdFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  window.history.replaceState({}, '', url.toString());
}
