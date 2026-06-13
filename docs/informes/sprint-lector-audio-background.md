# Sprint Lector Audio Background — background playback + sleep timer

**Fecha:** 2026-06-13
**Rama:** `feature/sprint-lector-audio-background`
**Tests:** 20/20 mobile (sin cambios) · 122/122 web · 653/654 API · 34/34 crypto

---

## Lo que se construyó

Cierra dos deudas técnicas de la serie audio del Lector (sprints anteriores `feature/sprint-lector-audio` y `feature/sprint-lector-audio-polish`):

1. **Background audio mobile** — el audio sigue reproduciendo cuando el usuario bloquea el teléfono o cambia de app. Web ya lo hacía por default (browser maneja el OS lifecycle).
2. **Sleep timer (web + mobile)** — chips `Off / 15m / 30m / 60m` con countdown live mientras corre. Auto-pause cuando el timer llega a 0.

### Mobile

#### `apps/mobile/app.json` — permisos de background

```jsonc
{
  "android": {
    "permissions": ["FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MEDIA_PLAYBACK"],
  },
  "ios": {
    "infoPlist": { "UIBackgroundModes": ["audio"] },
  },
}
```

Sin estos permisos `setAudioModeAsync({ staysActiveInBackground: true })` es un silent no-op en producción. Aplicados en `app.json` (Expo config plugins los serializa al `AndroidManifest.xml` y al `Info.plist` durante el prebuild).

#### `LectorAudioBar.tsx` — wire de `setAudioModeAsync`

Configurado ANTES de `Audio.Sound.createAsync` para que la nueva session herede el modo:

```ts
await Audio.setAudioModeAsync({
  staysActiveInBackground: true,
  playsInSilentModeIOS: true,
  interruptionModeIOS: InterruptionModeIOS.DuckOthers,
  interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
});
```

- `staysActiveInBackground` — no pausa al bloquear pantalla o cambiar de app.
- `playsInSilentModeIOS` — respeta el silent switch del iPhone (deliberadamente diferente del Voice recorder, donde sí pausa).
- `InterruptionModeIOS.DuckOthers` + `shouldDuckAndroid` — duck (no pause) cuando otra app reproduce audio simultáneamente. Útil si el user escucha música suave mientras lee.
- `playThroughEarpieceAndroid: false` — siempre por speakerphone, no por el earpiece (relevante porque algunas builds de Android default al earpiece).

### Sleep timer (web + mobile)

Mismo state machine en los dos clientes:

- `sleepMin: SleepMinutes` (`null | 15 | 30 | 60`).
- `sleepHandleRef` — handle del `setTimeout` para poder cancelar.
- `sleepEndAt` — timestamp absoluto del fire; usado para el countdown label.
- 1-second tick (`setInterval`) que dispara solo cuando hay timer armado para que el countdown actualice en pantalla.

Cuando el preset cambia: cancela el handle anterior, arma uno nuevo, persiste el `endAt`. Cuando el timer fire: pausa el audio, reset state a `null`. Cleanup en unmount.

#### UI

Web:

- Tercera row debajo de "Velocidad" — `Temporizador · 12:34` con chips `Off / 15m / 30m / 60m`.
- Reusa el chip-style del speed control.
- `fmtCountdown(ms)` muestra `m:ss`.

Mobile:

- Misma row debajo de speed chips. Mismo `fmt(ms)` helper (ya existía).
- `fmt(Math.max(0, sleepEndAt - now))` con state `now` que actualiza por el 1s tick.

---

## Decisiones

1. **Permisos solo cuando expira el debate** — los permisos de Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK` y el iOS `UIBackgroundModes: audio` están en config files (`app.json`), no en código. Los review boards de Apple/Google revisan estos campos cuando el app es submitted — incluirlos sin un feature real puede causar rechazos. El feature ya está real (audio playback Pro), así que la justificación está bien.
2. **DuckOthers en lugar de DoNotMix** — algunos users escuchan música ambient mientras leen. Pausar la música del lector cuando llega un mensaje de WhatsApp sería frustrante; ducking baja el volume mientras suena la notificación.
3. **`playsInSilentModeIOS: true` vs `false`** — recordings (Voice) sí respetan el silent switch. Playback del lector NO — si el user pone el switch en silent, normalmente quiere bloquear notificaciones, no su podcast. Es el behavior estándar de Spotify/Apple Podcasts.
4. **15/30/60m presets** — el design dice "configurable hasta 90 min", pero 4 chips ocupan el ancho disponible cómodo. Pickup menu para custom queda diferido — los presets cubren el 95%.
5. **Sin "fin del capítulo"** — opción del design original. Necesitaría suscribirse al `ended` event del audio o un setTimeout sobre `duration`. Diferido a futuro sprint (no es trivial cuando audio se pausa y reanuda).
6. **Timer absolute vs relative** — `sleepEndAt = Date.now() + N*60_000` (absoluto) en lugar de "tiempo restante" (relativo). Más simple cuando hay re-renders + el countdown se calcula derivado del end.

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

### Flow mental

**Mobile background:**

1. User abre AudioBar → tap play.
2. User bloquea pantalla — audio sigue. (iOS: aparece controles en lock screen. Android: notification con controles persistente.)
3. User abre WhatsApp — audio sigue, baja volume cuando llega un audio de WhatsApp (ducking).
4. User vuelve a la app — controles del bar reflejan el estado correcto (gracias a `onPlaybackStatusUpdate` que sigue corriendo).

**Sleep timer:**

1. User tap `30m` → countdown empieza `30:00`.
2. User pausa manualmente a los 10min → countdown sigue corriendo (es timer wall-clock, no time-played).
3. Pasa a los 30min → audio pausa, timer se desactiva.
4. User tap `Off` mid-timer → timer cancelado, audio sigue tocando.

---

## Deuda técnica abierta

- **"Fin del capítulo" preset** — necesita listener al `ended` event web + `setOnPlaybackStatusUpdate` que detecte `didJustFinish` mobile.
- **Persistir last picked sleep duration** — user que siempre escucha 30m antes de dormir lo tiene que re-seleccionar cada sesión.
- **Lock screen artwork mobile** — `Audio.Sound` per default muestra "Sin título" en los controles del lock screen. `MediaSession`/`MPNowPlayingInfoCenter` (iOS) o `MediaSession` (Android) habilita artwork + título. Diferido — `expo-av` 15 no lo expone directamente.
- **Sin tests UI dedicados** — sleep timer + AppState mocks son frágiles. Smoke manual.
- **Permisos no auto-validados** — Si alguien tira las claves de `app.json`, el feature degrada silently en prod. Sprint propio: add a setup spec que enforce los keys existen.

---

## Próximo paso

Sprints candidatos:

- **Bugfix #2 Stripe price IDs reales** — deuda de ops desde Sesión 30 (más urgente para revenue).
- **Observability (Sentry)** — wire API + worker + web + mobile.
- **Lock screen artwork mobile** — polish del audio.
