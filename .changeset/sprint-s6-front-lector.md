---
"@psico/web": minor
"@psico/mobile": minor
---

Sprint S6-front — Reader UI (web + mobile) consuming the S6 LectorModule.

**Web (`apps/web`):**

- `/dashboard/biblioteca/[slug]/lector/[chapterOrder]` route. Server
  Component pre-fetches the chapter so first paint shows real text.
- `LectorShell` client orchestrator: highlights with 3 colors
  (YELLOW/BLUE/PINK) via text selection + popover; annotations side
  panel with full CRUD; Aa-style preferences modal (theme/font/size/
  line-height) applied live to CSS variables scoped to the reader.
- `useHeartbeat` hook fires `PATCH /api/lector/session` every 5s,
  paused on `document.hidden`, with `keepalive: true` so the last beat
  survives navigation.
- IntersectionObserver tracks the current block for `lastBlockId` and
  drives `progressPct = max(prev, idx/total)` — never decreasing.
- Complete CTA → `POST /lector/.../complete` → routes to next chapter.
- `ChaptersList` in the book detail wraps each row in `<Link>` so users
  can tap a chapter to read.

**Mobile (`apps/mobile`):**

- `(tabs)/books/[slug]/lector/[chapterOrder]` screen with view-only
  block rendering + annotations CRUD via long-press (Modal composer).
- Highlights not in v1 — RN selection menu can't easily attach custom
  actions; documented trade-off.
- Heartbeat with `setInterval` + `AppState` check; scroll-position
  inference of current block from `onLayout` offsets.
- Complete navigates to next chapter or back to book detail.

Decisions documented in `docs/informes/sprint-s6-front-lector.md`.
