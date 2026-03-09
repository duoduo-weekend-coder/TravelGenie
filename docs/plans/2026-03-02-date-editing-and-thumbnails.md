# Editable Travel Dates & List-Import Thumbnails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to edit the trip start date (with day-of-week shown per day column), and enrich list-imported places with photos via the Places API so thumbnails appear on agenda cards.

**Architecture:** Feature 1 adds a date input to the app header and a `setStartDate` store action that recomputes all day dates. Feature 2 modifies `fetchPlaces` in `googleMaps.ts` to call `fetchPlaceDetails` for each list-parsed place, enriching it with photos/types. The ImportModal already handles progressive loading.

**Tech Stack:** React 18, TypeScript, Google Maps Places API (existing), Vite

---

## Task 1: Add `setStartDate` to the Store

**Files:**
- Modify: `src/store.ts:35-47` (the `addDay` function area — add `setStartDate` above it)

**Step 1: Add `setStartDate` function**

Add this function inside `useTripStore()`, right after the `useEffect` block (after line 33) and before `addDay`:

```typescript
const setStartDate = (newStartDate: string) => {
  setTrip(prev => ({
    ...prev,
    startDate: newStartDate,
    days: prev.days.map((day, index) => {
      const d = new Date(newStartDate);
      d.setDate(d.getDate() + index);
      return { ...day, date: d.toISOString().split('T')[0] };
    })
  }));
};
```

**Step 2: Update `addDay` to derive date from `startDate` + index**

Replace the current `addDay` function (lines 35-47) with:

```typescript
const addDay = () => {
  setTrip(prev => {
    const newIndex = prev.days.length;
    const d = new Date(prev.startDate);
    d.setDate(d.getDate() + newIndex);
    const newDay: Day = {
      id: uuid(),
      date: d.toISOString().split('T')[0],
      items: []
    };
    return { ...prev, days: [...prev.days, newDay] };
  });
};
```

**Step 3: Export `setStartDate` from the return object**

Change the return statement (line 182-192) to include `setStartDate`:

```typescript
return {
  trip,
  setStartDate,
  addDay,
  addItem,
  addUnassignedItem,
  removeUnassignedItem,
  updateItem,
  deleteItem,
  moveItem,
  pasteDayItems
};
```

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

---

## Task 2: Add Date Input to App Header

**Files:**
- Modify: `src/App.tsx:20` (destructure `setStartDate` from store)
- Modify: `src/App.tsx:159-168` (header JSX)

**Step 1: Destructure `setStartDate` from the store hook**

Change line 20 from:

```typescript
const { trip, addDay, addItem, addUnassignedItem, updateItem, deleteItem, moveItem, pasteDayItems } = useTripStore();
```

to:

```typescript
const { trip, setStartDate, addDay, addItem, addUnassignedItem, updateItem, deleteItem, moveItem, pasteDayItems } = useTripStore();
```

**Step 2: Add date input to the header**

Replace the header block (lines 159-168) with:

```tsx
<header className="app-header">
  <div className="header-row">
    <h1>{trip.title}</h1>
    <div className="header-actions">
      <input
        type="date"
        className="start-date-input"
        value={trip.startDate}
        onChange={e => setStartDate(e.target.value)}
      />
      <span className="day-count">{trip.days.length} days</span>
      <button className="import-btn" onClick={() => setShowImport(true)}>
        Import from Google Maps
      </button>
    </div>
  </div>
</header>
```

**Step 3: Add CSS for the date input**

Add to `src/index.css`, after the `.day-count` rule (after line 52):

```css
.start-date-input {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: white;
  cursor: pointer;
}

.start-date-input:focus {
  outline: none;
  border-color: #6366f1;
}
```

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

---

## Task 3: Show Day of Week in DayColumn Header

**Files:**
- Modify: `src/components/DayColumn.tsx:26-29` (the `formatDate` function)

**Step 1: Update `formatDate` to include weekday**

Replace lines 26-29:

```typescript
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
```

with:

```typescript
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

---

## Task 4: Enrich List-Imported Places with Photos via Places API

**Files:**
- Modify: `src/googleMaps.ts:187-227` (the `fetchPlaces` function)

**Step 1: Add an `enrichPlace` helper function**

Add this function right before `fetchPlaces` (before line 187):

```typescript
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
      };
    }
  } catch (e) {
    console.warn('Failed to enrich place:', place.name, e);
  }
  return place;
}
```

**Step 2: Modify `fetchPlaces` to enrich list results**

In the `fetchPlaces` function, replace the two blocks that return list results (lines 200-201 and 205-206):

Replace lines 197-212:

```typescript
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
```

Also replace lines 214-222 (the heuristic short-URL block):

```typescript
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
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

---

## Task 5: Visual Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test date editing**

- Change the start date in the header
- Verify all day columns update their dates
- Verify day-of-week (Mon, Tue, etc.) appears in each column header
- Add a new day, verify its date is correct (start + N)

**Step 3: Test list import with thumbnails**

- Click "Import from Google Maps"
- Paste a Google Maps list URL
- Click "Parse URLs"
- Verify place names appear first, then thumbnails load in progressively
- Import the places, verify thumbnails show on agenda cards in the day columns

**Step 4: Verify production build**

Run: `npm run build`
Expected: Build completes without errors

---

## Plan complete!

Save this plan to: `docs/plans/2026-03-02-date-editing-and-thumbnails.md`

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
