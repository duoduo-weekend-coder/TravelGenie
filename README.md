# travel-plan-timeline

## Xiaohongshu Import

This project supports mixed-source import (Google Maps, Xiaohongshu, and plain text).

- Frontend endpoint: `POST /api/parse/xiaohongshu`
- Deployment/runtime guide: `docs/deployment/xiaohongshu-parser.md`

### Deployment Notes
- Recommended hosting split: Vercel (frontend) + Render (parser runtime).
- Keep `/api/parse/xiaohongshu` stable and proxy to parser runtime in production.
- Configure timeout and rate-limit controls before public sharing.
