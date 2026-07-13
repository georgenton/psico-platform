# Sprint — Resonancia desde ejercicios (cierra el tercer origen del ciclo ARC)

**Fecha:** 2026-07-12
**Rama:** `feature/arc-exercise-resonance`
**Cierra:** la deuda explícita de Fase H / sugerencias adaptativas — «oferta de resonancia desde `EXERCISE` (el enum ya la contempla; falta el flujo desde los ejercicios)».

---

## 1. Qué cierra

El ciclo ARC (Anclar → Relacionar → Confirmar) alimentaba el eje **Conexión** del mapa desde dos orígenes: `HIGHLIGHT` (nudge post-subrayado, Fase E) y `ECO` (oferta post-conversación, Fase H). El tercer valor del enum, `EXERCISE`, estaba cableado end-to-end en el backend (`Resonance.source`, `POST /resonances`, scoring ARC-C1) **pero no tenía productor de UI**. Un lector que interactúa sobre todo por **ejercicios** (no subraya, no chatea) no tenía forma de confirmar una resonancia → su eje Conexión quedaba en "Reuniendo datos" pese a la interacción profunda.

Este sprint cierra ese hueco: al **completar un ejercicio de reflexión** (guardar la reflexión sembrada desde el ejercicio), la pestaña ofrece confirmar el **concepto del capítulo** como resonancia con `source: "exercise"`.

## 2. Cómo

- **`ExerciseResonanceOffer`** (web + mobile) — componente presentacional standalone: recibe `concept` + `bookSlug` + `chapterOrder` (+ apiBase/token en web), muestra «Hiciste este ejercicio sobre «X». ¿Te resonó?» y confirma con `source: "exercise"`. Extraído a su propio archivo para poder testearlo sin la pestaña cripto-gated alrededor.
- **`ReflexionTab` / `ReflexionSheetTab`** — ganan props opcionales `fromExercise`, `concept`, `bookSlug`, `chapterOrder`. En el estado "guardado", si `fromExercise && concept`, renderizan `<ExerciseResonanceOffer>` sobre los botones existentes.
- **`ReaderCompanionDock` / `ReaderCompanionSheet`** — propagan `reflexionFromExercise` + `concept` (el `bookSlug`/`chapterOrder` salen del `scope` ya presente).
- **`LectorShell` / pantalla mobile del lector** — marcan `fromExercise=true` SOLO cuando la reflexión se abre desde un ejercicio (card de reflexión + nudge "reflexión" del ejercicio de respiración). El subrayado→reflexión queda en `false` (ya lo cubre el nudge de highlight). El `concept` = `chapterConcept(bookSlug, order, title)`.

**Respeta el ARC:** el ancla es completar el ejercicio; la confirmación es un tap explícito; descartar no guarda nada; idempotente por `(user, conceptKey)` — confirmar el mismo concepto por dos orígenes no lo duplica.

## 3. Privacidad (ADR 0007)

La resonancia lleva solo metadata de catálogo (`conceptKey`, `conceptLabel`, `bookSlug`, `chapterOrder`, `source`) — nunca el texto de la reflexión (que sigue cifrado E2E). El componente de la oferta no toca el ciphertext.

## 4. Verificación

| Suite                | Resultado                                                          |
| -------------------- | ------------------------------------------------------------------ |
| Web (Vitest + RTL)   | +3 (`ExerciseResonanceOffer.test.tsx`)                             |
| Mobile (Jest + RNTL) | +3 (`ExerciseResonanceOffer.test.tsx`)                             |
| Typecheck + lint ×2  | ✅ (web + mobile)                                                  |
| API / crypto         | sin cambios (backend ya soportaba `source: "exercise"` end-to-end) |
| OpenAPI              | sin cambios de wire                                                |

## 5. Decisiones

1. **Disparar al completar el ejercicio, no en la card** — respeta el "anclar antes de confirmar" del ARC (la card sola sería prematura).
2. **Solo el ejercicio de reflexión** (no la respiración pura) tiene la oferta en su estado guardado; la respiración que abre una reflexión también cuenta (es ejercicio).
3. **Componente extraído** para testabilidad — los dock tabs son cripto-gated y no tienen tests; el standalone sí.
4. **Sin gating por sesión** — el estado guardado es transitorio y la confirmación es idempotente, así que mostrarlo cada vez es inofensivo.

## 6. Deuda / siguiente

- Sin test del flujo completo (ejercicio → guardar → oferta) por el crypto gate; cubierto el componente de la oferta + el cableado por typecheck.
- Character-level highlights en mobile (bloqueado por RN) y subir m4a/videos a R2 (ops) siguen abiertos.
