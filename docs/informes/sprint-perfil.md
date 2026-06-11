# Sprint Perfil — Preferencias + Privacidad en el perfil del usuario

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-perfil`
**Tests:** 65/65 web (+9 nuevos) · 20/20 mobile · 601/602 API · 34/34 crypto
**Design handoff:** [docs/design/handoff/10-perfil.md](../design/handoff/10-perfil.md)

---

## Lo que se construyó

El `/dashboard/perfil` web y el `(tabs)/profile.tsx` mobile ya tenían ProfileHeader / Stats / Avatar / EditProfile / Email change / Achievements / Shortcuts / DangerZone desde sprints anteriores. Faltaban las 2 secciones del handoff que necesitaban UI nueva: **Preferencias** (voz, theme, mejor horario, weekly goal, mood prompts) y **Privacidad** (3 toggles).

### Backend

Sin cambios. Los endpoints ya existían:
- `PATCH /api/user/preferences`
- `PATCH /api/user/privacy`

### Cliente API (`@psico/api-client`)

`usersApi` extendido con 2 métodos que faltaban — `updatePreferences` y `updatePrivacy`.

### Web — 2 cards nuevos en `/dashboard/perfil`

**`PreferencesCard.tsx`** — render-on-edit:
- Modo lectura: grid `dl/dt/dd` 2x3 con los 6 valores actuales (Voz, Tema, Mejor horario, Objetivo semanal, Prompts de ánimo, Idioma).
- Click "Editar" → form con: `<select>` voz · 3 botones theme · 4 chips bestTime · slider weekly goal 15-300 step 15 · checkbox moodPrompts.
- "Guardar" → server action `updatePreferencesAction` con revalidatePath. Flash "✓ Preferencias guardadas" 2.5s.
- "Cancelar" → restaura el draft al initial sin llamar al backend.

**`PrivacyCard.tsx`** — toggle inmediato:
- 3 switches: `shareDiaryWithTherapist`, `anonymizedAnalytics`, `marketingEmail`.
- Cada toggle dispara `updatePrivacyAction` con rollback optimista si falla.
- Footer educativo recordando que el Diario sigue cifrado E2E aunque el toggle "compartir" esté activo.

Server actions nuevas: `apps/web/src/app/dashboard/perfil/actions.ts`.

### Mobile — paridad de Privacy + onChanged

**`PrivacyCard.tsx`** mobile equivalent:
- 3 rows con título + hint + nativo `Switch` (lavender track).
- `onChanged` callback opcional para que el parent (profile screen) mantenga sync del state local.
- Mismo footer educativo del web.

Wire en `(tabs)/profile.tsx`: después de `EmailChangeCard`, antes de `AchievementsList`.

**Preferencias mobile** — diferido. El form requiere slider RN + selectores; mejor sprint dedicado si volumen lo justifica. Por ahora mobile mantiene Privacidad (alto valor de soberanía) y deja Preferencias en el web.

### Tests UI nuevos (+9)

**`PreferencesCard.test.tsx`** (4):
- Render summary labels en view mode.
- Switch a edit mode al click "Editar".
- `updatePreferencesAction` se llama con el draft completo en save.
- Cancel restaura initial sin llamar al backend.

**`PrivacyCard.test.tsx`** (5):
- Render 3 switches con sus hints.
- `aria-checked` refleja initial values.
- Switch click → `updatePrivacyAction` con el field correcto.
- Rollback cuando action throws.
- Footer educativo presente.

---

## Decisiones

1. **Preferences card render-on-edit** vs siempre-form — el card está 95% del tiempo en view mode; tener todos los inputs siempre visibles es ruido. View mode con "Editar" es más limpio.
2. **Privacy toggles inmediatos** vs "Guardar al final" — privacidad debe sentirse instantánea. Optimistic + rollback es el patrón correcto.
3. **Sin idioma editable en v1** — el design lo lista pero el backend solo soporta `es-419` por ahora. Lo muestro readonly hasta tener i18n real.
4. **Mobile sin Preferences** — el form es complejo (slider RN no nativo, segmented controls), prefiero shipear Privacy en mobile y dejar Preferences para sprint propio si Pulso demuestra fricción.
5. **Reuse de `dl/dt/dd`** — semánticamente correcto para descriptor list; valida con screen readers y mantiene markup limpio.

---

## Smoke verification (local)

- API tests 601/602 (sin cambios — backend no se tocó).
- @psico/crypto 34/34.
- @psico/types build OK.
- @psico/api-client build OK (con 2 métodos nuevos).
- Web typecheck + lint clean.
- Web tests 65/65 (+9 nuevos).
- Mobile typecheck + lint clean.
- Mobile tests 20/20.

---

## Deuda técnica abierta

- **Mobile PreferencesCard** — diferido.
- **Idioma editable** — esperar a tener i18n real (solo `es-419` por ahora).
- **Weekly Goal sin enforcement** — el slider guarda el valor pero ningún feature actualmente lo usa para nudges. Si Patrones lo expone como métrica vs goal, conectar.
- **Mood prompts toggle sin wire** — el campo se persiste; cuando algún feature lo lea (notificaciones, Eco intro), conectar.
- **Tests UI dedicados** para `PreferencesCard` faltan 2-3 escenarios (slider drag, range validation).
- **Sin animación** entre view↔edit (instantáneo).

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy automático a Vercel (sin migration ni envs nuevos).
3. Smoke walk:
   - Como user: abrir `/dashboard/perfil`.
   - Card "Preferencias" muestra valores actuales → click Editar → cambiar tema a Oscuro → Guardar → flash ✓.
   - Card "Privacidad" → toggle "Analíticas anónimas" → flash ✓ Guardado debajo.

Cierra el área 10 del diseño del consumer v1.
