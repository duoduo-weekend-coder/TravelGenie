import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import { getDayColor, UNASSIGNED_COLOR, MapItem } from '../dayColors';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const ROUTE_CACHE_KEY = 'travel-route-cache';
const MAX_ROUTE_CACHE_ENTRIES = 200;

type CachedPath = { lat: number; lng: number }[];

function loadRouteCache(): Record<string, CachedPath> {
  try {
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveRouteCache(cache: Record<string, CachedPath>) {
  const keys = Object.keys(cache);
  if (keys.length > MAX_ROUTE_CACHE_ENTRIES) {
    // Evict oldest entries (first inserted keys)
    const toRemove = keys.slice(0, keys.length - MAX_ROUTE_CACHE_ENTRIES);
    toRemove.forEach(k => delete cache[k]);
  }
  localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(cache));
}

interface Props {
  items: MapItem[];
  highlightedItemId?: string;
  focusedDayId?: string | null;
}

function MapContent({ items, highlightedItemId, focusedDayId }: Props) {
  const map = useMap();
  const [infoItem, setInfoItem] = useState<MapItem | null>(null);
  const routesRef = useRef<google.maps.Polyline[]>([]);
  const routeCacheRef = useRef(loadRouteCache());

  const mappableItems = useMemo(
    () => items.filter((item) => item.lat !== undefined && item.lng !== undefined),
    [items]
  );

  // Fit bounds: zoom to focused day's items, or all items
  const fitBounds = useCallback(() => {
    if (!map || mappableItems.length === 0) return;

    const itemsToFit = focusedDayId
      ? mappableItems.filter(i => i.dayId === focusedDayId)
      : mappableItems;

    if (itemsToFit.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    itemsToFit.forEach((item) => {
      bounds.extend({ lat: item.lat!, lng: item.lng! });
    });
    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
  }, [map, mappableItems, focusedDayId]);

  useEffect(() => {
    fitBounds();
  }, [fitBounds]);

  // Update info window when highlighted item changes
  useEffect(() => {
    const highlighted = mappableItems.find((i) => i.id === highlightedItemId);
    setInfoItem(highlighted || null);
  }, [highlightedItemId, mappableItems]);

  // Draw routes for each day
  useEffect(() => {
    if (!map) return;

    // Clear existing polylines
    routesRef.current.forEach(p => p.setMap(null));
    routesRef.current = [];

    // Group mappable items by dayId
    const dayGroups = new globalThis.Map<string, MapItem[]>();
    mappableItems.forEach(item => {
      if (item.dayId) {
        const group = dayGroups.get(item.dayId) || [];
        group.push(item);
        dayGroups.set(item.dayId, group);
      }
    });

    const directionsService = new google.maps.DirectionsService();

    dayGroups.forEach((dayItems, dayId) => {
      if (dayItems.length < 2) return;

      const dayIndex = dayItems[0].dayIndex ?? 0;
      const color = getDayColor(dayIndex);
      const isFocusedRoute = focusedDayId === null || focusedDayId === undefined || focusedDayId === dayId;

      // Build cache key from ordered item IDs + anchor type
      const cacheKey = dayItems.map(i => `${i.id}-${i.isAnchor || ''}`).join(',');

      const drawPath = (path: { lat: number; lng: number }[]) => {
        const polyline = new google.maps.Polyline({
          path,
          strokeColor: color,
          strokeOpacity: isFocusedRoute ? 0.7 : 0.15,
          strokeWeight: isFocusedRoute ? 4 : 2,
          map,
        });
        routesRef.current.push(polyline);
      };

      // Check persistent cache
      const cached = routeCacheRef.current[cacheKey];
      if (cached) {
        drawPath(cached);
        return;
      }

      const origin = { lat: dayItems[0].lat!, lng: dayItems[0].lng! };
      const destination = { lat: dayItems[dayItems.length - 1].lat!, lng: dayItems[dayItems.length - 1].lng! };
      const waypoints = dayItems.slice(1, -1).map(item => ({
        location: { lat: item.lat!, lng: item.lng! },
        stopover: true,
      }));

      directionsService.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            const path = result.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
            routeCacheRef.current[cacheKey] = path;
            saveRouteCache(routeCacheRef.current);
            drawPath(path);
          }
        }
      );
    });

    return () => {
      routesRef.current.forEach(p => p.setMap(null));
      routesRef.current = [];
    };
  }, [map, mappableItems, focusedDayId]);

  return (
    <>
      {mappableItems.map((item) => {
        const isHighlighted = item.id === highlightedItemId;
        const pinColor = item.dayIndex !== undefined ? getDayColor(item.dayIndex) : UNASSIGNED_COLOR;
        const isDimmed = focusedDayId !== null && focusedDayId !== undefined
          && item.dayId !== focusedDayId && !isHighlighted;

        return (
          <AdvancedMarker
            key={item.id}
            position={{ lat: item.lat!, lng: item.lng! }}
            onClick={() => setInfoItem(item)}
            zIndex={item.isAnchor ? 100 : 1}
          >
            <div
              style={{
                width: item.isAnchor ? 24 : 20,
                height: item.isAnchor ? 24 : 20,
                borderRadius: item.isAnchor ? '4px' : '50%',
                background: item.isAnchor ? (item.isAnchor === 'start' ? '#22c55e' : '#ef4444') : pinColor,
                border: '2px solid white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                opacity: isDimmed ? 0.3 : (isHighlighted ? 1 : 0.9),
                transform: isHighlighted ? 'scale(1.5)' : (isDimmed ? 'scale(0.8)' : 'scale(1)'),
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '10px',
                fontWeight: 'bold',
              }}
            >
              {item.isAnchor === 'start' ? 'S' : item.isAnchor === 'end' ? 'E' : ''}
            </div>
          </AdvancedMarker>
        );
      })}

      {infoItem && infoItem.lat !== undefined && infoItem.lng !== undefined && (
        <InfoWindow
          position={{ lat: infoItem.lat, lng: infoItem.lng }}
          onCloseClick={() => setInfoItem(null)}
          pixelOffset={[0, -10]}
        >
          <div style={{ maxWidth: 200 }}>
            <strong>{infoItem.title}</strong>
            {infoItem.location && <div>{infoItem.location}</div>}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function MapPanel({ items, highlightedItemId, focusedDayId }: Props) {
  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        defaultCenter={{ lat: 40.7128, lng: -74.006 }}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapId="travel-plan-map"
        style={{ width: '100%', height: '100%' }}
      >
        <MapContent items={items} highlightedItemId={highlightedItemId} focusedDayId={focusedDayId} />
      </Map>
    </APIProvider>
  );
}
