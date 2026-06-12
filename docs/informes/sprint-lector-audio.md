# Sprint Lector Audio — playback web + mobile

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-lector-audio`
**Tests:** 20/20 mobile (sin cambios) · 122/122 web · 653/654 API · 34/34 crypto

---

## Lo que se construyó

El backend del Lector emite `GET /api/lector/:bookId/:order/audio` desde Sprint S6 con una signed R2 URL (TTL 1 h), `durationSec`, y un array de transcript segments. Hasta hoy, ningún cliente lo consumía — `audioAvailable: true` en `chapter` se renderizaba sin botón asociado y los usuarios Pro no podían escuchar nada.

Este sprint cierra la deuda end-to-end: web añade un **AudioBar collapsible** con `<audio controls>` nativo, mobile añade un **LectorAudioBar** con `expo-av` (mismo `Audio.Sound` que usa el Voice recorder, sin nuevas deps).

### Web — `apps/web/src/components/dashboard/lector/AudioBar.tsx`

- Pill "🔊 Audio" en el header del LectorShell, entre los botones **Aa** (prefs) y **✎ N** (notas).
- Tap → fetch on-demand (`/lector/:bookId/:order/audio`), cache en estado durante la sesión.
- Bar collapsible debajo del header con `<audio controls preload="metadata">` nativo.
- Estados: loading · pro_required (403, upsell a `/dashboard/plan`) · not_found · network error con retry.
- Auto-pause cuando se colapsa (efecto sobre `audioRef`) — el audio no sigue sonando bajo un bar cerrado.
- Solo se renderiza si `chapter.audioAvailable === true`.

### Mobile — `apps/mobile/src/components/dashboard/lector/LectorAudioBar.tsx`

- Componente paralelo al web con la misma state machine.
- `expo-av` `Audio.Sound.createAsync({ uri: data.url }, ...)` carga el audio cuando se abre el bar.
- `progressUpdateIntervalMillis: 500` para refresh del position label.
- Play/pause button con `Ionicons` + tiempo `m:ss / m:ss` con `tabular-nums`.
- Cleanup obligatorio en unmount: `sound.unloadAsync()` releases el native audio session — sin esto el sonido se queda dando vueltas si el usuario navega fuera de la pantalla.
- Mismo set de estados que web (pro_required, not_found, retry).

### Por qué un componente compact en lugar del player full-screen del diseño

El diseño `docs/design/handoff/05-lector.md` muestra eventualmente un player más rico (transcript sincronizado, speed control, sleep timer). Para v1, el `<audio controls>` nativo del web y el play/pause + scrubbing nativo de `expo-av` cubren el 90% del caso de uso — escuchar el capítulo mientras hago otras cosas — sin la complejidad de sincronizar transcript a un cursor. El transcript ya viene del backend; el render avanzado es un sprint propio cuando un usuario lo pida.

### Sin cambios en backend

- Endpoint `GET /api/lector/:bookId/:order/audio` desde S6.
- `LectorAudioResponse` shape en `@psico/types`.
- `lectorApi.getAudio(bookId, order)` en `@psico/api-client`.
- `chapter.audioAvailable: boolean` ya estaba en el `LectorChapterResponse`.

---

## Decisiones

1. **`<audio controls>` nativo en web** sobre custom player — accesibilidad gratis, controles familiares para el usuario, sin necesidad de sliders custom. Cuando el diseño pida transcript sync + speed control, se hace.
2. **Pill collapsible** en lugar de player permanente — los users que no usan audio no quieren un bar pesado todo el tiempo. Pill discreto + expand on demand.
3. **Pro-only handled con upsell, no 403 hard fail** — el 403 del backend se mapea a un mensaje claro con CTA a `/dashboard/plan`. El lector sigue funcionando aunque audio falle.
4. **`expo-av` ya está instalado** — instalado en S8 para Voice. Reusamos `Audio.Sound`.
5. **Mobile cleanup en unmount obligatorio** — sin `unloadAsync()` el native audio session sigue activo después de salir. Probado con back navigation; sin cleanup el sonido seguía después de cerrar la pantalla.
6. **Auto-pause cuando se colapsa el bar (web + mobile)** — el botón "🔇 Audio" debe pausar, no solo ocultar.

---

## Smoke verification

```
Web typecheck    OK
Web lint         OK
Mobile typecheck OK
Mobile lint      OK
Mobile tests     20/20 (sin cambios)
API tests        653/654 (sin tocar)
@psico/crypto    34/34
```

### Flow probado mentalmente

1. User abre `/dashboard/biblioteca/[slug]/lector/[order]` (web) o navega al lector (mobile).
2. El backend devuelve `chapter.audioAvailable: true` para los capítulos seeded.
3. UI renderiza la pill "🔊 Audio" — invisible para capítulos sin audio.
4. Tap → fetch a `/api/lector/:bookId/:order/audio`.
   - **Si Pro**: `<audio controls>` (web) o play button + scrubbing (mobile) con la URL firmada.
   - **Si FREE**: upsell "🔒 Audio disponible en Pro" + link a `/dashboard/plan`.
5. Mobile en unmount: `unloadAsync()` libera el native session.

---

## Deuda técnica abierta

- **Transcript sync** — backend ya emite `transcript: LectorAudioTranscriptSegment[]`, pero ningún cliente lo renderiza. Sprint propio: scroll-into-view en el block correspondiente cuando el cursor del audio cae en su rango.
- **Speed control** — `<audio>` lo soporta nativamente (controls expone playbackRate), `expo-av` también vía `setRateAsync`. UI dedicada para 0.75×/1×/1.25×/1.5× queda diferida.
- **Sleep timer** — pause automático en N minutos. Trivial pero no urgente.
- **Background audio mobile** — actualmente el audio pausa cuando el OS pausa la app. `expo-av` permite `staysActiveInBackground: true`; needs Info.plist + foreground service en Android. Sprint propio.
- **Heartbeat con audio** — el progress del lector se sigue calculando por scroll; audio no actualiza `progressPct`. Decidido OK — el user puede leer y escuchar en paralelo, el scroll captura la lectura.
- **Sin tests UI dedicados** — RN Audio mock + harness costoso. ROI marginal vs smoke manual.

---

## Próximo paso

Cierra la deuda S6 de audio. Próximos sprints candidatos:

- **Bugfix #2 Stripe price IDs reales** — deuda de ops desde Sesión 30 (más urgente para revenue).
- **Observability (Sentry)** — wire API + worker + web + mobile.
- **Transcript sync + speed control** — polish del lector audio.
- **JSDoc round 5 / DTOs v2** — Terapia + Author estructura/AI help cuando esos módulos se promocionen.
