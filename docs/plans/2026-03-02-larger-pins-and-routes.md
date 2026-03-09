# Larger Pins + Day Routes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enlarge map pins from 12px to 20px, and draw driving routes between sequential places in each day, colored by day.

**Architecture:** Single file change to MapPanel.tsx. Pin size increase is a CSS value change. Routes use google.maps.DirectionsService to compute driving directions between a day's places, then render google.maps.Polyline objects directly on the map. A useRef cache prevents re-fetching routes when items haven't changed. Each day's route uses getDayColor. When a day is focused, other routes dim.

**Tech Stack:** React, @vis.gl/react-google-maps, Google Maps Directions API

---

## Task 1: Enlarge Pins and Add Route Drawing to MapPanel

**Files:**
- Modify: `src/components/MapPanel.tsx`

**Step 1: Increase pin size**

Change lines 70-71 from:
```typescript
width: 12,
height: 12,
```
to:
```typescript
width: 20,
height: 20,
```

**Step 2: Add useRef import**

Change line 1 from:
```typescript
import { useEffect, useCallback, useState } from 'react';
```
to:
```typescript
import { useEffect, useCallback, useState, useRef } from 'react';
```

**Step 3: Add route types and cache ref**

After line 21 (`const [infoItem, setInfoItem] = useState...`), add:

```typescript
// Route state: one polyline per dayId
const routesRef = useRef<google.maps.Polyline[]>([]);
const routeCacheRef = useRef<Map<string, google.maps.DirectionsResult>>(new Map());
```

**Step 4: Add route drawing effect**

After the info window effect (after line 52), add a new useEffect for routes:

```typescript
// Draw routes for each day
useEffect(() => {
  if (!map) return;

  // Clear existing polylines
  routesRef.current.forEach(p => p.setMap(null));
  routesRef.current = [];

  // Group mappable items by dayId
  const dayGroups = new Map<string, MapItem[]>();
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

    // Build cache key from ordered item IDs
    const cacheKey = dayItems.map(i => i.id).join(',');

    const drawRoute = (result: google.maps.DirectionsResult) => {
      const polyline = new google.maps.Polyline({
        path: result.routes[0].overview_path,
        strokeColor: color,
        strokeOpacity: isFocusedRoute ? 0.7 : 0.15,
        strokeWeight: isFocusedRoute ? 4 : 2,
        map,
      });
      routesRef.current.push(polyline);
    };

    const cached = routeCacheRef.current.get(cacheKey);
    if (cached) {
      drawRoute(cached);
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
          routeCacheRef.current.set(cacheKey, result);
          drawRoute(result);
        }
      }
    );
  });

  return () => {
    routesRef.current.forEach(p => p.setMap(null));
    routesRef.current = [];
  };
}, [map, mappableItems, focusedDayId]);
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

Run: `npm run build`
Expected: Build succeeds

---

## Task 2: Visual Verification

- Start dev server: `npm run dev`
- Verify pins are larger (20px vs 12px before)
- Add 2+ places with locations to a single day
- Verify a driving route polyline appears in that day's color
- Add places to a second day — verify two differently-colored routes
- Click a day column — verify focused day's route is bold (weight 4, opacity 0.7) and other routes dim (weight 2, opacity 0.15)
- Click again to deselect — all routes return to moderate opacity
