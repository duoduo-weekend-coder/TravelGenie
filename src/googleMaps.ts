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
  url?: string;
  types?: string[];
  openingHours?: PlaceOpeningHours;
  reservable?: boolean;
  comment?: string;
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
  await initMaps();

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

  // Check place cache
  const cache = loadPlaceCache();
  if (cache[normalizedQuery]) {
    console.log('Place cache hit for:', normalizedQuery);
    return cache[normalizedQuery];
  }

  console.log('Searching for:', query);

  try {
    const { Place } = (window as any).google.maps.places;

    const request = {
      textQuery: query,
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'photos', 'googleMapsURI', 'types', 'regularOpeningHours'],
    };

    const { places } = await Place.searchByText(request);

    if (places && places.length > 0) {
      const place = places[0];

      let photos: string[] = [];
      if (place.photos && place.photos.length > 0) {
        photos = [place.photos[0].getURI({ maxWidth: 400, maxHeight: 400 })];
      }

      const result: PlaceDetails = {
        place_id: place.id,
        name: place.displayName,
        formatted_address: place.formattedAddress,
        lat: place.location?.lat(),
        lng: place.location?.lng(),
        photos,
        url: place.googleMapsURI,
        types: place.types,
        openingHours: place.regularOpeningHours ? {
          periods: place.regularOpeningHours.periods?.map((p: any) => ({
             open: { day: p.open.day, hour: p.open.hour, minute: p.open.minute },
             close: p.close ? { day: p.close.day, hour: p.close.hour, minute: p.close.minute } : null
          })) || [],
          weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions || []
        } : undefined
        // reservable field removed to prevent API error
      };

      // Write to cache
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
  try {
    const enriched = await fetchPlaceDetails(place.name);
    if (enriched) {
      return {
        ...place,
        photos: enriched.photos && enriched.photos.length > 0 ? enriched.photos : place.photos,
        types: enriched.types && enriched.types.length > 0 ? enriched.types : place.types,
        formatted_address: enriched.formatted_address || place.formatted_address,
        lat: place.lat ?? enriched.lat,
        lng: place.lng ?? enriched.lng,
        openingHours: enriched.openingHours || place.openingHours,
        reservable: enriched.reservable ?? place.reservable
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
