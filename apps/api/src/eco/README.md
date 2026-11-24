# EcoModule

Conversational AI companion for Psico Platform. Spanish-first. **Not a
therapist.** Per `docs/design/handoff/08-eco.md`.

## HTTP surface

| Method | Path                           | Auth | Throttle    | Description                         |
| ------ | ------------------------------ | ---- | ----------- | ----------------------------------- |
| GET    | `/api/eco/caps`                | ✓    | global      | Persona (name, voice, capabilities) |
| GET    | `/api/eco/threads`             | ✓    | global      | Sidebar rail of recent threads      |
| POST   | `/api/eco/threads`             | ✓    | global      | Create a new thread                 |
| GET    | `/api/eco/threads/:id`         | ✓    | global      | Paginated thread view (cursor)      |
| DELETE | `/api/eco/threads/:id`         | ✓    | global      | Delete a thread                     |
| POST   | `/api/eco/messages`            | ✓    | 30/min/user | Send a message (SSE stream)         |
| POST   | `/api/eco/messages/:id/report` | ✓    | global      | Flag an Eco reply for human review  |

## Privacy contract (hybrid encryption)

The server NEVER persists the user's plaintext but DOES see it in-flight:

- **USER messages**: client sends `{ textPlaintext, textCiphertext, textNonce }`.
  Plaintext is used for (a) the LLM call and (b) the crisis regex.
  Only `textCiphertext + textNonce` is persisted.
- **ASSISTANT / CRISIS / SUGGESTION messages**: LLM-generated. Stored as
  plaintext in `assistantText` — they are not the user's private input.

The privacy spec (`eco.privacy.spec.ts`) walks the source tree and fails
the build if `logger.*` or `console.*` calls reference `textPlaintext`,
`textCiphertext`, `textNonce`, or thread title cipher fields.

## Crisis detection (two layers)

1. **Layer 1 — server regex (pre-LLM)**: `crisis.ts` runs `isCrisisText()`
   over the plaintext. Patterns target unambiguous signals
   (`suicid`, `quitarme la vida`, `no quiero vivir`, English fallbacks).
   If match → no LLM call, emit `crisis` SSE event with the canned notice.

2. **Layer 2 — LLM sentinel (in-flight)**: the system prompt instructs
   the model to respond ONLY with `[CRISIS]` if it detects risk signals
   that the regex missed. The streaming pipeline aborts on detection and
   replaces the (empty) reply with the canned crisis message.

Both layers persist a `kind=CRISIS` `EcoMessage` so the thread is
re-readable with the same content the user saw. Nothing rewrites it later: an
old notice keeps the text it was sent with (`crisis-notice.spec.ts` pins it).

### The notice goes first

Layer 1 runs before the quota, before the thread and before any write. What it
waits for is the profile's country, and only one second: a failed or late read
is «not declared». Everything after the notice is best effort with a deadline of
three seconds, so a database that does not answer does not keep the stream open
— the installed clients paint the notice when the stream closes. A failure there
is logged, with neither text nor ciphertext, and is never an `error` event
(`eco.crisis-first.spec.ts`, `eco-crisis.e2e-spec.ts`).

- **No quota left.** The notice goes out and both messages are saved: the
  person's one only as ciphertext, the notice in the clear. It counts like any
  other message, so `used` can pass the limit and what is left stays at zero.
- **A thread that is not theirs, or does not exist.** The notice, and nothing
  written. Both look the same.
- **`done`** follows `crisis` when the message was saved and the quota could be
  read; otherwise the stream just closes. Layer 2 does not emit it.

What can still stand in front of it is what runs before this module: the session
guard (which reads the database), the rate limit and the body validation.

### What the notice says

`crisisNotice(country)` composes it from the shared catalogue in
`@psico/types` (`crisis-catalog.ts`), which only serves what a primary source
accredits — see `docs/product/ayuda-evidencia.md`. No number is written here.

| `Profile.country`                       | Number           | `hotline`                          |
| --------------------------------------- | ---------------- | ---------------------------------- |
| Declared, emergency accredited (`EC`)   | that one         | `911 (Ecuador)`                    |
| Not declared                            | the starting one | `911 (Ecuador)`, named in the text |
| Declared, none accredited (`CO`, `MX`…) | none             | `número de emergencias de tu país` |

Eco does not choose: it never takes «the first line of the list», and a
declared country never gets another country's number. `hotline` without a
number is a phrase because clients without a dialable form paint «Llama al
{hotline}». The legacy `/ai/chat` prompt uses the same guidance
(`crisisGuidance`), and both prompts forbid giving any other phone number.

## Quota enforcement

- **FREE**: 10 user messages per UTC day.
- **PRO / ANNUAL**: 200 user messages per billing period (from `PLAN_QUOTAS`).
- **B2B**: unlimited.

Pre-flight check before any LLM call, and after layer 1. Counted via `EcoMessage` rows with
`kind=USER` joined to the thread. Successful sends invalidate
`UsageService` cache so Mi Plan reflects the new count.

## Streaming protocol

Server-Sent Events on `POST /api/eco/messages`. Event types (typed in
`@psico/types#EcoSseEvent`):

```
event: delta        data: { text: "..." }
event: crisis       data: { text, hotline, crisisPath, country? }
event: suggestion   data: { bookId, rationale }
event: done         data: { messageId, quotaRemaining }
event: error        data: { code, message }
```

Clients consume via `EventSource` (browser) or the `ecoApi.sendMessage()`
helper in `@psico/api-client` (uses fetch + reader for React Native
compat).

## Persistence model

- `EcoThread { id, userId, titleCiphertext?, titleNonce?, lastMessageAt }`
- `EcoMessage { id, threadId, kind, textCiphertext?, textNonce?, assistantText?, suggestedBookId?, inputTokens, outputTokens }`
- `EcoMessageReport { id, messageId, userId, reason, comment? }`

Backward compatibility: the legacy `Conversation` / `ConversationMessage`
tables and the `/ai/chat` endpoint stay untouched. New code uses the
EcoModule.

## Daily rollup

`DailyUsageProcessor` (BullMQ nightly) populates
`BillingUsageDay.ecoMessages` from `EcoMessage` rows for Pulso admin.
