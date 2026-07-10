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
  "url": "https://r2.example/.../chapter.m4a?token=…", // signed, 1h TTL
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

### Privacy

The audio file URL is a **signed R2 URL with a 1h TTL**. The audio bar
fetches it on demand (no eager loading). The transcript is included in the
JSON payload — it's also stored alongside the audio file in DB, public
licensed content, not E2E.

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
