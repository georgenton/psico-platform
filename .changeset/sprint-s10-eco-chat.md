---
"@psico/types": minor
"@psico/api-client": minor
---

Sprint S10 — AIModule conversacional (Eco).

Six new endpoints close the conversational AI surface per
docs/design/handoff/08-eco.md. Hybrid E2E encryption, SSE streaming,
two-layer crisis detection, plan-aware quota enforcement.

**Backend (`@psico/api`):**

- `GET /api/eco/caps` — Eco persona (name, voice, capabilities).
- `GET /api/eco/threads` — sidebar rail (last 50 threads).
- `POST /api/eco/threads` — create a new thread.
- `GET /api/eco/threads/:id?cursor=` — paginated thread view.
- `DELETE /api/eco/threads/:id` — delete thread + cascaded messages.
- `POST /api/eco/messages` — SSE-streamed reply. 30 req/min/user throttle.
- `POST /api/eco/messages/:id/report` — flag a bad answer.

Schema: `EcoThread`, `EcoMessage` (with `kind` enum: USER/ASSISTANT/CRISIS/
SUGGESTION), `EcoMessageReport`. Backward-compat: legacy `Conversation` and
`/ai/chat` endpoint untouched.

**Crisis detection (two layers):**

- Layer 1 (regex, pre-LLM): `isCrisisText()` matches unambiguous signals
  (`suicid`, `quitarme la vida`, `no quiero vivir`, English fallbacks).
  Accent-insensitive.
- Layer 2 (LLM sentinel): system prompt instructs the model to respond
  only with `[CRISIS]` if it detects risk signals the regex missed.

Both paths persist a `kind=CRISIS` message + emit a `crisis` SSE event
with the Línea 1800-4-SALUD hotline.

**Quotas (`PLAN_QUOTAS.eco`):**

- FREE: 10 user messages per UTC day.
- PRO/ANNUAL: 200 messages per billing period.
- B2B: unlimited.

Wires the last counter of `/api/subscriptions/usage` — every counter
now reports real data. `DailyUsageProcessor` populates
`BillingUsageDay.ecoMessages` nightly.

**`@psico/types`:**

- `EcoMessageKind`, `EcoMessageReportReason`, `EcoPersona`,
  `EcoThreadRailItem`, `EcoThreadListResponse`, `EcoThreadCreatedResponse`,
  `EcoMessage`, `EcoThreadResponse`, `EcoSendMessageRequest`,
  `EcoSseEvent` (union), `EcoReportMessageRequest`.

**`@psico/api-client`:**

- `ecoApi` with `getCaps`, `listThreads`, `createThread`, `getThread`,
  `deleteThread`, `sendMessage` (SSE consumer via fetch + reader),
  `reportMessage`.
- `generated.ts` regenerated (67.0 KB → 72.2 KB).
