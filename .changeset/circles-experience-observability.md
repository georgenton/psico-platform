---
"@psico/types": minor
---

Círculos gains three things and loses one blind spot.

`CircleActivityDefinition` grows four optional presentation fields —
`intro`, `topics`, and per-field `optional` and `help` — validated with limits
and rejecting extra keys. Definitions written before them stay valid unchanged.

`duo-lo-que-me-ayuda@2` is the published template: three questions instead of
two, the first asking for a situation rather than a feeling and optional, and
two pieces of prepared editorial help per question. `ecoMode` stays `NONE` —
static text is not a model with an opinion.

@1 moves to `ARCHIVED` in the same change rather than staying beside it.
Publishing a version is a succession: a link carries a key and no version, so
exactly one version of a key may be `PUBLISHED` at a time. Archiving withdraws
@1 from everything that offers a template while `getExact` keeps resolving it,
so the activities pinned to it keep the wording their participants agreed to.

`circles-feedback.ts` carries the closed vocabulary of the optional question
asked after an activity: seven topic keys, three usefulness answers, and the
versioned notice somebody agrees to. There is no free-text option anywhere in
it.

And `observability-redaction.ts` is one shared Sentry redactor for the API and
the Web's three runtimes, so the list of credential headers cannot drift
between four copies of it.
