---
"@psico/types": minor
"@psico/api-client": minor
---

Add the contextual Guide discovery response and its client method.

`GuideDiscoveryResponse` is a closed union: the unavailable arm carries no pin,
so a negative answer cannot be mined for a guide key. `getGuideDiscovery`
validates the slug and chapter order before building the route and never emits
a request for malformed input.

Additive: no existing Guide type or command changes.
