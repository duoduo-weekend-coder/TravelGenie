# Xiaohongshu Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Xiaohongshu link import that extracts full post text and all images, resolves location data, and imports map-ready agenda items.

**Architecture:** Implement mixed-source parsing in the existing import flow, introduce Xiaohongshu-aware source typing in shared item data, and add a parser backend endpoint that returns normalized content/location payloads. Keep current map rendering and import destination behavior, only extending data mapping and UI preview/badging.

**Tech Stack:** React 18 + TypeScript + Vite frontend, Node.js parser service (Playwright/Puppeteer-compatible), existing Google Maps helper utilities.

---

### Task 1: Add Source-Aware Agenda Types

**Files:**
- Modify: `src/types.ts`

**Step 1: Write the failing type check**
Create `src/types.source-check.ts` temporarily:
```ts
import type { AgendaItem } from './types';

const item: AgendaItem = {
  id: '1',
  title: 'XHS spot',
  category: 'other',
  sourceType: 'xiaohongshu',
  sourceUrl: 'https://www.xiaohongshu.com/explore/abc',
  sourceMeta: { author: 'A' },
  sourceContent: { fullText: 'text', images: ['https://img'] }
};

console.log(item.sourceType);
```

**Step 2: Run type check to verify it fails**
Run: `npm run build`
Expected: FAIL with unknown `sourceType/sourceUrl/sourceMeta/sourceContent` fields.

**Step 3: Write minimal implementation**
Update `AgendaItem` in `src/types.ts` with:
```ts
export type SourceType = 'manual' | 'google_maps' | 'xiaohongshu';

sourceType?: SourceType;
sourceUrl?: string;
sourceMeta?: { author?: string; publishTime?: string };
sourceContent?: { fullText?: string; images?: string[] };
```

**Step 4: Run type check to verify it passes**
Run: `npm run build`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/types.ts
git commit -m "feat: add source metadata fields for imported items"
```

### Task 2: Add URL Source Classification Utilities

**Files:**
- Create: `src/utils/importSources.ts`
- Test: `src/utils/importSources.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**
Create tests for:
- xiaohongshu domains (`xiaohongshu.com`, `xhslink.com`)
- google maps domains and map short links
- plain text fallback

Example test:
```ts
import { classifyImportInput } from './importSources';

it('classifies xiaohongshu urls', () => {
  expect(classifyImportInput('https://www.xiaohongshu.com/explore/abc')).toBe('xiaohongshu');
});
```

**Step 2: Run test to verify it fails**
Run: `npm test -- src/utils/importSources.test.ts`
Expected: FAIL (test runner or module missing).

**Step 3: Write minimal implementation**
- Add Vitest dev deps and script in `package.json`.
- Implement `classifyImportInput(input)` returning `'xiaohongshu' | 'google_maps' | 'text'`.

**Step 4: Run test to verify it passes**
Run: `npm test -- src/utils/importSources.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add package.json package-lock.json src/utils/importSources.ts src/utils/importSources.test.ts
git commit -m "test: add import source classifier and coverage"
```

### Task 3: Add Xiaohongshu Parser Client in Frontend

**Files:**
- Create: `src/utils/xiaohongshu.ts`
- Test: `src/utils/xiaohongshu.test.ts`

**Step 1: Write the failing test**
Add contract mapping test that verifies parser response is transformed to import-ready payload:
```ts
import { mapXhsResponseToAgendaDraft } from './xiaohongshu';

it('maps parser payload to agenda draft', () => {
  const draft = mapXhsResponseToAgendaDraft({
    originalUrl: 'https://xhs',
    title: 'Cafe',
    fullText: 'Long content',
    images: ['https://img1'],
    location: { placeName: 'Cafe', lat: 1, lng: 2 },
    status: 'parsed'
  });

  expect(draft.sourceType).toBe('xiaohongshu');
  expect(draft.lat).toBe(1);
});
```

**Step 2: Run test to verify it fails**
Run: `npm test -- src/utils/xiaohongshu.test.ts`
Expected: FAIL because helper does not exist.

**Step 3: Write minimal implementation**
- Implement parser API caller (`parseXiaohongshuUrl(url)`) against `/api/parse/xiaohongshu`.
- Implement response types and mapping helpers to `Omit<AgendaItem, 'id'>`.
- Preserve full text and full images in `sourceContent`.

**Step 4: Run test to verify it passes**
Run: `npm test -- src/utils/xiaohongshu.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/utils/xiaohongshu.ts src/utils/xiaohongshu.test.ts
git commit -m "feat: add xiaohongshu parser client and mapping"
```

### Task 4: Extend Import Modal for Mixed Sources

**Files:**
- Modify: `src/components/ImportModal.tsx`
- Modify: `src/index.css`

**Step 1: Write the failing test**
Create `src/components/ImportModal.test.tsx` covering:
- mixed line parsing path
- xiaohongshu result row rendering (badge/image count)
- partial parse still importable

**Step 2: Run test to verify it fails**
Run: `npm test -- src/components/ImportModal.test.tsx`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Replace google-only copy with generic import copy.
- Classify each line via `classifyImportInput`.
- Keep current Google Maps flow for existing behavior.
- Add Xiaohongshu fetch/mapping flow and per-row status state (`loading/parsed/partial/failed`).
- Add row preview details: source badge, image count, warnings.

**Step 4: Run test to verify it passes**
Run: `npm test -- src/components/ImportModal.test.tsx`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/components/ImportModal.tsx src/index.css src/components/ImportModal.test.tsx
git commit -m "feat: support xiaohongshu parsing in import modal"
```

### Task 5: Surface Xiaohongshu Metadata in Existing UI

**Files:**
- Modify: `src/components/AgendaCard.tsx`
- Modify: `src/components/EditModal.tsx`
- Modify: `src/index.css`

**Step 1: Write the failing test**
Add component tests for:
- `小红书` source badge on agenda card
- source URL and image gallery preview in edit modal

**Step 2: Run test to verify it fails**
Run: `npm test -- src/components/AgendaCard.test.tsx src/components/EditModal.test.tsx`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Render `小红书` badge when `sourceType === 'xiaohongshu'`.
- Edit modal shows `sourceUrl`, `sourceMeta`, and read-only image preview list from `sourceContent.images`.

**Step 4: Run test to verify it passes**
Run: `npm test -- src/components/AgendaCard.test.tsx src/components/EditModal.test.tsx`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/components/AgendaCard.tsx src/components/EditModal.tsx src/index.css src/components/AgendaCard.test.tsx src/components/EditModal.test.tsx
git commit -m "feat: display xiaohongshu source metadata in cards and editor"
```

### Task 6: Add Parser Backend Endpoint Contract

**Files:**
- Create: `server/src/routes/parseXiaohongshu.ts`
- Create: `server/src/services/xhsExtractor.ts`
- Create: `server/src/services/geocode.ts`
- Create: `server/src/types/xhs.ts`
- Test: `server/test/parseXiaohongshu.test.ts`
- Modify: `vite.config.ts` (dev proxy for new endpoint)

**Step 1: Write the failing test**
Add API contract test for:
- parsed response shape
- partial response shape
- failure modes (`private_or_blocked`, `timeout`, `unsupported_link`)

**Step 2: Run test to verify it fails**
Run: `npm test -- server/test/parseXiaohongshu.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Implement route handler for `POST /api/parse/xiaohongshu`.
- Resolve short URLs and run extractor.
- Normalize payload and include warnings/status.
- Add timeout and image-count limit (30).

**Step 4: Run test to verify it passes**
Run: `npm test -- server/test/parseXiaohongshu.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add server/src/routes/parseXiaohongshu.ts server/src/services/xhsExtractor.ts server/src/services/geocode.ts server/src/types/xhs.ts server/test/parseXiaohongshu.test.ts vite.config.ts
git commit -m "feat: add xiaohongshu parse endpoint with normalized contract"
```

### Task 7: End-to-End Import and Map Validation

**Files:**
- Modify: `src/components/ImportModal.tsx` (final polish)
- Modify: `docs/plans/2026-03-07-xiaohongshu-import.md` (validation notes section)

**Step 1: Write the failing validation checklist**
Add checklist section with expected outcomes for:
- parsed with coordinates
- partial without coordinates
- failed and retry behavior

**Step 2: Run validation to verify failures are reproducible**
Run:
```bash
npm run build
npm run dev
```
Expected: if defects remain, scenarios fail visibly in UI.

**Step 3: Write minimal implementation**
Fix any remaining import-to-map mapping issues found during manual checks.

**Step 4: Run validation to verify it passes**
Run:
```bash
npm run build
npm run dev
```
Expected: all checklist items satisfied; parsed items pin correctly when coordinates exist.

**Step 5: Commit**
```bash
git add src/components/ImportModal.tsx docs/plans/2026-03-07-xiaohongshu-import.md
git commit -m "chore: finalize xiaohongshu import e2e validation"
```

### Task 8: Deployment and Runtime Hardening

**Files:**
- Create: `docs/deployment/xiaohongshu-parser.md`
- Modify: `.env.example` (or create if missing)
- Modify: `README.md` (if present)

**Step 1: Write the failing operational checklist**
Create a checklist with missing docs for env vars, cold-start behavior, and abuse controls.

**Step 2: Run docs check to verify gaps**
Run: `rg -n "xiaohongshu|xhs|parse/xiaohongshu|parser" README.md docs || true`
Expected: no complete deployment runbook yet.

**Step 3: Write minimal implementation**
Document:
- frontend/backend env vars
- hosting split (Vercel + Render)
- timeout/retry strategy
- public sharing implications
- log redaction and rate-limit recommendations

**Step 4: Run docs check to verify it passes**
Run: `rg -n "xiaohongshu|parse/xiaohongshu|Vercel|Render|timeout|rate" README.md docs`
Expected: deployment guide references all required topics.

**Step 5: Commit**
```bash
git add docs/deployment/xiaohongshu-parser.md .env.example README.md
git commit -m "docs: add xiaohongshu parser deployment guide"
```

## Notes
- This repository currently has no test runner configured; Task 2 introduces a minimal test framework so subsequent TDD steps are executable.
- If a separate backend repository/workspace is preferred, adapt Task 6 paths accordingly and keep the API contract unchanged.

## Validation Notes (Task 7)

### Failing Checklist (Pre-Validation)
- [x] Parsed with coordinates: importing a parsed Xiaohongshu payload should create a map pin.
- [x] Partial without coordinates: import should still succeed and no pin should be plotted.
- [x] Failed and retry: failed parse row should show error and allow retry from the same modal.

### Validation Run Results (2026-03-07)
- Build passed: `npm run build`
- Dev server starts: `npm run dev` (served on `http://localhost:5174/` during validation run)
- Contract and UI coverage used for checklist evidence:
  - `npm test -- server/test/parseXiaohongshu.test.ts`
  - `npm test -- src/components/ImportModal.test.tsx`
