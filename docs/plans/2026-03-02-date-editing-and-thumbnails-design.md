# Editable Travel Dates & List-Import Thumbnails — Design

## Feature 1: Editable Trip Start Date + Day of Week

Add a date input next to the trip title in the header. Changing it updates `trip.startDate` and recomputes all day dates (Day N = startDate + N-1). Each day column header shows the day of week.

**Changes:**
- **App header** — add `<input type="date">` for start date, styled inline
- **Store** — add `setStartDate(date)` that updates `trip.startDate` and recomputes each `day.date`
- **DayColumn header** — format to show weekday: "Day 1 — Mon, Mar 2"

## Feature 2: Enrich List-Imported Places with Photos

After the server-side list parser returns names/addresses/coordinates, enrich each place client-side via `fetchPlaceDetails(name)` to get photos, types, and refined addresses.

**Flow:**
1. User pastes list URL → server parses HTML → returns `{name, address, lat, lng}[]`
2. For each place, call `fetchPlaceDetails(name)` client-side → gets photo URL, types, exact address
3. ImportModal rows update progressively (name appears immediately, thumbnail loads in)
4. On import, items get `googlePlacePhoto` populated → AgendaCard already renders thumbnails

**Changes:**
- **`googleMaps.ts`** — `fetchPlaces()` enriches list results by calling `fetchPlaceDetails` per place
- **ImportModal** — already handles progressive loading, just needs to display the new photos
- **No changes to AgendaCard/DayColumn** — they already render `googlePlacePhoto`
