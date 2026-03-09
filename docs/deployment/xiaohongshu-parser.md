# Xiaohongshu Parser Deployment Guide

## Operational Checklist (Initial Gaps)
- [x] Document frontend/backend environment variables.
- [x] Document hosting split between Vercel frontend and Render parser service.
- [x] Document timeout and retry strategy.
- [x] Document public sharing implications.
- [x] Document log redaction and rate-limit recommendations.

## Architecture
- Frontend calls `POST /api/parse/xiaohongshu`.
- In local development, Vite middleware serves this endpoint from `server/src/routes/parseXiaohongshu.ts`.
- In production, keep the same path and route it to the parser runtime.

## Environment Variables

Frontend (`.env`):
- `VITE_GOOGLE_MAPS_API_KEY`: required for Google Maps SDK usage.
- `VITE_GEMINI_API_KEY`: optional for AI auto-plan flow.

Parser runtime (Render/Node process):
- `XHS_PARSE_TIMEOUT_MS`: parser timeout in milliseconds.
  - Recommended default: `30000`.
- `XHS_IMAGE_LIMIT`: max images returned per post.
  - Recommended default: `30`.
- `XHS_RATE_LIMIT_PER_MINUTE`: soft rate limit per client/IP.
  - Recommended default: `30`.
- `XHS_LOG_REDACT_URLS`: redact raw Xiaohongshu URLs in logs.
  - Recommended default: `true`.
- `XHS_COOKIE`: optional logged-in Xiaohongshu cookie string used for blocked links.
  - Recommended: provide a low-privilege account cookie dedicated to scraping.

## Hosting Split (Vercel + Render)
1. Deploy frontend to Vercel.
2. Deploy parser service to Render (or equivalent Node host).
3. Configure Vercel rewrite/proxy so frontend keeps calling `/api/parse/xiaohongshu` and Vercel forwards to Render.
4. Keep CORS restricted if calling parser directly from a different origin.

## Timeout and Retry Strategy
- Parser timeout should return a normalized `failed` payload with `errorCode: timeout`.
- Frontend should allow re-running Parse from the import modal after failures.
- Retry guidance:
  - Retry once automatically for transient network failures.
  - Show manual retry for extraction failures (`private_or_blocked`, anti-bot, unsupported).
- For persistent `private_or_blocked` on share links, set `XHS_COOKIE` and retry.

## Public Sharing Implications
- Public shared frontend means parser endpoint can be discovered and abused.
- Require at least one of:
  - edge-level rate limiting,
  - API key/header gate between frontend and parser,
  - bot protection challenge for suspicious traffic.
- Treat parser output as untrusted text; do not render as HTML.

## Logging, Redaction, and Abuse Controls
- Do not log full post text or full raw URLs at info level.
- Redact query strings and user identifiers in request logs.
- Log only parser status, error code, duration, and image count.
- Add request-level rate limiting and burst control.
- Add alerting on timeout spikes and `private_or_blocked` spike anomalies.
