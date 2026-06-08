---
"@psico/api-client": patch
---

Sprint S54 — TimezoneCard Settings UI + UI tests.

No public surface changes in the api-client; this changeset captures the
component-level work that consumes `usersApi.updateTimezone` (shipped in
S53). The new `TimezoneCard` web + mobile components are app-internal and
not exported from the api-client package.
