# Larger Pins + Day Routes — Design

## Pin Size
Increase from 12px to 20px. Highlighted scale stays at 1.5x (30px), dimmed at 0.8x (16px).

## Day Routes
Use Google Maps Directions Service (client-side) to compute driving routes between sequential places in each day. Draw a google.maps.Polyline per day in that day's color. When a day is focused, other routes dim (opacity 0.15). When no day focused, all routes at moderate opacity (0.6).

## Route Computation
For each day with 2+ mappable items, request a route with first item as origin, last as destination, middle items as waypoints. Cache results so routes aren't re-fetched on every render. Routes recompute when items change.

## Changes
- MapPanel.tsx — Pin size 12→20, add route drawing with DirectionsService + Polyline, colored by day, dimmed when not focused
