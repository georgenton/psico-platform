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
   If match → no LLM call, emit `crisis` SSE event with the canned
   message + Línea 1800-4-SALUD hotline.

2. **Layer 2 — LLM sentinel (in-flight)**: the system prompt instructs
   the model to respond ONLY with `[CRISIS]` if it detects risk signals
   that the regex missed. The streaming pipeline aborts on detection and
   replaces the (empty) reply with the canned crisis message.

Both layers persist a `kind=CRISIS` `EcoMessage` so the thread is
re-readable with the same content the user saw.

## Quota enforcement

- **FREE**: 10 user messages per UTC day.
- **PRO / ANNUAL**: 200 user messages per billing period (from `PLAN_QUOTAS`).
- **B2B**: unlimited.

Pre-flight check before any LLM call. Counted via `EcoMessage` rows with
`kind=USER` joined to the thread. Successful sends invalidate
`UsageService` cache so Mi Plan reflects the new count.

## Streaming protocol

Server-Sent Events on `POST /api/eco/messages`. Event types (typed in
`@psico/types#EcoSseEvent`):

```
event: delta        data: { text: "..." }
event: crisis       data: { text, hotline, crisisPath }
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
