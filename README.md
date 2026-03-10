# Travel Plan Timeline

A visual drag-and-drop travel planner that turns scattered bookmarks, XHS posts, and Google Maps saves into a beautifully organized day-by-day itinerary — powered by AI.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Google Maps](https://img.shields.io/badge/Google%20Maps-API-4285F4?logo=googlemaps&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini%20AI-Planner-8E75B2?logo=googlegemini&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deploy-000?logo=vercel&logoColor=white)

---

## How It Works

```
Import places  ──>  Drag & drop onto days  ──>  AI optimizes your route  ──>  Share with friends
```

**1. Collect** — Import from Google Maps lists, Xiaohongshu (小红书) travel posts, text schedules, or add manually.

**2. Plan** — Drag items onto a multi-day timeline with AM/PM slots, time rulers, and accommodation rows. Or let Gemini AI auto-plan the entire trip.

**3. Visualize** — See your itinerary on an interactive map with color-coded markers and calculated routes per day.

**4. Share** — Generate a link. Anyone with the link can view, edit, and re-share — the URL stays the same.

---

## Features

### Core Planning
- **Drag-and-drop timeline** — Move items between days, time slots, and a plan list
- **Per-day AM/PM scheduling** with a visual time ruler (6 AM – 10 PM)
- **Start/end anchors** — Set departure and arrival points per day
- **Blocked periods** — Mark unavailable times on the ruler
- **Resizable day columns** — Drag column edges to adjust width per day
- **Sticky date headers** — Always visible when scrolling

### Smart Import
- **Google Maps** — Search places or paste a saved list URL
- **Xiaohongshu (小红书)** — Paste XHS post links to extract locations, photos, and text
- **Schedule text** — Paste a structured itinerary and auto-parse dates and times
- **JSON import** — Load previously exported trips

### AI-Powered Planning
- **Gemini AI planner** — One-click auto-scheduling that considers:
  - Geographic proximity (clusters nearby places per day)
  - Opening hours and day-of-week availability
  - Blocked periods and existing items
  - Meal timing (breakfast, lunch, dinner windows)
  - Daytime-only activities with dinner before 9 PM
- **Heuristic fallback** — TSP-based planner works without an API key

### Organization
- **Multiple itineraries** — Tab-based switching between trips
- **Plan list filters** — Filter unassigned items by type (food, activity, transport) and region
- **Search** — Full-text search across titles, locations, notes, and categories
- **Bulk operations** — Select all, multi-delete, copy/paste entire days
- **Undo/Redo** — `Cmd+Z` / `Cmd+Shift+Z` with 30-step history

### Map Visualization
- **Color-coded markers** — Each day gets a distinct color
- **Route polylines** — Calculated driving/walking routes between stops
- **Focus mode** — Click a day header to highlight its route
- **Start (S) / End (E) anchors** — Green and red markers for day boundaries

### Sharing & Export
- **Shareable URLs** — Persistent link via Vercel KV (90-day TTL)
- **Collaborative editing** — Edits save back to the same share URL
- **JSON export/import** — Full trip backup with all metadata

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **UI** | React 18 + TypeScript |
| **Build** | Vite 5 |
| **Drag & Drop** | @dnd-kit |
| **Maps** | Google Maps JavaScript API + Places + Directions |
| **AI** | Google Gemini (gemini-3-flash-preview) |
| **Storage** | localStorage + IndexedDB (photos) |
| **Sharing** | Vercel KV (Redis) |
| **Deploy** | Vercel |
| **XHS Parser** | Server-side HTML extraction with UA rotation |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Google Maps API key](https://console.cloud.google.com/) with Places, Directions, and Maps JavaScript APIs enabled
- (Optional) A [Gemini API key](https://aistudio.google.com/app/apikey) for AI planning
- (Optional) [Vercel KV](https://vercel.com/docs/storage/vercel-kv) for trip sharing

### Setup

```bash
git clone <repo-url>
cd travel-plan-timeline
npm install
```

Create a `.env` file:

```env
# Required
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key

# Optional — AI planning
VITE_GEMINI_API_KEY=your_gemini_key

# Optional — trip sharing
KV_REST_API_URL=your_vercel_kv_url
KV_REST_API_TOKEN=your_vercel_kv_token
```

### Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build

```bash
npm run build
npm run preview
```

### Test

```bash
npm run test
```

---

## Project Structure

```
src/
├── App.tsx                 # Main layout, state wiring, DnD context
├── store.ts                # Trip state management (custom hook)
├── types.ts                # Core type definitions
├── googleMaps.ts           # Google Maps/Places/Directions API
├── photoStore.ts           # IndexedDB photo persistence
├── components/
│   ├── DayColumn.tsx       # Day timeline with drop zones & resize
│   ├── PlanList.tsx        # Sidebar with filters & bulk actions
│   ├── MapPanel.tsx        # Google Maps visualization
│   ├── AgendaCard.tsx      # Draggable item card
│   ├── TimeRuler.tsx       # Hour ruler with blocked periods
│   ├── EditModal.tsx       # Item editor dialog
│   ├── ImportModal.tsx     # Multi-source import wizard
│   └── XhsPanel.tsx        # Xiaohongshu link parser panel
├── utils/
│   ├── aiPlanner.ts        # Gemini AI trip optimizer
│   ├── autoPlanner.ts      # Heuristic TSP planner (fallback)
│   ├── scheduleParser.ts   # Text schedule parser
│   ├── shareTrip.ts        # Share URL management
│   └── xiaohongshu.ts      # XHS response mapping
api/                        # Vercel serverless functions
├── trips/save.ts           # Save trip to KV
├── trips/load.ts           # Load trip from KV
├── fetch-list.ts           # Google Maps list extractor
└── resolve-url.ts          # URL shortener resolver
server/                     # XHS parser backend
└── src/services/
    ├── xhsExtractor.ts     # HTML scraping with UA rotation
    └── geocode.ts           # Address → coordinates
```

---

## Xiaohongshu Import

The XHS parser extracts locations, photos, and text from Xiaohongshu travel posts.

- **Frontend endpoint:** `POST /api/parse/xiaohongshu`
- **Features:** User-Agent rotation, rate limiting, image extraction, location detection
- **Recommended hosting split:** Vercel (frontend) + Render (parser runtime)
- Configure timeout and rate-limit controls via environment variables before public sharing

---

## Deploy to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add environment variables in project settings
4. Deploy — Vercel auto-detects the Vite framework

The `vercel.json` is already configured. Serverless functions in `api/` deploy automatically.

---

## License

MIT
