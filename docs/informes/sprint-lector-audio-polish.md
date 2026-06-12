# Sprint Lector Audio Polish — transcript sync + speed control

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-lector-audio-polish`
**Tests:** 20/20 mobile (sin cambios) · 122/122 web · 653/654 API · 34/34 crypto

---

## Lo que se construyó

Cierra dos de las deudas técnicas que dejó el sprint anterior `feature/sprint-lector-audio`:

1. **Transcript sync** — cuando el cursor del audio cae dentro de un segmento del transcript con `blockId` no-null, el bloque correspondiente del lector se centra en pantalla automáticamente. Backend ya emitía `LectorAudioTranscriptSegment[]` desde S6.
2. **Speed control** — chips de 0.75× / 1× / 1.25× / 1.5× en el bar de audio. Web usa `audio.playbackRate`, mobile usa `expo-av`'s `setRateAsync(rate, shouldCorrectPitch: true)`.

### Web — `apps/web/src/components/dashboard/lector/AudioBar.tsx`

- **Speed control:** `useState<SpeedRate>(1)` + `useEffect` que asigna `audioRef.current.playbackRate = speed` cuando cambia el state o se monta el `<audio>`. UI: row de chips con `aria-pressed`.
- **Transcript sync:** `useMemo` ordena el transcript por `start` (defensive). Handler `onTimeUpdate` corre binary search O(log n) para encontrar el segment activo. State `activeBlockId`. `useEffect` separado hace `scrollIntoView({ behavior: "smooth", block: "center" })` cuando cambia, con `lastScrolledBlockRef` para no rescroll innecesario.
- **Hit-test del bloque:** `document.querySelector('[data-block-id="..."]')` — el BlockRenderer ya emite ese atributo desde S6.

### Mobile — `apps/mobile/src/components/dashboard/lector/LectorAudioBar.tsx`

- **Speed control:** mismo state machine que web. `useEffect` llama `sound.setRateAsync(speed, true)` — el segundo arg `shouldCorrectPitch` mantiene voces naturales a 1.25×/1.5× en lugar de chipmunk-arlas.
- **Transcript sync:** `sortedSegments` memoizado, binary search idéntica. Implementado dentro de `onStatus` (callback de `expo-av`'s `setOnPlaybackStatusUpdate`) — usa el `positionMillis / 1000` para igualar la unidad del backend (segundos). `activeBlockRef` (no state) para evitar re-renders mientras se llama el callback ~2×/seg.
- **Comunicación al screen:** prop `onActiveBlockChange?: (blockId | null) => void`. El screen (`[chapterOrder].tsx`) recibe el callback y hace `scrollViewRef.current.scrollTo({ y, animated })` usando el `blockOffsetsRef` que ya mantenía para el heartbeat.
- **Scroll offset:** restamos 64px del top del bloque para que el bloque activo no quede pegado al edge superior (sino centrado-ish con un comfortable padding).

### Decisiones

1. **Binary search en lugar de linear scan** — `timeupdate` se dispara ~4×/s en web y ~2×/s en mobile (cada 500ms con `progressUpdateIntervalMillis`). Linear scan sobre N=50 segments sería N×4 = 200 ops/s. Binary search baja a `log₂(50)×4 ≈ 24 ops/s`. Inmaterial para correctness pero saludable para batería en mobile.
2. **`shouldCorrectPitch: true` en mobile** — sin esto, hablar a 1.25× es comprensible pero suena claramente acelerado. Con corrección de pitch se siente como un narrador hablando más rápido naturalmente. Web `<audio>` lo hace por defecto.
3. **Refs en lugar de state para `activeBlockRef` mobile** — `onStatus` se llama ~2×/s. Setear state ahí dispara re-renders del callback memoizado en cada update. Ref evita la cascade; el callback al screen dispara solo cuando el bloque cambia (lo cual es ~1×/párrafo, no por tick).
4. **`lastScrolledBlockRef` (web) / `lastAudioScrolledRef` (screen mobile)** — sin esto, cualquier re-render del componente reactivaría el `useEffect` y re-scrollearía al mismo bloque. Con el ref, scrolleamos solo cuando el bloque cambia.
5. **Sin acoplar audio scroll con user scroll** — si el usuario hace scroll manual mientras el audio reproduce, el siguiente cambio de bloque del audio reposiciona. Aceptable: el usuario sabe que el audio le mueve la página; si no quiere eso, pausa.
6. **Comfort offset 64px en mobile** — magic number cosmético. Puede ser una variable themed cuando el diseño pida más control.

---

## Lo que NO se construyó (decisiones explícitas v1)

- **Background audio mobile** — `expo-av` permite `staysActiveInBackground: true` + Info.plist + foreground service Android. Mucho boilerplate por feature de nicho. Diferido.
- **Sleep timer** — pause automático en N minutos. Trivial pero no urgente.
- **Active block highlight visual** — además de centrar el bloque, podríamos darle un border lavender. Decidido no — el centrado ya es suficiente signal sin distraer la lectura.
- **Scrubbing manual desincroniza transcript** — si el usuario hace scrub en mobile/web, el cursor brinca y el next `timeupdate`/`onStatus` recalcula el bloque correcto. Funciona bien sin trabajo extra.

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

1. Capítulo con audio y transcript con segments tagged a blockIds.
2. User abre AudioBar → fetch → play.
3. A los ~3s el cursor cae en el segment 0 que ancla a block #abc — UI hace smooth scroll del bloque #abc al centro de la viewport.
4. Cursor avanza a segment 1 → bloque #def se centra.
5. User toca chip `1.25×` → audio acelera (con pitch correction en mobile, sin ella en web por default).
6. User pausa → bloque activo se queda donde está.
7. User colapsa el bar → audio pausa, no auto-scroll más.

---

## Deuda técnica abierta

- **Background audio mobile** (iOS + Android foreground service).
- **Sleep timer**.
- **Visual highlight del bloque activo** — alternativa: leve background tint lavender sobre el bloque. Quedó fuera por ahora.
- **Manual scroll lock cuando audio reproduce** — opt-in para users que quieran leer otra parte mientras escuchan. Probablemente innecesario.
- **Sin tests UI dedicados** — RN Audio mocks costosos. Smoke manual.

---

## Próximo paso

Sprint **JSDoc round 5 — DTOs v2 (Terapia + Author + Onboarding)** en cola para ahora mismo. Sprint pendiente de ops: **Bugfix #2 Stripe price IDs reales** desde Sesión 30.
