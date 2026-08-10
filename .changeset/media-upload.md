---
"@psico/api-client": minor
---

Content Studio can upload audiobook and podcast masters. Two multipart endpoints
stage a master privately, and a third publishes it — for an audiobook, after
freezing the previous version to the exact bytes it already resolved to, so an
older version never starts playing a newer recording. Upload never publishes.
