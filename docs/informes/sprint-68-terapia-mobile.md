# Sprint S68 — Terapia mobile · Hub + Directorio + Perfil + Sesiones + Detalle + Crisis

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s68-terapia-mobile`
**Tests:** mobile 20/20 + web 50/50 + crypto 34/34 + API 509/510 (sin cambios — sprint UI)

---

## Lo que se construyó

Paridad mobile del flow core de Terapia. Reusa el backend (S62-S66.B) y el cliente compartido (`terapiaApi` en `@psico/api-client`). Por scope, dejo Reservar/Notifs/Recetas/Reschedule/Pre-sesión E2E/Feedback para S68.B (el flow MVP de "encuentra → reserva en web → consulta el detalle en mobile" queda completo con esto).

### 6 pantallas nuevas

```
/(tabs)/terapia                              # Hub (tab visible)
/(tabs)/terapia/terapeutas                   # Directorio con búsqueda debounced 280ms
/(tabs)/terapia/terapeutas/[id]              # Perfil con favorito + CTA reservar
/(tabs)/terapia/sesiones                     # Mis sesiones (upcoming + past)
/(tabs)/terapia/sesiones/[id]                # Detalle con cancel + join
/(tabs)/terapia/crisis                       # Líneas crisis (Linking.openURL tel:, wa.me)
```

### Tabbar

- Ítem **"Terapia"** visible con ícono `chatbubbles` entre Eco y Patrones. Tabbar ahora muestra 8 items (Inicio · Libros · Diario · Eco · Terapia · Patrones · Mi plan · Perfil).

### Stack layout

- `/(tabs)/terapia/_layout.tsx` con 5 screens registradas: Hub (default header), Terapeutas index/[id], Sesiones index/[id], Crisis.

### Theme extendido

- `Colors.rose` (8 shades) — antes no existía en mobile. Necesario para Crisis page + cancel buttons.
- `Colors.sage` añadidos `200, 300, 700`.

### Cliente compartido reusado

- Toda la integración va por `@psico/api-client/terapiaApi` (sin envoltura mobile-specific). Misma capa que la web.

---

## Decisiones

1. **Tab visible (8 ítems)** — Terapia es el #2 driver de retención. Si UX se queja del aprieto, S68.B puede pivotar a 6 visibles + 2 en menú "más".
2. **`useFocusEffect` + `useEffect`** en el Hub y Mis sesiones — refetcha cuando el user vuelve de cualquier screen anidada. Patrón consistente con el resto del mobile.
3. **Búsqueda debounced 280ms** en Directorio — mismo cooldown que la web. RN puede comprimir el debounce a 200ms si UX se siente lento, pero 280 evita request inflation al typear.
4. **Filtros del backend NO expuestos en mobile en S68** — el filtro UI sería complejo y la búsqueda por texto cubre el 80% del use case mobile. S68.B agrega chips de categoría si lo pide la data.
5. **Perfil sin reviews aún** — backend tiene reviews paginadas; mobile las muestra solo en S68.B con un Modal o lista anidada.
6. **Pre-sesión read-only en Detalle** — el composer E2E con cripto cliente vive ya en mobile para Diario/Eco. Re-usar `useDiaryKey` para Pre-sesión requiere cliente cripto sobre `intentionCiphertext`. Por scope, en S68 muestro solo el mood actual y un placeholder; el composer aterriza en S68.B junto con FeedbackModal.
7. **Join abre `Linking.openURL`** — la sala Daily vive fuera de la app en mobile. Cuando ConsoleVideoProvider activo, mostramos un Alert claro. Misma decisión que el web S67.D pre-Daily-SDK (allá hay iframe embed; mobile podría agregar `WebView` en S68.B pero requiere permission flow + plugin nuevo).
8. **Cancel con `Alert.alert` destructive** — UX idiomática iOS/Android, evita modal custom.
9. **Linking.canOpenURL antes de `tel:`** — algunos emuladores Android no tienen dialer. Defensive.
10. **`/whatsapp` con `wa.me/<digits>`** — Linking.openURL abre la app si está, fallback web.
11. **Mi sesiones con scope `"all"`** — separa upcoming + past en client. Backend ya retorna estructura `{ upcoming, past }`.

---

## Privacy

- Crisis page público (mismo que web) — no usa auth.
- Pre-sesión E2E queda **disabled** en mobile esta sesión. El composer cifrado aterriza en S68.B reusando `DiaryKeyContext`.

---

## Smoke verification

- Mobile typecheck OK
- Mobile lint clean
- Mobile tests 20/20 (sin cambios)
- Web/API/crypto sin cambios

---

## Deuda técnica abierta

- **Reservar 3-pasos en mobile** (`/terapia/terapeutas/[id]/reservar`) — Stripe Checkout vía `WebView` o `Linking.openURL` al web success URL. v2.
- **Pre-sesión E2E composer + FeedbackModal mobile** — reusa `useDiaryKey` + crypto/aead. S68.B.
- **Reschedule modal mobile** — picker de slot con `Modal` + grid horizontal. S68.B.
- **Notificaciones page mobile** — paridad con web. S68.B.
- **Recetas page mobile** — paridad con web. S68.B.
- **Reviews + availability grid en Perfil** — backend listo, UI mobile diferida.
- **Sala video WebView** — alternativa a Daily SDK nativo es WebView con la roomUrl; requiere `react-native-webview` (~250KB) + permission flow. v2.
- **Tests UI dedicados** del Hub, Directorio y Detalle (jest-expo + RN Testing Library).
- **`expo-router` push tipado** — algunas rutas usan string literal; podría tipar más estricto.
- **Pre-sesión "estado" del modo demo** — actualmente muestra mood textual; mejor mostrar el último cipher con icon de candado.

---

## Próximo sprint

**S68.B — Mobile Terapia lifecycle features:**
- Reservar 3-pasos + WebView Stripe
- Pre-sesión composer cifrado (E2E)
- FeedbackModal mobile
- RescheduleModal con slot picker
- Notificaciones + Recetas pages
