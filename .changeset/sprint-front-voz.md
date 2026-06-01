---
"@psico/mobile": minor
"@psico/web": minor
---

Sprint front-voz — Voice-to-text UI (web + mobile) consuming the S8 VoiceModule
backend.

**Web:**

- New hook `src/lib/voice/use-recorder.ts` — MediaRecorder state machine
  (idle / permission-denied / unsupported / recording / stopped). Hard cap
  at 10 min. Timer ticks every 250ms.
- `src/lib/voice/handoff.ts` — sessionStorage-backed read-and-delete
  passthrough to the Diario composer.
- New page `/dashboard/voz` + client component `VozRecorder`. Idle → record
  → stop → transcribe → editable transcript → "Usar este texto" stashes
  via handoff and navigates back.
- Error states for 402 / 403 / 413 / 415 from the server + mic permission
  denied + unsupported browser.
- Diario composer gains a "🎙️ Dictar" button + `useEffect` to consume the
  handoff on mount.

**Mobile:**

- New dependency: `expo-av@~15.0.0`.
- `src/lib/voice/handoff.ts` — in-memory singleton (no AsyncStorage; transcripts
  should NOT survive app kill).
- New screen `(tabs)/voz.tsx` mirroring the web state machine with `expo-av
Audio.Recording.HIGH_QUALITY` (m4a iOS / webm Android). Registered with
  `href: null` so it's only accessible via navigation.
- Diario composer gains a "🎙️ Dictar" button + `useFocusEffect` to consume
  the handoff when the screen regains focus.

Decisions:

1. Handoff via storage (not URL params) — privacy default.
2. Single-take v1 (no pause/resume).
3. No waveform — pulsing dot + timer.
4. 10 min client cap vs 25 MB server cap — UX honesty + cost containment.
5. Mobile uses RN `{uri, name, type}` shape vs Blob (Android pre-12 mishandle
   boundary).
