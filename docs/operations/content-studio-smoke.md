# Content Studio — smoke matrix

What to check before letting real people touch Content Studio, and who checks it.

This is a checklist, not a framework. Most of it is already automated; the rows
that stay manual are the ones where a machine can confirm a request succeeded
but not that a human understood what happened.

## How to read a row

| Lane             | Meaning                                                |
| ---------------- | ------------------------------------------------------ |
| `AUTOMATED`      | A test asserts it. If it breaks, CI says so.           |
| `REAL R2`        | Touches the real development bucket. Never production. |
| `MANUAL ADMIN`   | A person with the ADMIN role, in a browser.            |
| `MANUAL READER`  | A person WITHOUT the CMS, on web or mobile.            |
| `DEFERRED VIDEO` | Cannot run today. Stated, not hidden.                  |

## Running the automated lane

```bash
pnpm --filter @psico/api test && pnpm --filter @psico/web test
```

Real-Postgres invariants — draft isolation, media identity, mark preservation —
build and drop their own database:

```bash
PG_LOCKS_ADMIN_URL="$DATABASE_URL" pnpm --filter @psico/api pg:locks
```

Real bucket round trip, which refuses to run against anything but the dev bucket:

```bash
R2_SMOKE_ALLOW=yes-non-production pnpm --filter @psico/api smoke:r2
```

## The matrix

| #   | Check                                                                             | Lane                      | Where it is proven                                               |
| --- | --------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| 01  | `ADMIN_BOOK_LIST` — Pulso → Contenido lists books                                 | AUTOMATED + MANUAL ADMIN  | `content-studio.controller.spec.ts`                              |
| 02  | `OPEN_CHAPTER` — chapter opens with its blocks                                    | AUTOMATED + MANUAL ADMIN  | `content-studio.service.spec.ts`                                 |
| 03  | `TEXT_DRAFT` — edit PARAGRAPH / HEADING / QUOTE / PAUSE, save, resume             | AUTOMATED                 | `content-core-draft.pg-spec.ts`                                  |
| 03b | `TEXT_CONFLICT` — a second save from a stale tab is refused, zero writes          | AUTOMATED                 | `content-core-ingest-v2-concurrency.pg-spec.ts`                  |
| 04  | `TEXT_PREVIEW` — preview renders the draft, saving first                          | AUTOMATED + MANUAL ADMIN  | `ChapterEditor.test.tsx`                                         |
| 05  | `TEXT_PUBLISH` — publish moves the edition pointer                                | AUTOMATED                 | `content-core-draft.pg-spec.ts`                                  |
| 06  | `COVER_UPLOAD` — cover lands and renders                                          | REAL R2 + MANUAL ADMIN    | `content-studio-assets.service.spec.ts`                          |
| 07  | `CHAPTER_IMAGE` — illustration lands in the block                                 | REAL R2 + MANUAL ADMIN    | `content-studio-assets.service.spec.ts`                          |
| 08  | `IMAGE_ALT_REJECTION` — no alt text, no save, and it says why                     | AUTOMATED                 | `ImageEditing.test.tsx`                                          |
| 08b | `IMAGE_BOUNDARY` — exactly 5 MB accepted, one byte more refused                   | AUTOMATED                 | `content-studio-assets.service.spec.ts`                          |
| 09  | `AUDIOBOOK_UPLOAD` — master stages privately                                      | REAL R2                   | `media-upload.pg-spec.ts`                                        |
| 10  | `AUDIOBOOK_PUBLISH` — v1 freezes to its exact bytes BEFORE the pointer moves      | AUTOMATED                 | `media-upload.pg-spec.ts`                                        |
| 11  | `AUDIOBOOK_PLAYBACK` — plays after publish; v1 still resolves                     | REAL R2 + MANUAL READER   | `media-upload.pg-spec.ts`                                        |
| 12  | `PODCAST_ADD` — 0 → 1 episode                                                     | AUTOMATED                 | `media-upload.pg-spec.ts`                                        |
| 13  | `PODCAST_UPLOAD` — episode master stages privately                                | REAL R2                   | `media-upload.pg-spec.ts`                                        |
| 14  | `PODCAST_MULTI_EPISODE` — a second episode does not hide the first                | AUTOMATED                 | `media-upload.pg-spec.ts`                                        |
| 15  | `PODCAST_PLAYBACK` — every episode is offered, not just the newest                | MANUAL READER             | `ChapterMediaListen.tsx`                                         |
| 16  | `DRAFT_NOT_PUBLIC` — no CMS draft of any kind reaches a reader                    | AUTOMATED                 | `chapter-media-cms.pg-spec.ts`                                   |
| 17  | `HIGHLIGHT_PRESERVATION` — a highlight survives an editorial publish              | AUTOMATED                 | `content-core-draft.pg-spec.ts`, `content-core-marks.pg-spec.ts` |
| 18  | `ANNOTATION_PRESERVATION` — an annotation survives it too                         | AUTOMATED                 | `content-core-draft.pg-spec.ts`, `content-core-marks.pg-spec.ts` |
| 19  | `VIDEO_COMING_SOON` — video is announced, never faked                             | AUTOMATED + MANUAL READER | `chapter-media-cms.pg-spec.ts`, `MediaSection.test.tsx`          |
| 19b | `VIDEO_UPLOAD_UNAVAILABLE` — the CMS offers no button that would fail             | AUTOMATED                 | `MediaSection.test.tsx`, `video-upload.service.spec.ts`          |
| 19c | `VIDEO_BYTES_ROUND_TRIP` — a real file uploads, encodes, plays                    | **DEFERRED_BY_BILLING**   | —                                                                |
| 20  | `AUTH_ROLE_MATRIX` — anonymous 401 · USER/AUTHOR/PSYCHOLOGIST 403 · ADMIN allowed | AUTOMATED                 | `content-studio.controller.spec.ts`                              |

## SMOKE_19c — why it is deferred

Cloudflare Stream authenticates and the API is reachable; the account has no
storage capacity allocated, so `direct_upload` returns `10011`. That is a
billing decision nobody has to make yet.

What this means in practice:

- the C3 code stays, tested, and is not special-cased;
- `CLOUDFLARE_STREAM_UPLOADS_ENABLED` stays `false`, so the CMS never offers
  a video upload it cannot honour;
- readers keep seeing the existing **Próximamente** video cards, which were
  always honest;
- when capacity is bought, flipping that one variable to `true` is the whole
  change, and SMOKE_19c becomes runnable.

## The manual passes

**ADMIN pilot** — one or two trusted editors, on staging. Open a chapter, edit
copy, preview, upload a cover and an illustration, upload an audiobook or a
podcast episode, publish, and read every status message out loud. The question
is not "did it work" but "did it say something true".

**Reader canary** — two to five people who never see the CMS. Open the edited
chapter on web and on a phone. Check the text, the images, the audiobook, the
podcast episodes, and that their own highlights and annotations are still where
they left them. Video should say Próximamente and nothing else.

Neither pass runs against production data. See the staging plan in
`docs/deploy/` before starting.
