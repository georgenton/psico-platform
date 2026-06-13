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
