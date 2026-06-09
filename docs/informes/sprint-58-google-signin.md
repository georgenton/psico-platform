# Sprint 58 — Google Sign-In (web)

**Fecha:** 2026-06-09
**Rama sugerida:** `feature/sprint-58-google-signin`
**Tests:** 451/452 API + 34/34 crypto + 50/50 web + 20/20 mobile (sin cambios — sprint UI)
**ADR aplicado:** [0009 — OAuth via Google ID token verification](docs/adr/0009-oauth-with-google-id-token.md)

---

## Lo que se construyó

Cierra la deuda S14: backend Google OAuth llevaba meses listo (`POST /api/auth/oauth/google`) pero el frontend nunca había renderizado el botón.

### Web

- **`GoogleSignInButton`** componente usando Google Identity Services (GIS) cargado vía `next/script`.
  - Renderiza el botón oficial de Google (rectangular, pill shape, customizable texto: signin/signup/continue).
  - Callback recibe el JWT id_token directo del browser.
  - Si `NEXT_PUBLIC_GOOGLE_CLIENT_ID` no está seteado, el componente se esconde (no rompe dev).
- **Server action `loginWithGoogleAction(idToken, from?)`** wraps `authApi.oauthGoogle` y maneja:
  - 401 → "No pudimos verificar tu cuenta de Google."
  - 409 → "Esta cuenta ya existe con email/contraseña. Iniciá sesión con esa modalidad." (auto-link rejected por defecto en backend, ADR 0009).
  - Cookies + redirect a /dashboard o `from`.
- **Login form** + **Register form**: dividir `O` + botón Google debajo del submit. Texto del botón cambia: "Iniciar sesión con Google" vs "Registrarse con Google".
- **`authApi`** extendido en `lib/api.ts` con `oauthGoogle(idToken)` + (re-añadido por divergencia main↔develop) los métodos `forgotPassword/resetPassword/verifyEmail` que vivían solo en main.

### Mobile

**Diferido** — requiere setup adicional:

- Dep nueva `expo-auth-session` + `expo-web-browser` + `expo-crypto`.
- Google Cloud OAuth clients para Android (con SHA1 cert fingerprint) e iOS (con bundle ID).
- Configurar `app.json` con scheme URI.
- Implementar `useAuthRequest` flow con id_token response.

Backend listo desde S14, mobile sprint propio cuando tengamos el OAuth setup nativo.

---

## Configuración requerida (vos)

**1. Vercel env var:**

Settings → Environment Variables (production + preview):

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=454764140886-0duag0rr9i1ebo42t04qkr6reb5bk72v.apps.googleusercontent.com
```

**2. Google Cloud Console — Authorized JavaScript origins:**

🔗 https://console.cloud.google.com/apis/credentials

OAuth client → Authorized JavaScript origins → agregar:

- `https://psico-platform-web.vercel.app`
- `http://localhost:3000` (para dev local)

Sin esto, GIS rechaza el render del botón con "origin not authorized".

---

## Decisiones

1. **GIS script directo, no `@react-oauth/google`** — la lib oficial de Google es estable y no necesita una abstracción más.
2. **`next/script` con `strategy="afterInteractive"`** — el botón se renderiza solo después de que la página ya interactúa. Evita FCP penalty.
3. **Server action en lugar de fetch directo desde el cliente** — el patrón del web es server actions con cookies. El id_token NO se queda en el browser después del callback (no se persiste).
4. **Mobile diferido** — el flow nativo requiere config Google Cloud adicional. Backend listo; sprint propio.
5. **Sin `useOneTap`** — el One Tap prompt es agresivo; preferimos botón explícito para v1. Activar cuando UX lo pida.

---

## Smoke verification

- API tests 451/452 (sin cambios).
- Web tests 50/50 (sin cambios).
- Mobile tests 20/20 (sin cambios).
- Typecheck + lint OK.
- Build OK (24 páginas).

---

## Privacy invariant

- El id_token de Google se envía al backend pero NUNCA persiste en cliente.
- Backend (`GoogleVerifier`) valida firma + audience + expira. No almacena el token raw — solo crea/matchea `User` por `providerId`.

---

## Deuda técnica abierta

- **Mobile Google Sign-In** — sprint propio con `expo-auth-session`.
- **One Tap prompt** — UX a evaluar; quizás en sprint de polish.
- **Apple Sign-In** — paridad simétrica (S14 deuda). Necesita Apple Developer account.
- **Server action no tiene tests dedicados** — diferido, cubre el smoke manual.
