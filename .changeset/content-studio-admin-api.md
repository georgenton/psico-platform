---
"@psico/api-client": minor
---

Content Studio admin endpoints reach the generated client: list books, read a
book's editorial state, read and save a chapter draft, preview the active draft,
and publish a book's draft. All ADMIN-only, and all identity resolution stays
server-side — the routes carry only a book slug and a chapter number.
