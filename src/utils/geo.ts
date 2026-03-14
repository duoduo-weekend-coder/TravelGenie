import { AgendaItem } from '../types';

interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371; // Earth radius in km

export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export interface ItemWithDistance {
  item: AgendaItem;
  dayIndex: number;
  dayLabel: string;
  distance: number | null; // null = no coordinates
  distanceLabel: string;
}

export function sortByDistance(
  userPos: LatLng,
  items: { item: AgendaItem; dayIndex: number; dayLabel: string }[]
): ItemWithDistance[] {
  const withDist: ItemWithDistance[] = items.map(({ item, dayIndex, dayLabel }) => {
    if (item.lat != null && item.lng != null) {
      const km = haversineDistance(userPos, { lat: item.lat, lng: item.lng });
      return { item, dayIndex, dayLabel, distance: km, distanceLabel: formatDistance(km) };
    }
    return { item, dayIndex, dayLabel, distance: null, distanceLabel: 'No location' };
  });

  withDist.sort((a, b) => {
    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });

  return withDist;
}
