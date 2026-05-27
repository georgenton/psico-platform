---
"@psico/api-client": minor
---

Sprint S5-front-mobile — RN companion.

`@psico/api-client`:

- New `homeApi` with `get`, `updateMood`, and `dismissPrompt` methods.
  Mirrors the three HomeModule endpoints (Sprint S5). Used by mobile because
  it consumes the API through the `apiClient` + `TokenStore` pattern; the
  web uses Next.js `serverFetch` with cookies inside Server Components and
  therefore does not need a wrapper.
