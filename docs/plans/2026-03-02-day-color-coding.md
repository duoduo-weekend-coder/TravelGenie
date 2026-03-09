# Day Color Coding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Color-code each day, color map pins by day, and highlight a day's pins when clicking its column header.

**Architecture:** A shared `DAY_COLORS` constant provides the palette. App.tsx builds enriched map items with `dayIndex` attached. A new `focusedDayId` state (separate from the existing `selectedDayId` used for modals) controls which day's pins are highlighted. DayColumn gets a color stripe and click handler. MapPanel colors pins by day and highlights/fits bounds for the focused day.

**Tech Stack:** React 18, TypeScript, @vis.gl/react-google-maps

---

## Task 1: Create Shared DAY_COLORS Constant and MapItem Type

**Files:**
- Create: `src/dayColors.ts`

**Step 1: Create `src/dayColors.ts`**

```typescript
import { AgendaItem } from './types';

export const DAY_COLORS = [
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export const UNASSIGNED_COLOR = '#9ca3af';

export function getDayColor(dayIndex: number): string {
  return DAY_COLORS[dayIndex % DAY_COLORS.length];
}

export interface MapItem extends AgendaItem {
  dayIndex?: number;
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

---

## Task 2: Add Color Stripe and Click Handler to DayColumn

**Files:**
- Modify: `src/components/DayColumn.tsx`

**Step 1: Import `getDayColor` and add new props**

Add import at top (after line 3):
```typescript
import { getDayColor } from '../dayColors';
```

Update the Props interface (lines 6-15) to add:
```typescript
interface Props {
  day: Day;
  dayIndex: number;
  highlightedItemId?: string;
  isFocused?: boolean;
  onDayClick: (dayId: string) => void;
  onItemClick: (item: AgendaItem) => void;
  onAddItem: () => void;
  onCopyDay: (items: AgendaItem[]) => void;
  onPasteDay: (dayId: string) => void;
  hasClipboard: boolean;
}
```

**Step 2: Update the component function signature and add color**

Update line 17 to destructure new props:
```typescript
export function DayColumn({ day, dayIndex, highlightedItemId, isFocused, onDayClick, onItemClick, onAddItem, onCopyDay, onPasteDay, hasClipboard }: Props) {
```

**Step 3: Add color stripe to the header and click handler**

Replace the day-column div and header (lines 32-58) with:
```tsx
<div className={`day-column ${isFocused ? 'day-column-focused' : ''}`}>
  <div
    className="day-column-header"
    style={{ borderTop: `3px solid ${getDayColor(dayIndex)}` }}
    onClick={() => onDayClick(day.id)}
  >
    <div className="day-column-title">
      <span className="day-label" style={{ color: getDayColor(dayIndex) }}>Day {dayIndex + 1}</span>
      <span className="day-date">{formatDate(day.date)}</span>
    </div>
    <div className="day-column-actions" onClick={e => e.stopPropagation()}>
      {day.items.length > 0 && (
        <button
          className="day-action-btn"
          title="Copy day"
          onClick={() => onCopyDay(day.items)}
        >
          copy
        </button>
      )}
      {hasClipboard && (
        <button
          className="day-action-btn paste-btn"
          title="Paste items here"
          onClick={() => onPasteDay(day.id)}
        >
          paste
        </button>
      )}
    </div>
  </div>
```

Note: The `onClick={e => e.stopPropagation()}` on `day-column-actions` prevents copy/paste buttons from triggering the day click.

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: Will fail because App.tsx doesn't pass the new props yet — that's fine, Task 3 fixes it.

---

## Task 3: Wire Up App.tsx with focusedDayId and Enriched Map Items

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add imports**

Add after line 11:
```typescript
import { getDayColor, UNASSIGNED_COLOR, MapItem } from './dayColors';
```

**Step 2: Add `focusedDayId` state**

Add after line 23 (after `highlightedItemId` state):
```typescript
const [focusedDayId, setFocusedDayId] = useState<string | null>(null);
```

**Step 3: Build enriched map items with dayIndex**

Replace the `allItems` block (lines 32-35) with:
```typescript
const allMapItems: MapItem[] = [
  ...trip.days.flatMap((d, dayIdx) =>
    d.items.map(item => ({ ...item, dayIndex: dayIdx }))
  ),
  ...trip.unassignedItems.map(item => ({ ...item, dayIndex: undefined }))
];
```

**Step 4: Add day click handler**

Add after `handleImport` (after line 155):
```typescript
const handleDayClick = (dayId: string) => {
  setFocusedDayId(prev => prev === dayId ? null : dayId);
};
```

**Step 5: Pass new props to DayColumn**

Update the DayColumn JSX (lines 191-201) to:
```tsx
<DayColumn
  key={day.id}
  day={day}
  dayIndex={index}
  highlightedItemId={highlightedItemId}
  isFocused={focusedDayId === day.id}
  onDayClick={handleDayClick}
  onItemClick={handleEditItem}
  onAddItem={() => handleAddItem(day.id)}
  onCopyDay={(items) => setClipboard(items)}
  onPasteDay={(dayId) => { if (clipboard) pasteDayItems(dayId, clipboard); }}
  hasClipboard={!!clipboard}
/>
```

**Step 6: Pass enriched items and focusedDayId to MapPanel**

Replace the MapPanel JSX (line 211) with:
```tsx
<MapPanel items={allMapItems} highlightedItemId={highlightedItemId} focusedDayId={focusedDayId} />
```

**Step 7: Verify build**

Run: `npx tsc --noEmit`
Expected: Will fail on MapPanel props — Task 4 fixes it.

---

## Task 4: Update MapPanel to Color Pins by Day and Highlight Focused Day

**Files:**
- Modify: `src/components/MapPanel.tsx`

**Step 1: Update imports**

Replace line 9:
```typescript
import { AgendaItem } from '../types';
```
with:
```typescript
import { getDayColor, UNASSIGNED_COLOR, MapItem } from '../dayColors';
```

**Step 2: Update Props interface**

Replace lines 13-16:
```typescript
interface Props {
  items: MapItem[];
  highlightedItemId?: string;
  focusedDayId?: string | null;
}
```

**Step 3: Update MapContent to use new props and color pins**

Replace the entire `MapContent` function (lines 18-88) with:
```typescript
function MapContent({ items, highlightedItemId, focusedDayId }: Props) {
  const map = useMap();
  const [infoItem, setInfoItem] = useState<MapItem | null>(null);

  const mappableItems = items.filter(
    (item) => item.lat !== undefined && item.lng !== undefined
  );

  // Determine which day index is focused (for highlighting)
  const focusedDayIndex = focusedDayId
    ? (() => {
        const item = items.find(i => i.dayIndex !== undefined && mappableItems.some(m => m.id === i.id));
        // We need to find the dayIndex for the focusedDayId — but we don't have day IDs here.
        // Instead, find any item that belongs to the focused day.
        return undefined; // placeholder — we'll use a different approach
      })()
    : undefined;

  // Fit bounds when items change or focused day changes
  const fitBounds = useCallback(() => {
    if (!map || mappableItems.length === 0) return;

    const itemsToFit = focusedDayId !== undefined && focusedDayId !== null
      ? mappableItems.filter(i => (i as any)._dayId === focusedDayId)
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

  return (
    <>
      {mappableItems.map((item) => {
        const isHighlighted = item.id === highlightedItemId;
        const pinColor = item.dayIndex !== undefined ? getDayColor(item.dayIndex) : UNASSIGNED_COLOR;
        const isDimmed = focusedDayId !== null && (item as any)._dayId !== focusedDayId && !isHighlighted;

        return (
          <AdvancedMarker
            key={item.id}
            position={{ lat: item.lat!, lng: item.lng! }}
            onClick={() => setInfoItem(item)}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: pinColor,
                border: '2px solid white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                opacity: isDimmed ? 0.3 : (isHighlighted ? 1 : 0.8),
                transform: isHighlighted ? 'scale(1.5)' : (isDimmed ? 'scale(0.8)' : 'scale(1)'),
                transition: 'all 0.2s ease',
              }}
            />
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
```

Wait — there's a problem. The MapPanel receives items with `dayIndex` but doesn't know the `dayId`. We need to also pass `_dayId` on each item so the map can filter by focused day.

**REVISED approach for Task 3 Step 3:** Enrich map items with both `dayIndex` AND `dayId`:

```typescript
export interface MapItem extends AgendaItem {
  dayIndex?: number;
  dayId?: string;
}
```

And in App.tsx:
```typescript
const allMapItems: MapItem[] = [
  ...trip.days.flatMap((d, dayIdx) =>
    d.items.map(item => ({ ...item, dayIndex: dayIdx, dayId: d.id }))
  ),
  ...trip.unassignedItems.map(item => ({ ...item, dayIndex: undefined, dayId: undefined }))
];
```

Then MapPanel uses `item.dayId` instead of `(item as any)._dayId`.

**Full revised MapContent:**

```typescript
function MapContent({ items, highlightedItemId, focusedDayId }: Props) {
  const map = useMap();
  const [infoItem, setInfoItem] = useState<MapItem | null>(null);

  const mappableItems = items.filter(
    (item) => item.lat !== undefined && item.lng !== undefined
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

  useEffect(() => {
    const highlighted = mappableItems.find((i) => i.id === highlightedItemId);
    setInfoItem(highlighted || null);
  }, [highlightedItemId, mappableItems]);

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
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: pinColor,
                border: '2px solid white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                opacity: isDimmed ? 0.3 : (isHighlighted ? 1 : 0.8),
                transform: isHighlighted ? 'scale(1.5)' : (isDimmed ? 'scale(0.8)' : 'scale(1)'),
                transition: 'all 0.2s ease',
              }}
            />
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
```

**Step 4: Update MapPanel export to pass props through**

Replace lines 90-105:
```typescript
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
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

---

## Task 5: Add CSS for Focused Day Column

**Files:**
- Modify: `src/index.css`

**Step 1: Add focused day styles**

Add after the `.day-column` rule (after line 165):

```css
.day-column-focused {
  box-shadow: 0 0 0 2px currentColor, 0 2px 8px rgba(0,0,0,0.12);
}

.day-column-header {
  cursor: pointer;
  user-select: none;
}

.day-column-header:hover {
  background: #f3f4f6;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

---

## Task 6: Visual Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test color coding**

- Verify each day column has a distinct colored stripe at the top
- Verify "Day N" label text matches the stripe color

**Step 3: Test map pin colors**

- Add items with locations to different days
- Verify map pins match the day column colors
- Verify unassigned items show gray pins

**Step 4: Test day click highlighting**

- Click a day column header
- Verify that day's pins are prominent (full size, full opacity)
- Verify other days' pins are dimmed and smaller
- Verify the map zooms to fit the selected day's items
- Click the same day again — verify all pins return to normal
- Click a different day — verify it switches

**Step 5: Production build**

Run: `npm run build`
Expected: Succeeds
