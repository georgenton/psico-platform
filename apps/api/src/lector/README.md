# LectorModule

Aggregates everything the reader needs in one shot: book + chapter metadata,
typed content blocks, highlights/annotations of the current user, reading
session heartbeat, audio playback URL, and user reader preferences.

Endpoints live under `/api/lector/*`. See `docs/design/handoff/05-lector.md`
for the design contract.

---

## §audio — chapter audio playback

`GET /api/lector/:bookIdOrSlug/:chapterOrder/audio` returns:

```jsonc
{
  "url": "https://…r2.cloudflarestorage.com/…/cap-1.mp3?X-Amz-…", // presigned, 6h TTL
  "durationSec": 600,
  "transcript": [{ "start": 0.0, "end": 4.2, "text": "...", "blockId": "..." }],
  "metadata": {
    "title": "Cap. 1 · El primer paso",
    "subtitle": "Emociones en Construcción",
    "artist": "Marina Quintana",
    "artworkUrl": "https://cdn.example/cover.png",
  },
}
```

The `metadata` block is consumed by both clients:

- **Web** — rendered in the audio bar (artwork thumbnail + title + subtitle).
  The browser's native `<audio>` element handles all OS lifecycle (lock
  screen, media keys) on its own and reads the `<title>` attribute when
  the user expands the global media controls.
- **Mobile** — rendered in the same bar. Currently the lock-screen
  controls on iOS / the MediaSession on Android do NOT read this JSON
  payload directly — they read **embedded file tags** (ID3v2 for MP3,
  m4a atoms). Until we migrate from `expo-av` to `expo-audio` or
  `react-native-track-player` (both expose `MPNowPlayingInfoCenter` and
  Android MediaSession from JS), the lock-screen artwork comes from
  whatever is baked into the audio file at upload time.

### Ops: embedding lock-screen metadata at upload time

Run this `ffmpeg` snippet on each `.m4a` / `.mp3` before uploading to R2:

```bash
# m4a (anchor books — Emociones, Familias). Cover must be ≤ 500×500 PNG.
ffmpeg -i input.m4a -i cover.png -map 0 -map 1 \
  -c copy -c:v:1 png -disposition:v:1 attached_pic \
  -metadata title="Cap. 1 · El primer paso" \
  -metadata artist="Marina Quintana" \
  -metadata album="Emociones en Construcción" \
  output.m4a

# mp3 (if the source ever ships that way)
ffmpeg -i input.mp3 -i cover.png -map 0 -map 1 -c copy -id3v2_version 3 \
  -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" \
  -metadata title="Cap. 1 · El primer paso" \
  -metadata artist="Marina Quintana" \
  -metadata album="Emociones en Construcción" \
  output.mp3
```

Keep cover art square and ≤ 500×500 — iOS Control Center scales it down
and Android Auto refuses anything above ~600×600 in some builds.

### Ops: generating & publishing chapter audio (Modo Guía)

`Audio.fileUrl` stores the **R2 object key** (e.g. `audio/<bookSlug>/cap-1.mp3`)
and `getAudio()` mints a **presigned GET URL** (6h TTL) — R2 is served via the
authenticated S3 endpoint here, not a public bucket, so a raw URL would 400.
Modo Guía shows an honest "Audio en producción" placeholder until an `Audio`
row exists for the chapter.

Two ways to populate it:

**A) TTS narration (fast, swappable stand-in).** `scripts/generate-chapter-audio.mjs`
reads each chapter's narratable blocks (PARAGRAPH/HEADING/QUOTE/PAUSE),
synthesizes speech with OpenAI TTS, uploads the mp3 to R2 at
`audio/<bookSlug>/cap-<order>.mp3`, and upserts the `Audio` row (idempotent per
chapter). Env: `DATABASE_URL`, `R2_*`, `OPENAI_API_KEY`.

```bash
# from apps/api — dry-run first (parse + estimate, no TTS/upload/DB)
node scripts/generate-chapter-audio.mjs --dry-run
node scripts/generate-chapter-audio.mjs --voice nova --model tts-1   # all chapters
node scripts/generate-chapter-audio.mjs --only 1                     # a single chapter
# against prod: inject env with `railway run --service psico-platform -- \
#   env DATABASE_URL="<public-proxy>" node scripts/generate-chapter-audio.mjs`
```

**B) Professional recordings (drop-in replacement, no code change).** Upload the
`.m4a`/`.mp3` to the same R2 key and update `Audio.fileUrl` (embed lock-screen
tags first with the ffmpeg snippet above). The clients never change — they only
read `fileUrl`.

### Privacy

The audio file URL is a **presigned R2 URL** (6h TTL), minted on demand — the
audio bar fetches `getAudio()` each time it opens, so a fresh URL is always
handed out. Books are licensed public content, not E2E; the presign here is
just because the bucket isn't served publicly. The transcript is included in
the JSON payload and stored in `Audio.transcription` — public content.

The `metadata` block contains the chapter title + book title + author
name. None of those are user-derived data — they come from `Book` /
`Chapter` rows which are public catalog content.

## §video — inline chapter video capsule

A chapter can carry a short video where the author talks about the chapter.
Unlike audio (per-chapter, Modo Guía), the video is **inline** — a
`ChapterBlock` of kind `VIDEO`, positioned in the reading flow.

The block travels in the normal `getChapter` response (`blocks[]`); its
`meta` JSON carries the playback info (`VideoBlockMeta` in `@psico/types`):

```jsonc
{
  "id": "clx…",
  "order": 12,
  "kind": "VIDEO",
  "content": "Cápsula del capítulo: el autor conversa sobre «…».", // caption
  "meta": {
    "videoUrl": "https://cdn.psico.app/videos/eec-cap1.mp4", // direct public URL
    "posterUrl": "https://cdn.psico.app/videos/eec-cap1.jpg", // optional
    "durationSec": 95, // optional
  },
}
```

When `meta.videoUrl` is absent the clients render a player-shaped
**"en producción" placeholder** (mirrors "Audio en producción"). Both clients
detect a video block via the shared `videoBlockInfo(block)` helper — which also
matches **legacy** `EXERCISE` blocks whose content starts with `🎬` (chapters
ingested before the `VIDEO` kind existed), so already-seeded data upgrades to
the real player without a destructive re-ingest.

### Ops: publishing a chapter video

1. Encode to MP4 (H.264 + AAC) — the widest web + iOS/Android baseline.
   ```bash
   ffmpeg -i master.mov -c:v libx264 -profile:v high -pix_fmt yuv420p \
     -c:a aac -movflags +faststart eec-cap1.mp4
   ```
   `+faststart` moves the moov atom to the front so playback starts before the
   whole file downloads.
2. (Optional) grab a poster frame:
   ```bash
   ffmpeg -i eec-cap1.mp4 -ss 3 -vframes 1 eec-cap1.jpg
   ```
3. Upload both to the public R2/CDN bucket.
4. Set the block's `meta` to `{ videoUrl, posterUrl?, durationSec? }` (SQL
   `UPDATE "ChapterBlock" SET meta = '{…}'::jsonb WHERE id = '…'`). No re-ingest
   needed — updating `meta` is non-destructive and preserves highlights.

### Privacy

Book videos are **public licensed content** — `videoUrl` is a direct public
URL (no signing, no crypto). The video never carries user-derived data, and the
E2E boundary (ADR 0007) is untouched: nothing about a diary/Eco/reflexión is
involved in video playback.

---

## §chapter-media — the GR-2 media layer

Product authority: `docs/product/guided-reading-v1.md` §4/§7/§8/§9. Pending
assets: `docs/product/chapter-01-media-package.md`.

A chapter offers the same content in several representations. Three routes serve
them, and they divide responsibility on purpose:

| Route                                               | What it does               | What it must never do                    |
| --------------------------------------------------- | -------------------------- | ---------------------------------------- |
| `GET /api/lector/:bookIdOrSlug/:chapterOrder/media` | metadata + availability    | sign anything                            |
| `GET /api/lector/media/:mediaKey/access`            | one short-lived signed URL | be requested during SSR, or be cached    |
| `POST /api/lector/media/:mediaKey/complete`         | record ONE completion      | accept editorial context from the client |

Both GETs answer `Cache-Control: private, no-store`.

### The catalog is code

`media/chapter-media.catalog.ts` is the authority: a runtime validator over a
closed grammar plus a registry that refuses duplicates. It holds three
definitions for chapter 1 of _Emociones en Construcción_, and it holds **no
URL, no token and no secret** — a test asserts that.

- `eec-c1-audiobook-v1` — `PUBLISHED`, `source.kind = CHAPTER_AUDIO`. It reuses
  the `Audio` row and the signing path that `§audio` above already documents,
  so wiring the media surface changed nobody's access. Policy `PRO_ONLY`, the
  same rule chapter audio already enforced.
- `eec-c1-podcast-v1`, `eec-c1-video-v1` — `DRAFT`, `source: null`. They appear
  in the manifest as `COMING_SOON` and the reader says «En producción».

`DRAFT ⇒ source === null` and `PUBLISHED ⇒ source !== null` are enforced at
runtime, so a draft can never be one env flip away from serving an unreviewed
master.

### Signing

| Source              | Signer                                | TTL                                      |
| ------------------- | ------------------------------------- | ---------------------------------------- |
| `CHAPTER_AUDIO`     | `LectorService.getAudio`              | 6 h (`CHAPTER_AUDIO_SIGNED_URL_TTL_SEC`) |
| `R2`                | `StorageService.getSignedUrl`         | 1 h (`R2_MEDIA_SIGNED_URL_TTL_SEC`)      |
| `CLOUDFLARE_STREAM` | `cloudflare-stream-access.service.ts` | ~15 min                                  |

The signed URL is a temporary bearer: it appears in the access response and
nowhere else — never in the manifest, never in a log, never persisted.

### Ops: activating a format

Full checklist in `docs/product/chapter-01-media-package.md` §5. In short:
produce → review → upload → confirm `ready` → set the three
`CLOUDFLARE_STREAM_*` vars (all or none) → add the real `videoUid` / `objectKey`
to the catalog → `DRAFT` → `PUBLISHED` → smoke → deploy.

To replace an already-published asset, bump `mediaVersion` instead of editing in
place: the completion's idempotency key derives from `mediaKey + mediaVersion`,
so a new version is a new activity rather than a silently-changed old one.

### Completion, and what it means

`POST …/complete` takes no body. The media kind, its version, the editorial unit
and the idempotency key are all derived server-side; the client cannot send
`watchedSeconds`, a percentage, a playback speed or a timestamp, because none of
those exist in the contract. 201 the first time, 200 on any replay.

The event means one thing: **the client reported that the player reached its
end**. It does not mean the person understood, paid attention, or felt anything.

### Privacy

Activity goes to Mi Evolución and **never** to the Emotional Map
(`EXPERIENCE_CAUSAL_INFERENCE=false`, ADR 0018). The firewall pg-spec proves it
on real rows: the canonical map projection is byte-for-byte identical after the
three media completions, while an explicit check-in does move it.
