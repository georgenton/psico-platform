# Sprint S68.B — Terapia mobile · Pre-sesión E2E + Feedback + Reschedule + Notifs + Recetas + Reservar

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s68b-terapia-mobile-lifecycle`
**Tests:** mobile 20/20 + web 50/50 + crypto 34/34 + API 509/510 (sin cambios — sprint UI)

---

## Lo que se construyó

Cierra el lifecycle del flow Terapia en mobile. Después de S68 (6 pantallas core), este sprint entrega los flows que faltaban para que el user pueda **reservar y vivir el ciclo completo desde el dispositivo**.

### 3 pantallas nuevas

```
/(tabs)/terapia/notificaciones                  # mark-all + bullet sin leer
/(tabs)/terapia/recetas                         # Pendientes / Completadas + toggle
/(tabs)/terapia/terapeutas/[id]/reservar        # Reserva 1-página con Linking a Stripe
```

### 2 modals nuevos

- **`FeedbackModal.tsx`** — bottom-sheet con rating ★ + tags + note opcional. Note **cifrada E2E con `useDiaryKey`** antes de salir del dispositivo. Submit → POST `/sessions/:id/feedback`.
- **`RescheduleModal.tsx`** — bottom-sheet con grid de slots agrupados por día, filtra el slot actual. Submit → PATCH `/sessions/:id/reschedule`.

### Detalle de sesión refactorizado

`(tabs)/terapia/sesiones/[id].tsx` ahora incluye:
- **Pre-sesión E2E composer** — encrypt/decrypt usando `useDiaryKey().key` + `encryptString/decryptString`. Mood chip independiente. Decrypta al focus + encrypta onBlur.
- **Botón "Re-agendar"** + **"Cancelar"** en row cuando SCHEDULED && antes de la ventana de cierre.
- **Botón "Cerrar y dejar feedback"** cuando `nowMs > end && status ∈ {SCHEDULED, IN_PROGRESS} && paymentStatus PAID`.

### Estructura de rutas refactorizada

- `terapeutas/[id].tsx` → `terapeutas/[id]/index.tsx` (movido al dir para hacer espacio).
- Layout `_layout.tsx` con 4 screens nuevas registradas.

### Hub extendido

2 cards nuevas en el Hub: "📋 Lo que tu terapeuta sugirió" → `/recetas` y "🔔 Notificaciones" → `/notificaciones`.

---

## Privacy

- **Note del feedback E2E** — encrypta con `useDiaryKey().key` antes de salir del dispositivo. Si el user no tiene unlock, modal acepta rating + tags pero NO incluye `noteCiphertext` en el payload. Backend rechaza con 400 `CIPHER_NONCE_PAIRING` si solo viene uno.
- **Pre-sesión intention E2E** — mismo patrón que Diario web/mobile. El cipher + nonce se generan con `encryptString(intention, key)` y se PATCH al backend; el server nunca ve plaintext.
- **Mood + tags plaintext** — metadata categórica, no contenido sensible. Igual que web.

---

## Decisiones

1. **`Linking.openURL(checkoutUrl)`** para Stripe — el user paga en el browser y vuelve a la app por su cuenta. Universal Links + deeplink return queda para v2.
2. **`EXPO_PUBLIC_WEB_ORIGIN` fallback** al deploy de Vercel — porque la URL de retorno de Stripe vive en el dominio web, no en el deeplink.
3. **Bottom-sheet modals (`animationType="slide"` + `transparent`)** — UX nativo iOS/Android. Sin libraries adicionales.
4. **Reservar como 1 página** — el web tiene 3 pasos por scope; mobile lo aplana para no encadenar navegaciones. Modalidad chips arriba, slots abajo, botón Pagar al final.
5. **Optimistic toggle en Recetas** — UI cambia inmediatamente; revert si el server falla. Mismo patrón web.
6. **MarkAllReadButton inline en header** de Notificaciones — sin componente separado (vs web que sí).
7. **`groupSlotsByDay` filtra current slot** en RescheduleModal — evita el no-op de re-agendar al mismo horario (backend devolvería 422).
8. **Mood + intention guardan independientes** — mismo patrón que el web SessionDetailShell. Eficiente para el caso típico donde el user updatea uno y no el otro.
9. **`Pressable.disabled` + `opacity 0.5`** para el botón disabled — mismo tratamiento visual que web.
10. **Single-feature error states**: error inline en modals, Alert.alert para errores de mutaciones críticas (cancel, join).

---

## Smoke verification

- Mobile typecheck OK
- Mobile lint clean
- Mobile tests 20/20 (sin cambios — sprint UI)
- Web/API/crypto sin cambios

---

## Deuda técnica abierta

- **Stripe success/cancel return como deeplink** — requiere Universal Links iOS + App Links Android. Mobile-first ops sprint. Para v1 el user vuelve manualmente.
- **Sala video WebView nativo** — alternativa a Daily SDK iframe. Requiere `react-native-webview` + permission flow. v2.
- **Reviews + availability heatmap en Perfil mobile** — backend listo, UI mobile diferida.
- **Tests UI dedicados** del Hub, Directorio, Detalle, FeedbackModal, RescheduleModal, Reservar (jest-expo + RNTL).
- **`EXPO_PUBLIC_WEB_ORIGIN` env real** — actualmente hardcoded fallback al deploy de Vercel.
- **Multi-paso Reservar con animaciones entre slides** — actual flat layout funciona, pero podría sentirse pesado en pantallas largas.
- **Skeleton states / loading placeholders** — actualmente `ActivityIndicator` plain; UX seniors lo pedirían más rico.

---

## Estado del flow Terapia mobile

```
✅ Hub
✅ Directorio (búsqueda)
✅ Perfil + favorito
✅ Reserva 1-página + Stripe Checkout
✅ Mis sesiones
✅ Detalle de sesión + Pre-sesión E2E + Cancel + Join + Reschedule + Feedback
✅ Crisis (público)
✅ Notificaciones
✅ Recetas
⏳ Sala video embedded (WebView) — v2
⏳ Stripe return deeplink — v2
```

## Próximo sprint

**S69 — DailyVideoProvider real** (backend ADR 0014) — provisión del subdomain + tokens JWT firmados server-side. Cuando aterrice, `joinSession` devolverá una URL `https://psico.daily.co/...` real, lista para iframe web y WebView mobile.

**O cierre Phase 2** — sprint de pulido (analytics, performance, deploy ops).
