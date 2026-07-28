---
"@psico/types": minor
"@psico/api-client": minor
---

CC-7.R1 — Guide V1 server-owned pilot rollout gate. Adds
`GuideAvailabilityResponse` and the `GUIDE_UNAVAILABLE` error code to
`@psico/types`, and a `guideApi.getGuideAvailability()` client for the new
opaque `GET /api/guide/availability` endpoint.
