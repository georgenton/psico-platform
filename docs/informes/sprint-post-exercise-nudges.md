# Sprint — Nudges post-ejercicio (backlog #2)

**Rama:** `feature/post-exercise-nudges`
**Fecha:** 2026-07-10
**Tests:** Web 286 (+5) · Mobile 63 (+5) · API 783/784 (sin cambios) · Crypto 34 · typecheck ×3 + lints + OpenAPI verdes.

---

## 1. Qué cierra

Segundo ítem del backlog aprobado. Tras cerrar las **actividades interactivas** (sprint anterior), este cierra el bucle: cuando alguien **termina** una actividad, en vez de dejarlo en un callejón, se le invita suavemente a seguir — reflexionar sobre cómo se siente, o llevar la calma a una conversación con Eco.

Dos puntos de "completado" ganan nudge:

| Actividad terminada                                        | Nudge                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 🌬️ **Respiración** (fase "Listo")                          | Dos CTAs: «🪷 Escribir cómo me siento» → abre Reflexión sembrada · «🌿 Conversar con Eco» → abre Eco sembrado |
| 🪷 **Reflexión guardada** (estado "Guardado en tu diario") | Botón «🌿 Conversarlo con Eco» → salta a la pestaña Eco sembrada                                              |

Cero backend, cero migración, cero cambio de wire — todo cliente, reusando el dock/sheet ya existente.

---

## 2. Diseño

### Seeds compartidos (`@psico/types/chapter-exercises.ts`)

Tres helpers nuevos para que web + mobile digan lo mismo:

- `breatheReflectSeed()` → «Acabo de hacer una pausa de respiración. Ahora mismo me siento… »
- `breatheEcoSeed()` → invitación a aprovechar la calma con Eco.
- `reflexionEcoSeed()` → «Acabo de escribir una reflexión … me gustaría conversarlo contigo.»

### Web

- **`BreathingExercise`** gana `onReflect?` / `onAskEco?` opcionales. En la fase "done" muestra las dos CTAs suaves; al tocar una, cierra el overlay (`onClose`) y dispara el callback.
- **`ReflexionTab`** gana `onAskEco?`. En el estado "guardado" añade «🌿 Conversarlo con Eco» arriba de «Escribir otra» (que baja a estilo muted).
- **`ReaderCompanionDock`** propaga `onReflexionAskEco` → `ReflexionTab.onAskEco`.
- **`LectorShell`** centraliza el patrón de apertura del dock en dos helpers, `openEcoInDock(seed)` / `openReflexionInDock(seed)`, y los reusa en TODOS los puntos (EcoTopicCard, exercises, breathing nudges, reflexión→Eco). Reduce la duplicación que había en 4 sitios.

### Mobile (paridad)

- **`BreathingExercise`** (RN Modal) gana el mismo par de CTAs en la fase "done".
- **`ReflexionSheetTab`** gana `onAskEco?` + el botón en el estado guardado.
- **`ReaderCompanionSheet`** propaga `onReflexionAskEco`.
- **Pantalla del lector** reusa el `openCompanion(tab, opts)` ya existente para los tres saltos (breathe→reflexión, breathe→eco, reflexión→eco).

---

## 3. Privacidad (ADR 0007 intacto)

Los nudges solo **abren una superficie de escritura** o **siembran un composer** con texto genérico redactado por nosotros. La respuesta de la reflexión se sigue cifrando en la app (solo ciphertext + números on-device); el mensaje de Eco se cifra como siempre. Ningún nudge transporta el texto del diario ni ninguna palabra escrita por el usuario entre pantallas.

---

## 4. Tests

- **Web `BreathingExercise.test.tsx`** (+5): ritual antes de terminar, las dos CTAs en "done", cada CTA cierra + dispara su callback, y el row se omite sin callbacks. Usa `vi.useFakeTimers` para saltar al fin del ciclo.
- **Mobile `BreathingExercise.test.tsx`** (+5): paridad con `jest.useFakeTimers`. `afterEach` usa `clearAllTimers` (no `runOnlyPendingTimers`) para que el loop de Animated no dispare un update de native-driver tras el unmount.

---

## 5. Verificación

- Web typecheck + lint + **286 tests**.
- Mobile typecheck + lint + **63 tests**.
- API + crypto sin cambios; OpenAPI `generate:check` in sync.

---

## 6. Backlog restante (aprobado)

- **Sugerencias adaptativas de Eco** — según interacción con libro/video/actividades + el Mapa Emocional. _(siguiente)_
- **Reproductor de video real** — hoy card mock 🎬.
- Character-level highlights en mobile.
- Subir los m4a a R2.
