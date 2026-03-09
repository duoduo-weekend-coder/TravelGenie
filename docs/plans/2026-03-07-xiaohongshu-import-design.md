# Xiaohongshu Import Design

## Overview
Add support for Xiaohongshu (小红书) links in the existing planner import flow. When a user pastes a Xiaohongshu link, the app should parse full post content and all images, infer or resolve location data, and create importable agenda items that can be shown on the map when coordinates are available.

## Scope
- Parse Xiaohongshu links from the existing import modal.
- Extract full textual content and all images from a post.
- Extract location metadata and map-friendly coordinates when available.
- Allow partial imports (content/images without mappable coordinates).
- Keep share model public for V1 (anyone with link can use import).

Out of scope (V1):
- User auth/role-based sharing.
- Automated de-duplication across repeated imports.
- Rich in-card image gallery editing.

## Architecture
### Frontend
- Continue using the current React + TypeScript planner.
- Extend import modal to accept mixed input lines (Google Maps links, place names, Xiaohongshu links).
- Detect Xiaohongshu URLs and call a parser backend endpoint.
- Show per-line parse state and preview before import.

### Backend Parser Service
- Add a separate parser service endpoint: `POST /api/parse/xiaohongshu`.
- Use browser automation for extraction reliability on dynamic/anti-bot pages.
- Normalize response into a stable schema for frontend use.
- Resolve location to coordinates when location text is present but coordinates are missing.

### Integration
- Frontend maps parsed payloads into existing `AgendaItem` structure plus source metadata fields.
- Map panel remains unchanged; imported items appear like existing items once `lat/lng` exist.

## Data Model Changes
Extend `AgendaItem` with optional source payload fields:
- `sourceType?: 'manual' | 'google_maps' | 'xiaohongshu'`
- `sourceUrl?: string`
- `sourceMeta?: { author?: string; publishTime?: string }`
- `sourceContent?: { fullText?: string; images?: string[] }`

Mapping rules for Xiaohongshu import:
- `title` <- parsed title fallback to first content line.
- `notes` <- full content text.
- `imageUrl` <- first image (if any).
- `sourceContent.images` <- full image list.
- `location` <- parsed location/address text.
- `lat/lng` <- direct parsed coordinates or geocoded fallback.
- `sourceType` <- `'xiaohongshu'`.
- `sourceUrl` <- original input link.

## API Contract (Parser)
Request:
```json
{
  "url": "https://www.xiaohongshu.com/explore/..."
}
```

Response:
```json
{
  "originalUrl": "...",
  "resolvedUrl": "...",
  "title": "...",
  "author": "...",
  "publishTime": "...",
  "fullText": "...",
  "images": ["https://..."],
  "location": {
    "placeName": "...",
    "addressText": "...",
    "lat": 0,
    "lng": 0,
    "city": "...",
    "country": "...",
    "mapQuery": "...",
    "confidence": 0.0
  },
  "warnings": ["..."],
  "status": "parsed|partial"
}
```

Error response:
```json
{
  "status": "failed",
  "error": "private_or_blocked|rate_limited|unsupported_link|timeout|parse_error",
  "message": "..."
}
```

## Frontend UX
- Keep current import entry point.
- Update copy from “Google Maps import” to generic “Import Places”.
- For each parsed Xiaohongshu line, show:
  - title/place summary
  - image count and preview thumbnail
  - parse status (`parsed`, `partial`, `failed`)
  - optional warning badges
- Imported Xiaohongshu items show a small source badge (`小红书`) in card/list views.
- Edit modal shows source URL and image gallery preview (read-only in V1).

## Parsing and Map Flow
1. User submits lines in import modal.
2. Client classifies each line by source type.
3. For Xiaohongshu lines, call parser endpoint.
4. If `lat/lng` missing and location text exists, attempt geocoding.
5. Build import rows; allow user to include/exclude each row.
6. On import, items are added to unassigned list.
7. Map pins appear for imported items with coordinates.

## Error Handling and Limits
- Per-row asynchronous status updates.
- Partial results stay importable.
- Timeouts and explicit error categories surfaced to user.
- Backend request timeout target: 20-30 seconds.
- Max returned image count in V1: 30.
- Optional image domain allowlist for abuse reduction.

## Testing Strategy
### Frontend
- URL classifier tests for Xiaohongshu domains and redirects.
- Mapping tests from parser payload to `AgendaItem`.
- Import modal integration tests for mixed-source input.

### Backend
- Extractor normalization tests with representative fixtures.
- Contract tests for parser endpoint response schema and error modes.
- Geocode fallback tests for location-only payloads.

### Manual Validation
- Import multiple real Xiaohongshu links.
- Verify full text captured, all images listed, and map pin behavior.
- Verify partial/failed error states remain actionable.

## Deployment Guidance
- Public sharing works when frontend and parser are both publicly deployed.
- Recommended free-tier setup for V1:
  - Frontend: Vercel.
  - Parser backend: Render free web service (expect cold starts after idle).

## Risks
- Site anti-bot changes may degrade extraction and require parser updates.
- Free-tier cold starts can increase parse latency.
- Location metadata may be ambiguous; geocode confidence must be surfaced.
