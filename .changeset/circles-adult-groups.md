---
"@psico/types": minor
"@psico/api-client": minor
---

Círculos · adult groups of three to six, on the engine the Dúo already runs.

`@psico/types` gains the `GROUP_ADULT` audience, participant RANGES rather than
a single number (`circleAllowedSizes`, `circleSizeIsAllowed`), and the published
`grupo-lo-que-nos-ayuda@1` template. `CircleActivityView.revealed` carries every
other seat's snapshot under a stable positional label
(`CircleRevealedParticipant`); `revealed.counterpart` remains, and is present
only when there IS one other seat. `CircleInvitationPreview` gains
`participants`, so somebody deciding whether to accept is told how many people
will read what they write.

The API contract for creating an activity takes `invitationTokens` — one 256-bit
secret per seat that is not the organiser's — and an optional `size`. The
regenerated client follows.
