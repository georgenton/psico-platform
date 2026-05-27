# VoiceModule

Audio transcription for the Diary "voice entry" flow. Pro-tier only.

## HTTP surface

| Method | Path                  | Auth | Throttle    | Description                             |
| ------ | --------------------- | ---- | ----------- | --------------------------------------- |
| POST   | `/api/voz/transcribe` | ✓    | 10/min/user | Audio (multipart) → transcript          |
| POST   | `/api/voz/usage`      | ✓    | global      | Reconcile client/server seconds counter |

## Privacy contract

**Audio is NEVER stored.** Per `docs/design/handoff/07-voz.md`, the audio
buffer is held in memory only long enough to pipe it to the transcription
provider. Only metadata persists:

- `VoiceTranscription { userId, durationSec, language, provider, createdAt }`

No filename, no waveform, no IP address. The `provider` column exists for
future cost-attribution analytics ("how much did Deepgram cost us last
month?") and is the only field that would identify the upstream vendor.

## Providers

`IVoiceProvider` interface — same strategy pattern as `IPaymentProvider`
(S4). Selected by `VOICE_PROVIDER` env (`whisper` | `deepgram`).

| Provider | Endpoint                                          | API key required   |
| -------- | ------------------------------------------------- | ------------------ |
| Whisper  | `https://api.openai.com/v1/audio/transcriptions`  | `OPENAI_API_KEY`   |
| Deepgram | `https://api.deepgram.com/v1/listen?model=nova-3` | `DEEPGRAM_API_KEY` |

The env schema's `superRefine` requires the matching key for the active
provider — boot fails fast if you set `VOICE_PROVIDER=deepgram` without
`DEEPGRAM_API_KEY`.

## Quota flow

```
POST /voz/transcribe
  ├─ assertQuotaAvailable(userId)
  │    ├─ User.plan = FREE? → 403 VOICE_REQUIRES_PRO
  │    ├─ SUM(VoiceTranscription.durationSec in period) ≥ quota? → 402 VOICE_QUOTA_EXCEEDED
  │    └─ return remainingSeconds
  ├─ provider.transcribe(audio)
  ├─ prisma.voiceTranscription.create({ userId, durationSec, language, provider })
  ├─ usageService.invalidate(userId)   ← bust /usage cache
  └─ return { transcript, durationSec, remainingMinutesThisPeriod }
```

Per-plan caps live in `apps/api/src/subscription/quotas.ts`:

| Plan   | Voice quota |
| ------ | ----------- |
| FREE   | 0 min       |
| PRO    | 120 min     |
| ANNUAL | 120 min     |
| B2B    | unlimited   |

## Limits

- **Max audio file size:** 25 MB (Whisper-native cap). Larger uploads get
  a `413 PAYLOAD_TOO_LARGE` and the request body is rejected by Multer
  before the controller runs.
- **Allowed MIME types:** `audio/webm`, `audio/ogg`, `audio/mp4`/`m4a`,
  `audio/wav`, `audio/mpeg`/`mp3`. Anything else returns `415`.
- **Per-user rate limit:** 10 transcriptions per 60s window. Aggressive
  on purpose — voice is expensive both in latency and in $$$/min.

## Nightly rollup

`DailyUsageProcessor` (`apps/api/src/jobs/processors/daily-usage.processor.ts`)
groups `VoiceTranscription.durationSec` by user per UTC day and writes
`BillingUsageDay.voiceMinutes`. Pulso admin consumes that — `/usage`
itself reads live from `VoiceTranscription` (5-min Redis cache).
