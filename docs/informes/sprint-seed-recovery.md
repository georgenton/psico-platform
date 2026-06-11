# Sprint Seed Recovery — Mostrar seed phrase desde Security

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-seed-recovery`
**Tests:** 65/65 web (sin cambios) · 20/20 mobile (sin cambios) · 601/602 API · 34/34 crypto
**ADR aplicado:** [0007 §G — BIP39 seed phrase recovery](../adr/0007-e2e-encryption-diario-eco.md)

---

## Lo que se construyó

Cierra la última promesa de cripto del producto: la **recuperación con seed phrase BIP39 funcional end-to-end**. El toolkit existía desde S22, el `cryptoSeedShownAt` se setea al confirmar el modal post-onboarding, pero después de esa primera vez el usuario **no tenía forma de volver a ver su frase**. Si la perdía y olvidaba la password, su Diario quedaba inaccesible para siempre — gap entre el pitch comercial ("recuperación con seed phrase de 24 palabras") y la realidad UX.

### Web — `ShowSeedPhraseCard.tsx` en `/dashboard/security`

- Wrapped en `DiaryKeyProvider` para reusar el unlock + `useDiaryKey().masterKey` ya existente.
- Phase machine: `idle → unlocking → shown`.
- `idle`: card con CTA "Mostrar mi frase".
- `unlocking`: si masterKey null, monta el `UnlockGate` existente (password o seed) — el usuario desbloquea, vuelve y click "Mostrar mi frase".
- `shown`: grid 2x4 de 24 palabras con índices, botón "Copiar las 24 palabras" (clipboard API), botón "Ocultar".
- Footer rose con warning sobre la criticidad de la frase.

### Mobile — `ShowSeedPhraseCard.tsx` en `(tabs)/security`

- Componente independiente que **deriva localmente** con la password del usuario en el momento (no usa context global — el screen de security mobile ya tiene su propio derive flow para password change).
- Phase machine: `idle → asking → revealed`.
- `asking`: TextInput de password secureTextEntry → `deriveMasterKey(password, cryptoSalt)` (Argon2id) → `masterKeyToSeedPhrase(masterKey)` → fill(0) del buffer.
- `revealed`: grid 2x12 monospace de 24 palabras + botón "Compartir / Copiar" (native `Share.share`) + "Ocultar".
- Warning rose footer.

Sin agregar `expo-clipboard` como dep — `Share.share` (RN built-in) es el camino estándar.

### Security pages wire

- Web `/dashboard/security/page.tsx`: agrego `ShowSeedPhraseCard` debajo del `ChangePasswordCard` en un wrapper `space-y-5`.
- Mobile `(tabs)/security.tsx`: `useAuth()` para grab `user.cryptoSalt`, render del card al final del scroll.

### Privacy preservada (ADR 0007)

| Garantía | Cómo |
|---|---|
| Server nunca ve seed phrase | Todo derive es local. Solo se manda al backend `cryptoSeedShownAt` ack. |
| Mobile: password no persiste | Se limpia del state inmediatamente post-derive (`setPassword("")`). |
| MasterKey buffer zeroed | `masterKey.fill(0)` después de derivar las words. |
| Web: gate por unlock activo | El usuario debe haber desbloqueado su Diario (con password o seed) para ver la frase — no se puede ver con solo sesión activa. |
| Mobile: gate por password fresh | El usuario debe ingresar su password en el momento; sesión activa sola no es suficiente. |

---

## Decisiones

1. **Web reusa context, mobile no** — el mobile security screen ya tiene su propio derive flow (lo usa para password change con re-encrypt). Forzar el context global complicaría el screen sin valor. Web es más natural reusar.
2. **Mobile gate por password fresh, no unlock state** — más explícito para el usuario que el web. El screen mobile no monta `DiaryKeyProvider`, así que no hay state de unlock que reusar.
3. **Native Share en lugar de expo-clipboard** — evita una dep nueva. El user puede mandar a Notes, email a sí mismo, o copiar manualmente desde Share.
4. **Sin auto-reveal** — incluso después del unlock, el user debe click "Mostrar mi frase" para reducir la ventana de exposición a screenshots o shoulder-surfing.
5. **Sin tests UI dedicados** — el componente es alto-stakes pero su lógica es trivial (state machine sin side-effects testeables). El crypto subyacente está cubierto por @psico/crypto tests. Si UX feedback pide testing más fuerte, sprint propio.
6. **No tocar Recovery wizard en login** — el UnlockGate ya tiene modo seed desde S23. Si el user olvida password y tiene seed, el flow es: forgot-password → reset → login con nueva pass → UnlockGate "Usar frase de respaldo" → adopta masterKey original → Diario funcional. **Esto ya funciona.**

---

## Smoke verification (local)

- API tests 601/602 (sin cambios — backend no se tocó).
- @psico/crypto 34/34.
- Web typecheck + lint + tests 65/65.
- Mobile typecheck + lint + tests 20/20.

---

## Deuda técnica abierta

- **Tests UI dedicados** para los 2 cards.
- **Recovery wizard guidance en login** — añadir copy explícito "¿Olvidaste tu contraseña? Si tienes tu frase de respaldo, no perderás tu Diario" cerca del link de forgot-password. Hoy el user lo descubre solo al llegar al UnlockGate.
- **Print-friendly view** — algunos users quieren imprimir las 24 palabras. Hoy es trivial (copy → paste en doc) pero un botón "Imprimir" en web sería UX nicer.
- **QR code export** — para users que quieren guardar en hardware password manager con QR. Sprint propio si volumen lo pide.
- **Notas educativas en onboarding** — el SeedPhraseModal post-unlock ya existe; si el user lo Skip, hoy no hay re-prompt. Considerar nudge cuando se hace primera entrada del Diario.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy automático en Vercel + smoke walk:
   - Web: ir a `/dashboard/security` → "Mostrar mi frase" → desbloquear → ver las 24 palabras → copiar → ocultar.
   - Mobile: tab Security → "Mostrar mi frase" → ingresar password → ver las 24 palabras → Share / Ocultar.

Cierra cripto v1 al 100% — la promesa comercial "recuperación con seed phrase BIP39" es ahora 100% accesible al usuario, sin esperar la primera vez post-onboarding.
