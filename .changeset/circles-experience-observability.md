---
"@psico/types": minor
---

Círculos gains three things and loses one blind spot.

`CircleActivityDefinition` grows four optional presentation fields —
`intro`, `topics`, and per-field `optional` and `help` — validated with limits
and rejecting extra keys. Definitions written before them stay valid unchanged.

`duo-lo-que-me-ayuda@2` joins the catalogue as a DRAFT candidate beside the
published @1, which is untouched: three questions instead of two, the first
asking for a situation rather than a feeling, and two pieces of prepared
editorial help per question. `ecoMode` stays `NONE` — static text is not a
model with an opinion.

`circles-feedback.ts` carries the closed vocabulary of the optional question
asked after an activity: seven topic keys, three usefulness answers, and the
versioned notice somebody agrees to. There is no free-text option anywhere in
it.

And `observability-redaction.ts` is one shared Sentry redactor for the API and
the Web's three runtimes, so the list of credential headers cannot drift
between four copies of it.
