---
"@psico/types": minor
"@psico/api-client": minor
---

Sprint S8 — VoiceModule.

Two new endpoints close the voice transcription surface per
docs/design/handoff/07-voz.md. Pro-tier only. Audio is NEVER stored.

**Backend (`@psico/api`):**

- `POST /api/voz/transcribe` — multipart audio → transcript. Pre-flight
  quota gate (403 VOICE_REQUIRES_PRO for FREE, 402 VOICE_QUOTA_EXCEEDED
  when over the 120 min/period cap). 10 req/min/user throttle.
- `POST /api/voz/usage` — optional client/server reconciliation.

Schema: new `VoiceTranscription` audit table (userId, durationSec,
language, provider, createdAt). No audio buffer, no waveform, no IP.

Provider strategy (analog to PaymentPool):

- `IVoiceProvider` interface.
- `WhisperProvider` (OpenAI, default) — POST multipart, normalises language.
- `DeepgramProvider` — POST binary to `/v1/listen?model=nova-3`.
- `VOICE_PROVIDER` env selects (`whisper` | `deepgram`).
- Env superRefine requires the active provider's API key at boot.

Wire-up with S7:

- `UsageService.voice.minutesThisPeriod` now reports `SUM(durationSec)/60`
  rounded to 0.1 min (was hardcoded 0).
- `DailyUsageProcessor` (nightly BullMQ) populates
  `BillingUsageDay.voiceMinutes`.

**`@psico/types`:**

- `VoiceProvider` ("whisper" | "deepgram").
- `VoiceTranscribeResponse`, `VoiceUsageReportRequest`,
  `VoiceUsageReportResponse`.

**`@psico/api-client`:**

- `voiceApi.transcribe(blob, { language })` + `voiceApi.reportUsage()`.
- New `apiClient.postFormData<T>(path, FormData)` — skips JSON-stringify
  and lets the browser set the multipart boundary.
- `generated.ts` regenerated (65.5 KB → 67.0 KB).
