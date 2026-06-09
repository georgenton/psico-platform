# Sprint 59 — Avatar upload + Email change

**Fecha:** 2026-06-09
**Rama sugerida:** `feature/sprint-59-avatar-email-change`
**Tests:** 451/452 API + 34/34 crypto + 50/50 web + 20/20 mobile (sin cambios — sprint UI)

---

## Lo que se construyó

Cierra dos deudas del S57 que quedaron en el TODO:

- **Avatar upload** — backend `POST /user/avatar` (multer + R2) llevaba meses ready, nadie lo invocaba desde UI.
- **Email change form** — backend `POST /user/email-change-request` (Resend) idem.

### Web

- **`AvatarUploadCard`** componente con file picker:
  - PNG/JPG/WebP/GIF, hasta 5 MB.
  - Validación client-side (formato + size) antes del POST.
  - Preview optimista del avatar nuevo cuando el upload responde.
- **`/api/avatar/route.ts`** Route Handler que proxea el multipart al backend con el Bearer token desde cookies. Necesario porque server actions no manejan multipart bodies.
- **`EmailChangeCard`** componente con:
  - Mostrar email actual.
  - Botón "Cambiar email" → input → "Enviar verificación".
  - Confirma con success banner cuando `verificationSentTo` vuelve del backend.
- Wire en `/dashboard/perfil/page.tsx` entre StatsGrid y EditProfileCard.

### Mobile

- **`EmailChangeCard`** componente con Modal + TextInput + Alert:
  - Mismo flujo que web pero con `Alert.alert` para confirmar éxito.
  - Wire en `(tabs)/profile.tsx` arriba de Achievements.
- **Avatar upload mobile diferido** — requiere `expo-image-picker` (dep nueva + permissions iOS/Android). Sprint propio cuando UX lo justifique.

---

## Decisiones

1. **Route Handler para avatar upload, no server action** — server actions no soportan multipart cleanly. La route handler lee cookies + forwarda el FormData crudo al backend.
2. **Validación client-side antes del POST** — file size + MIME type. Backend valida igual (defense in depth) pero error es más rápido sin roundtrip.
3. **Mobile avatar diferido** — `expo-image-picker` añade ~5 MB al bundle + permissions UX. Si UX lo pide, sprint propio.
4. **Email change UX:** input + verify a través de email link existente (`/verify-email?token=...` que ya existe desde S58). El backend manda el token al email nuevo (no al actual) para confirmar que el user controla esa cuenta.
5. **Sin tests UI nuevos** — diferido. Lo cubrimos en smoke walk (opción A).

---

## Smoke verification

- API 451/452, Crypto 34/34, Web 50/50, Mobile 20/20.
- Web typecheck + lint OK. Build 24 páginas.
- Mobile typecheck + lint OK.

---

## Deuda técnica abierta

- **Mobile avatar upload** — requiere `expo-image-picker`.
- **Tests UI dedicados** para AvatarUploadCard + EmailChangeCard (diferido).
- **Avatar URL cache busting** — si el R2 URL no cambia tras update, el browser puede cachear el viejo. Hoy el backend genera `avatars/{userId}/{Date.now()}.{ext}` así que la URL cambia. OK.
- **Email change con OAuth users** — si `authProvider !== LOCAL`, el backend acepta el cambio pero podría ser confuso. Edge case.
