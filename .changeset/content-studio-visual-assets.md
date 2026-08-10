---
"@psico/types": minor
"@psico/api-client": minor
---

Chapter illustrations get a shared contract. `imageBlockInfo` reads an IMAGE
block's metadata the same way in the web reader, the mobile reader and the
Content Studio preview, and refuses an image without alt text rather than
rendering one a screen reader cannot describe. The generated client gains the
two Content Studio upload endpoints — a book's catalog cover and a chapter's
illustration bytes.
