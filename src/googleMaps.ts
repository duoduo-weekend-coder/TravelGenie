/// <reference types="vite/client" />

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

import { PlaceOpeningHours } from './types';

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address?: string;
  lat?: number;
  lng?: number;
  photos?: string[];
  photoUrls?: string[];
  url?: string;
  types?: string[];
  openingHours?: PlaceOpeningHours;
  reservable?: boolean;
  comment?: string;
}

/**
 * Fetch an image URL and convert it to a base64 data URL.
 * This avoids repeated billable Place Photos API calls when the image
 * is rendered in <img> tags on every React re-render.
 */
async function photoToDataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(url); // fallback to original URL
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // fallback to original URL if fetch fails (CORS, etc.)
  }
}

let loadingPromise: Promise<void> | null = null;

async function loadGoogleMapsSDK(): Promise<void> {
  if ((window as any).google?.maps?.places) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,geometry&loading=async&v=beta`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => {
      loadingPromise = null;
      reject(e);
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}

// Helper to wait for the API to fully initialize
async function initMaps() {
  await loadGoogleMapsSDK();
  let attempts = 0;
  while (!(window as any).google?.maps?.places && attempts < 20) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
}

/**
 * Resolve shortened Google Maps URLs (goo.gl, maps.app.goo.gl) to full URLs.
 * Uses the Vite dev server proxy at /api/resolve-url to follow redirects
 * server-side, avoiding browser CORS restrictions.
 */
async function resolveShortUrl(shortUrl: string): Promise<string> {
  try {
    const response = await fetch(`/api/resolve-url?url=${encodeURIComponent(shortUrl)}`);
    const data = await response.json();
    if (data.resolvedUrl && data.resolvedUrl !== shortUrl) {
      console.log('Resolved short URL:', data.resolvedUrl);
      return data.resolvedUrl;
    }
  } catch (e) {
    console.warn('Short URL resolution failed:', e);
  }
  return shortUrl;
}

function extractQuery(url: string): string | null {
  if (!url.startsWith('http')) return url; // Not a URL — treat as direct query

  // If still a goo.gl URL (resolution failed), return as-is
  if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
    return url;
  }

  // Pattern 1: /place/Name+Of+Place/
  const placeMatch = url.match(/\/place\/([^\/@?]+)/);
  if (placeMatch) return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));

  // Pattern 2: /search/Name
  const searchMatch = url.match(/\/search\/([^\/@?]+)/);
  if (searchMatch) return decodeURIComponent(searchMatch[1].replace(/\+/g, ' '));

  // Pattern 3: query=Name or q=Name
  const queryMatch = url.match(/[?&]q(?:uery)?=([^&]+)/);
  if (queryMatch) return decodeURIComponent(queryMatch[1].replace(/\+/g, ' '));

  // Fallback: use the full URL as query
  return url;
}

const PLACE_CACHE_KEY = 'travel-place-cache';

type PlaceCache = Record<string, PlaceDetails>;

function loadPlaceCache(): PlaceCache {
  try {
    const raw = localStorage.getItem(PLACE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PlaceCache;
  } catch {
    return {};
  }
}

function writePlaceCache(cache: PlaceCache): void {
  localStorage.setItem(PLACE_CACHE_KEY, JSON.stringify(cache));
}

export async function fetchPlaceDetails(input: string): Promise<PlaceDetails | null> {
  let url = input;

  // Resolve shortened URLs to full Google Maps URLs first
  if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
    console.log('Resolving shortened URL:', url);
    url = await resolveShortUrl(url);
    console.log('Resolved to:', url);
  }

  const query = extractQuery(url);
  if (!query) return null;

  const normalizedQuery = query.trim().toLowerCase();

  // Check place cache BEFORE loading the SDK to avoid unnecessary API initialization
  const cache = loadPlaceCache();
  if (cache[normalizedQuery]) {
    console.log('Place cache hit for:', normalizedQuery);
    return cache[normalizedQuery];
  }

  // Only load the Maps SDK when we actually need to call the API
  await initMaps();

  console.log('Searching for:', query);

  try {
    const { Place } = (window as any).google.maps.places;

    // Only request Basic-tier fields to avoid Preferred/Advanced pricing.
    // Photos and openingHours are fetched on-demand via fetchPlaceExtras().
    const request = {
      textQuery: query,
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI', 'types'],
    };

    const { places } = await Place.searchByText(request);

    if (places && places.length > 0) {
      const place = places[0];

      const result: PlaceDetails = {
        place_id: place.id,
        name: place.displayName,
        formatted_address: place.formattedAddress,
        lat: place.location?.lat(),
        lng: place.location?.lng(),
        photos: [],
        url: place.googleMapsURI,
        types: place.types,
      };

      // Write to cache — photos and openingHours are fetched lazily
      // via fetchPlaceExtras() only when the user views a specific place.
      cache[normalizedQuery] = result;
      writePlaceCache(cache);

      return result;
    } else {
      console.warn('Places API returned no results for:', query);
      return null;
    }
  } catch (e) {
    console.error('Google Maps API Error:', e);
    return null;
  }
}

export async function fetchMultiplePlaces(urls: string[]): Promise<(PlaceDetails | null)[]> {
  const results = await Promise.all(urls.map(url => fetchPlaceDetails(url)));
  return results;
}

/**
 * Lazily fetch expensive fields (photos, openingHours) for a place by ID.
 * Uses Place Details (cheaper than Text Search) and only called when the user
 * actually views/edits a specific place.
 */
export async function fetchPlaceExtras(placeId: string): Promise<{ photos?: string[]; photoUrls?: string[]; openingHours?: PlaceOpeningHours } | null> {
  await initMaps();

  // Check if extras are already cached for this place (and already converted to data URLs)
  const cache = loadPlaceCache();
  const cacheKey = Object.keys(cache).find(k => cache[k].place_id === placeId);
  if (cacheKey) {
    const cached = cache[cacheKey];
    const hasLocalPhotos = cached.photos && cached.photos.length > 0 &&
      !cached.photos.some(p => isGooglePhotoUrl(p));
    if (hasLocalPhotos || cached.openingHours) {
      return { photos: cached.photos, photoUrls: cached.photoUrls, openingHours: cached.openingHours };
    }
  }

  try {
    const { Place } = (window as any).google.maps.places;
    const place = new Place({ id: placeId });
    await place.fetchFields({ fields: ['photos', 'regularOpeningHours'] });

    let photos: string[] = [];
    let photoUrls: string[] = [];
    if (place.photos && place.photos.length > 0) {
      const rawUrl = place.photos[0].getURI({ maxWidth: 400, maxHeight: 400 });
      photoUrls = [rawUrl];
      photos = [await photoToDataUrl(rawUrl)];
    }

    const openingHours: PlaceOpeningHours | undefined = place.regularOpeningHours ? {
      periods: place.regularOpeningHours.periods?.map((p: any) => ({
        open: { day: p.open.day, hour: p.open.hour, minute: p.open.minute },
        close: p.close ? { day: p.close.day, hour: p.close.hour, minute: p.close.minute } : null
      })) || [],
      weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions || []
    } : undefined;

    // Update cache with extras
    if (cacheKey) {
      cache[cacheKey] = { ...cache[cacheKey], photos, photoUrls, openingHours };
      writePlaceCache(cache);
    }

    return { photos, photoUrls, openingHours };
  } catch (e) {
    console.error('fetchPlaceExtras error:', e);
    return null;
  }
}

/**
 * Detect if a resolved URL points to a Google Maps list/collection.
 */
function isListUrl(url: string): boolean {
  // List URLs resolve to patterns like /maps/@/data=... or /maps/placelists/...
  return /\/maps\/@[^/]*\/data=/.test(url) || /\/maps\/placelists\//.test(url);
}

/**
 * Fetch all places from a Google Maps list URL via the server-side /api/fetch-list endpoint.
 */
async function fetchListPlaces(url: string): Promise<PlaceDetails[]> {
  const response = await fetch(`/api/fetch-list?url=${encodeURIComponent(url)}`);
  const data = await response.json();

  if (data.error) {
    if (data.isNotList) return []; // Not actually a list — caller should fall back
    throw new Error(data.error);
  }

  return (data.places || []).map((p: any, i: number) => ({
    place_id: `list-place-${i}`,
    name: p.name,
    formatted_address: p.address || undefined,
    lat: p.lat ?? undefined,
    lng: p.lng ?? undefined,
    photos: [],
    url: undefined,
    types: [],
    comment: p.comment || undefined,
  }));
}

async function enrichPlace(place: PlaceDetails): Promise<PlaceDetails> {
  if (!place.name) return place;

  // Skip the expensive API call if we already have coordinates —
  // photos and opening hours are fetched lazily when the user views the item.
  if (place.lat != null && place.lng != null) {
    return place;
  }

  try {
    const enriched = await fetchPlaceDetails(place.name);
    if (enriched) {
      return {
        ...place,
        place_id: enriched.place_id,
        types: enriched.types && enriched.types.length > 0 ? enriched.types : place.types,
        formatted_address: enriched.formatted_address || place.formatted_address,
        lat: place.lat ?? enriched.lat,
        lng: place.lng ?? enriched.lng,
      };
    }
  } catch (e) {
    console.warn('Failed to enrich place:', place.name, e);
  }
  return place;
}

/**
 * Universal entry point: resolves a short URL, detects list vs single place,
 * and returns an array of PlaceDetails (1 for single, many for list).
 */
export async function fetchPlaces(input: string): Promise<PlaceDetails[]> {
  let url = input;

  // Resolve shortened URLs first
  if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
    url = await resolveShortUrl(url);
    console.log('Resolved URL:', url);
  }

  // Check if it's a list URL (resolved URL has /maps/@/data= pattern)
  if (isListUrl(url)) {
    console.log('Detected list URL, fetching list...');
    let listPlaces = await fetchListPlaces(url);

    if (listPlaces.length === 0 && input !== url) {
      listPlaces = await fetchListPlaces(input);
    }

    if (listPlaces.length > 0) {
      // Enrich each place with photos/types from Places API
      const enriched = await Promise.all(listPlaces.map(p => enrichPlace(p)));
      return enriched;
    }

    throw new Error('Could not extract places from this Google Maps list. Check the server console for details.');
  }

  // For short URLs that didn't resolve to a list pattern, try list fetch as a heuristic
  if (input.includes('goo.gl') || input.includes('maps.app.goo.gl')) {
    try {
      const listPlaces = await fetchListPlaces(input);
      if (listPlaces.length > 0) {
        const enriched = await Promise.all(listPlaces.map(p => enrichPlace(p)));
        return enriched;
      }
    } catch {
      // Not a list — continue with single place lookup
    }
  }

  // Single place — pass the resolved URL to avoid redundant short-URL resolution
  const details = await fetchPlaceDetails(url);
  return details ? [details] : [];
}

/**
 * Re-fetch a Google Maps list and return only places not already in the trip.
 * Uses the place cache for enrichment, so known places won't trigger API calls.
 */
export async function syncGoogleMapsList(
  url: string,
  existingNames: Set<string>
): Promise<PlaceDetails[]> {
  // Resolve short URL if needed
  let resolvedUrl = url;
  if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
    resolvedUrl = await resolveShortUrl(url);
  }

  // Fetch current list contents from server (always fresh scrape)
  let listPlaces = await fetchListPlaces(resolvedUrl);
  if (listPlaces.length === 0 && resolvedUrl !== url) {
    listPlaces = await fetchListPlaces(url);
  }

  // Filter out places already in the trip
  const newPlaces = listPlaces.filter(
    p => !existingNames.has(p.name.trim().toLowerCase())
  );

  if (newPlaces.length === 0) return [];

  // Enrich new places (cache will handle known names cheaply)
  const enriched = await Promise.all(newPlaces.map(p => enrichPlace(p)));
  return enriched;
}

function isGooglePhotoUrl(url: string): boolean {
  return url.includes('places.googleapis.com') ||
    url.includes('maps.googleapis.com/maps/api/place/photo') ||
    url.includes('lh3.googleusercontent.com');
}

/**
 * Migrate Google Places photo URLs in a trip's agenda items to base64 data URLs.
 * This is a one-time migration — after conversion, photos render locally
 * without making billable Place Photos API calls.
 * Returns a list of [itemId, field, dataUrl] tuples for items that were migrated.
 */
export async function migrateGooglePhotoUrls(
  items: { id: string; imageUrl?: string; googlePlacePhoto?: string }[]
): Promise<{ id: string; imageUrl?: string; googlePlacePhoto?: string }[]> {
  const toMigrate = items.filter(
    item => (item.imageUrl && isGooglePhotoUrl(item.imageUrl)) ||
            (item.googlePlacePhoto && isGooglePhotoUrl(item.googlePlacePhoto))
  );

  if (toMigrate.length === 0) return [];

  const results = await Promise.all(
    toMigrate.map(async (item) => {
      const updates: { id: string; imageUrl?: string; googlePlacePhoto?: string } = { id: item.id };
      if (item.imageUrl && isGooglePhotoUrl(item.imageUrl)) {
        updates.imageUrl = await photoToDataUrl(item.imageUrl);
      }
      // Keep googlePlacePhoto as the original URL (not base64) so it
      // survives localStorage stripping and works as a fallback on devices
      // that don't have the base64 version in IndexedDB.
      if (item.googlePlacePhoto && isGooglePhotoUrl(item.googlePlacePhoto)) {
        const dataUrl = await photoToDataUrl(item.googlePlacePhoto);
        // Store base64 in imageUrl (goes to IndexedDB), keep URL in googlePlacePhoto
        if (!updates.imageUrl) updates.imageUrl = dataUrl;
        updates.googlePlacePhoto = item.googlePlacePhoto; // preserve original URL
      }
      return updates;
    })
  );

  return results;
}

export function getCategoryFromTypes(types: string[]): 'transport' | 'food' | 'activity' | 'accommodation' | 'other' {
  const categoryMap: Record<string, 'transport' | 'food' | 'activity' | 'accommodation' | 'other'> = {
    'airport': 'transport',
    'train_station': 'transport',
    'transit_station': 'transport',
    'bus_station': 'transport',
    'parking': 'transport',
    'gas_station': 'transport',
    'restaurant': 'food',
    'cafe': 'food',
    'bar': 'food',
    'food': 'food',
    'meal_takeaway': 'food',
    'meal_delivery': 'food',
    'lodging': 'accommodation',
    'hotel': 'accommodation',
    'hostel': 'accommodation',
    'motel': 'accommodation',
    'resort': 'accommodation',
    'park': 'activity',
    'museum': 'activity',
    'gallery': 'activity',
    'library': 'activity',
    'theater': 'activity',
    'amusement_park': 'activity',
    'zoo': 'activity',
    'aquarium': 'activity',
    'tourist_attraction': 'activity',
    'point_of_interest': 'activity',
    'establishment': 'other'
  };

  for (const type of types) {
    if (categoryMap[type]) return categoryMap[type];
  }
  return 'other';
}
