# Day Color Coding — Design

## Overview
Each day gets a unique color. Map pins match the day's color. Clicking a day column header highlights its pins on the map (toggle on/off).

## Color Palette
Fixed array of 8 visually distinct colors assigned by day index (wrapping):
- Day 1: #f43f5e (rose), Day 2: #f97316 (orange), Day 3: #eab308 (yellow)
- Day 4: #22c55e (green), Day 5: #06b6d4 (cyan), Day 6: #3b82f6 (blue)
- Day 7: #8b5cf6 (violet), Day 8: #ec4899 (pink)

Unassigned items: #9ca3af (gray)

## Day Column
Colored stripe/accent on each day column header using the day's color.

## Map Pins
Items passed to MapPanel enriched with `dayIndex`. Pins colored by day. Unassigned pins gray.

## Day Click Highlight
`selectedDayId` state in App. Click day header to select (click again to deselect). Selected day's pins: full size + opacity. Other pins: smaller + dimmed. Map fits bounds to selected day's items.

## Changes
- **constants** — shared `DAY_COLORS` array
- **App.tsx** — `selectedDayId` state, enriched items with dayIndex, pass to DayColumn + MapPanel
- **DayColumn.tsx** — Color stripe, onClick, selected state
- **MapPanel.tsx** — Color pins by dayIndex, highlight selected day, fit bounds on selection
- **index.css** — Color stripe + selected day styles
