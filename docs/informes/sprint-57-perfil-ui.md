# Sprint 57 — Perfil UI (web + mobile)

**Fecha:** 2026-06-09
**Rama sugerida:** `feature/sprint-57-perfil-ui`
**Tests:** 451/452 API + 34/34 crypto + 50/50 web + 20/20 mobile (+12 nuevos · 1 skipped sentinel · total 555)
**Bitácora previa:** Cierra la última área v1 del diseño que no tenía UI (10-perfil.md).

---

## Lo que se construyó

### Web

- Nav `Perfil` en el sidebar (icono 👤) antes de Notificaciones.
- `/dashboard/perfil/page.tsx` (Server Component) — fetcha `/user/me`, ensambla:
  - `ProfileHeader` — avatar + nombre + email + plan badge + miembro-desde
  - `StatsGrid` — 4 cards (racha, libros, diario, minutos) + footnote de mejor racha
  - `EditProfileCard` — Client Component, edit firstName/city/country con optimistic save + dirty detection
  - `AchievementsGrid` — locked/unlocked con progress bar
  - `ShortcutsGrid` — links a Notificaciones, Seguridad, Mi plan
  - `DangerZone` — export data (cooldown), delete account (con password confirm), logout
- `actions/profile.ts` — 5 server actions: updateProfile, requestEmailChange, requestDataExport, requestAccountDelete, logoutFromPerfil
- `lib/api.ts` extendido con `authApi.forgotPassword/resetPassword/verifyEmail` (cierra deuda S14 frontend).

### Mobile

- `usersApi` extendido con 4 métodos nuevos: updateProfile, requestEmailChange, requestDataExport, requestAccountDeletion.
- `(tabs)/profile.tsx` ahora carga `usersApi.getMe()` con pull-to-refresh + monta:
  - StatsGrid (mismo set que web)
  - AchievementsList (cards locked/unlocked)
  - Shortcuts a Notifications/Security/Plan
  - DangerZone (export + delete con Modal RN para password)
- Tab `Perfil` desabilitado (`href: null`) → visible. Tab `Security` queda accesible vía Perfil shortcut.

### Tests UI (+12 web)

- `StatsGrid.test.tsx` (4) — zero state, día/días unit, longest-streak footnote.
- `AchievementsGrid.test.tsx` (4) — empty state, render multiple, progress shown locked, hidden unlocked.
- `EditProfileCard.test.tsx` (4) — render, Save disabled when clean, submit happy, inline error.

---

## Decisiones

1. **Profile.timezone fuera del Perfil principal** — vive en `/dashboard/notifications` (S54). El usuario que llega al perfil no necesita ese ajuste — es una preferencia técnica.
2. **Edit profile solo en web (no mobile)** — el `usersApi.updateProfile` existe en ambos, pero el form mobile lo dejamos para un sprint dedicado a mood + city pickers nativos. Mobile muestra los datos read-only en cuenta. Deuda S58.
3. **Avatar upload (POST /user/avatar) NO se implementó** — backend existe pero la UI necesita un image picker (`expo-image-picker` mobile + drag-drop web). Sprint propio.
4. **Email change** — backend ready (POST /user/email-change-request), pero el form lo difiero a sprint propio porque requiere flujo "ingresá nuevo + confirmá nuevo + click link". Lo dejamos como TODO en `actions/profile.ts`.
5. **Mobile DangerZone Modal** — RN Modal con TextInput secureTextEntry. No usamos `Alert.prompt` porque solo soporta iOS.
6. **Server action logout** vs `logoutAction` existente — el existente apunta a `/login` con `?from=/dashboard/perfil`. El nuevo `logoutFromPerfilAction` deletea cookies y redirige a `/login` sin from. Más simple.

---

## Smoke verification

- API tests 451/452 (sin cambios).
- @psico/crypto 34/34.
- Web tests 50/50 (+12).
- Mobile tests 20/20 (sin cambios — no añadimos tests mobile en este sprint).
- Typecheck + lint OK en web + mobile + types + api-client.
- Web build OK (24 páginas).

---

## Privacy preservada

- `dataExportRequested` y `accountDeleteRequested` ya están en `me.privacy` (S9). El nuevo UI las muestra como "ya pedido" y deshabilita los botones.
- No tocamos el cripto del Diario.
- El `DangerZone` mobile usa SecureStore implícito via `apiClient` (Bearer token). Password se manda en el body del POST `/user/delete-request` — backend lo valida con bcrypt y nunca lo loggea.

---

## Deuda técnica abierta

- **Edit profile mobile** — UI nativa con city/country pickers.
- **Avatar upload** — image picker web + mobile.
- **Email change form** — el endpoint existe; falta el flow UI completo.
- **Preferences toggle UI** (voicePreference, theme, weeklyGoalMinutes) — los preferences están en el backend pero no hay UI dedicada. Hoy se setean implícitamente vía Onboarding.
- **Mobile DangerZone tests** — diferido (modal RN frágil en jest-expo, ya visto en S54).
- **`logoutFromPerfilAction` no revoca el refresh token en el back** — el `logoutAction` existente sí; reusar antes de release.
