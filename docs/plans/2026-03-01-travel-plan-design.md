# Travel Plan Timeline App - Design

## Overview
A drag-and-drop travel planning app with a vertical time axis showing daily agendas, synchronized with an interactive map view.

## UI Structure

### Left Panel (65% width)
- **Header**: Trip title, date range, add day button
- **Timeline**: Vertical scrollable area with days stacked
  - Day header (e.g., "Day 1 - Jan 15, 2026")
  - Draggable agenda cards below each day
  - "+" button to add new item to each day

### Right Panel (35% width)
- Leaflet map with OpenStreetMap tiles
- Markers for all locations
- When item is selected/dragged, highlight its marker
- Click marker to scroll to agenda item

## Agenda Item Card
- **Time** (e.g., "9:00 AM") - left side badge
- **Title** - bold text
- **Location** - with pin icon
- **Thumbnail** - 60x60px image (uploaded or from Google Maps URL)
- **Category color dot**: transport (blue), food (orange), activity (green), accommodation (purple), other (gray)
- **Notes** - truncated to 2 lines, expand on click

## Data Model

```typescript
interface Trip {
  id: string;
  title: string;
  startDate: string;
  days: Day[];
}

interface Day {
  id: string;
  date: string;
  items: AgendaItem[];
}

interface AgendaItem {
  id: string;
  title: string;
  time?: string;
  location?: string;
  googleMapsUrl?: string;
  googlePlaceName?: string;
  googlePlacePhoto?: string;
  notes?: string;
  imageUrl?: string;
  category: 'transport' | 'food' | 'activity' | 'accommodation' | 'other';
}
```

## Interactions

1. **Add Day**: Button at bottom of timeline adds new day
2. **Add Item**: "+" button in each day section
3. **Edit Item**: Click card opens edit modal
4. **Reorder within day**: Drag and drop
5. **Move between days**: Drag card to different day
6. **Map sync**: When item is dragged, its marker highlights
7. **Click marker**: Scrolls timeline to that item

## Google Maps URL Parsing
- Extract place ID from Google Maps URLs
- Fetch place name and photo via Places API (or scrape embed)
- Fallback: show link as-is if parsing fails

## Technical Stack
- React + TypeScript
- Vite for build
- react-beautiful-dnd or @dnd-kit for drag-and-drop
- Leaflet + react-leaflet for map
- LocalStorage for persistence

## Acceptance Criteria
- [ ] Can create trip with multiple days
- [ ] Can add agenda items with all fields
- [ ] Can drag items within a day to reorder
- [ ] Can drag items between days
- [ ] Map updates when items move
- [ ] Can upload images from device
- [ ] Google Maps URLs auto-fetch preview
- [ ] Data persists in localStorage
