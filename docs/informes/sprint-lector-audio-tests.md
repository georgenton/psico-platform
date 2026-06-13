# Sprint Lector Audio Tests — UI tests del LectorAudioBar (web + mobile)

**Fecha:** 2026-06-13
**Rama:** `feature/sprint-lector-audio-tests`
**Tests:** 135/135 web (+13) · 29/29 mobile (+9) · 654/655 API + 34/34 crypto (sin cambios)

---

## Lo que se construyó

Cierra la deuda más visible del sprint inmediatamente anterior (`sprint-lector-audio-metadata`, 2026-06-13): hasta hoy el AudioBar — web y mobile — no tenía tests propios. Es el componente más complejo del Lector (state machine de 5 ramas: loading/pro/not_found/error/ready + speed chips + sleep timer + transcript sync + metadata rendering) y el feature con más superficie cliente reciente. Sprint propio para sembrarlo.

22 tests nuevos en total — 13 web + 9 mobile — cubriendo los paths críticos.

### Web — `apps/web/src/components/dashboard/lector/AudioBar.test.tsx`

13 tests organizados en 5 describe groups:

- **pill toggle** (2 tests): pill cerrada en mount sin fetch; un solo fetch con `Authorization: Bearer` al abrir.
- **fetch state branches** (3 tests): 403 → upsell Pro con link a `/dashboard/plan`; 404 → "este capítulo aún no tiene audio"; network error → retry CTA que dispara una segunda llamada.
- **metadata rendering** (4 tests): `<img>` cuando `artworkUrl` empieza por `http`; gradient fallback `<div>` cuando es token (no `<img>`); subtitle + artist; `<audio>` nativo con la URL signed.
- **speed control** (2 tests): 4 chips con 1× activo por default (aria-pressed); flip al picar 1.5×.
- **sleep timer** (2 tests, con `vi.useFakeTimers`): Off activo por default; picar 15m arma el countdown y la label "Temporizador · 15:00" aparece.

### Mobile — `apps/mobile/src/components/dashboard/lector/LectorAudioBar.test.tsx`

9 tests organizados en 3 describe groups:

- **pill toggle** (3 tests): pill con label "Audio"; sin llamadas en mount; `setAudioModeAsync` se llama ANTES de `Sound.createAsync` al abrir (verifica el orden del sprint background-audio).
- **fetch state branches** (3 tests): rechazo `{ statusCode: 403 }` → "Audio disponible en Pro"; `{ statusCode: 404 }` → "Este capítulo aún no tiene audio"; error genérico → "Reintentar".
- **metadata rendering** (3 tests): título + subtitle/artist visible; play button + 4 speed chips; 4 sleep chips con Off + 1× como únicos selected (`accessibilityState`).

---

## Decisiones

1. **Vitest + RTL para web, Jest + jest-expo + RNTL para mobile** — sigue el split de S39/S40. No hay alternativa razonable: jest-expo necesita el babel preset de RN para parsear el component bajo test; Vitest no tiene equivalente.
2. **Mock de `fetch` (web) vs mock de `lectorApi.getAudio` (mobile)** — el cliente web usa `fetch` directo con Bearer header porque el AudioBar necesita el access token explícito (no pasa por el wrapper `apiClient` singleton — recibe `token` como prop desde el server component). El mobile sí pasa por `lectorApi`. Cada test stubea la capa que su component consume realmente.
3. **Mock de `expo-av` con `mock*` prefix** — Jest hoister rechaza referencias a variables out-of-scope DENTRO de la factory de `jest.mock`, EXCEPTO si el nombre empieza por `mock` (case-insensitive). Convención aplicada en todas las refs (mockCreateAsync, mockSetAudioModeAsync, etc.) con un comentario explicando el porqué.
4. **`@expo/vector-icons` ya mockeado globalmente** (S40 setup) — los iconos `Ionicons` se renderizan como `<Text>{name}</Text>`, así que `getByText("volume-high")` funcionaría pero preferimos `getByLabelText` por accesibilidad.
5. **No mockear `Audio.Sound.setOnPlaybackStatusUpdate`** — el callback que se le pasa (`onStatus`) no se dispara en el test porque ningún status update ocurre sin un audio real. Eso es deseable: estamos testeando el render shell + state machine, no el lifecycle del audio nativo.
6. **`MockInstance<typeof fetch>` en lugar de `ReturnType<typeof vi.spyOn>`** — el genérico default de `vi.spyOn` colapsa a la forma `(...args: unknown[]) => unknown` que no es asignable al fetch real. Importamos el tipo `MockInstance` de vitest directamente.
7. **Sleep chip "Off active" verificado por filter sobre todos los buttons con `accessibilityState.selected===true`** — la primera versión usaba `.parent` que en RNTL no expone props del Pressable. El filter sobre `getAllByRole("button")` es robusto.
8. **`useFakeTimers` solo en el group de sleep timer** — el primer intento puso fake timers en todos los describe groups; eso bloquea `waitFor` que asume timers reales. Lección: aislar el scope donde son realmente necesarios.

---

## Smoke verification

```
@psico/web tests       135/135 (+13 nuevos AudioBar)
@psico/mobile tests     29/29 (+9 nuevos LectorAudioBar)
@psico/web typecheck   OK
@psico/mobile typecheck OK
@psico/web lint        OK
@psico/mobile lint     OK
@psico/api tests       654/655 (+1 skipped sentinel, sin cambios)
@psico/crypto tests     34/34 (sin cambios)
```

---

## Deuda técnica abierta

- **Audio playback lifecycle no cubierto** — `play/pause` togglés y el `onStatus` callback no se ejercitan porque requieren mockear el ciclo de un audio nativo. Cubrir cuando migremos a `expo-audio` (que expone APIs más mockeables).
- **Transcript sync** no probado — el `onTimeUpdate` web y el `setOnPlaybackStatusUpdate` mobile dependen de un `currentTime` que avanza solo con audio real. Cubrir cuando exista un harness para audio simulado.
- **Speed `setRateAsync` mobile** se llama pero el test no verifica que pase `shouldCorrectPitch: true`. Cubrir si UX reporta voces aceleradas tipo chipmunk.
- **Web sleep timer fire (paused después de N min)** no probado — el `setTimeout` cancela el audio mediante `audioRef.current?.pause()`, pero el `<audio>` element en jsdom no es interceptable trivialmente. Cubrir con un mock del HTMLAudioElement.prototype si hace falta.
- **No hay tests del header pill cambiando entre "🔊 Audio" / "🔇 Audio"** post-cierre. Trivial pero diferido.

---

## Próximo paso

Sprints candidatos del backlog:

- **Bugfix #2 Stripe price IDs reales** — deuda ops desde Sesión 30.
- **Observability (Sentry)** — wire API + worker + web + mobile.
- **Migración expo-av → expo-audio** — el AudioBar entero se beneficia + harness de tests más rico.
- **Tests UI del LectorShell** — el container del Lector (block render + highlights + annotations + heartbeat) tampoco tiene tests propios.
