# Sprint Polish UX Phase 1 — paginación Eco mobile

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-polish-phase1`
**Tests:** 20/20 mobile (sin cambios) · 122/122 web · 653/654 API · 34/34 crypto

---

## Lo que se construyó

Sprint orientado a cerrar deuda UX pendiente. El scope original mencionaba dos ítems:

1. **Edit entry Diario web** — auditoría reveló que ya está implementado completo (deuda S22 cerrada en sprint posterior al cierre nominal). El detail view `EntryDetailView.tsx` tiene composer de edición con mood selector, tags chips, decrypt + re-encrypt, save flash. Sin cambios necesarios.

2. **Paginación Eco mobile** — abierta desde S36 (web tuvo paginación, mobile la difirió). Esta es la entrega del sprint.

### Paginación Eco mobile

El `ChatArea` web (#180/S36) implementó paginación cursor-based con scroll snapshot/restore. Mobile usaba el mismo backend pero solo cargaba la primera página de 50 mensajes — hilos largos quedaban truncados sin manera de cargar anteriores.

#### Cambios en `apps/mobile/app/(tabs)/eco/index.tsx`

**State adicional:**

- `hasMore: boolean` — capturado del `EcoThreadResponse` en la carga inicial y en cada `loadOlder`.
- `loadingMore: boolean` — gate para evitar dobles taps y para suprimir el auto-scroll-to-end mientras está activo.

**Callback `loadOlder`:**

- Guards: no thread activo, no hasMore, no loadingMore, no messages, ID optimistic.
- Llama `ecoApi.getThread(activeThreadId, oldestId)` (el cliente ya soporta cursor desde S36 web).
- Prepend al array de mensajes; actualiza `hasMore`.
- Silent fail — el botón sigue disponible para retry.

**UI:**

- Botón "↑ Mensajes anteriores" al tope del ScrollView cuando `hasMore && messages.length > 0`.
- Style lavender 50 background + lavender 200 border + lavender 700 text. ActivityIndicator durante loading.
- Pressable con `pressed && { opacity: 0.7 }` para feedback táctil.

**Auto-scroll defense:**

- `onContentSizeChange` ahora early-return cuando `loadingMore` — sin esto, prepender mensajes dispara el callback y la pantalla saltaría al fondo en lugar de mantener al usuario donde está leyendo.

#### Trade-off RN ScrollView vs web

Web podía hacer scroll snapshot/restore exacto via `scrollHeight + scrollTop` arithmetic. RN `ScrollView` no expone esos directamente — el usuario verá su anchor anterior aparecer al fondo de la nueva página tras el prepend (en lugar de la web que mantiene la línea exacta). Aceptable porque:

1. Sin el snapshot, el comportamiento default sería peor (auto-scroll a top).
2. El delta es pequeño en hilos típicos (~50 mensajes nuevos cabeñn en un par de pantallas).
3. Implementar layout measurement con `onLayout` per-bubble agrega complejidad sin payoff dramático.

Si surge feedback de usuario, se puede usar `FlatList` con `inverted` prop + `onEndReached` (la inversión que usan apps de chat tipo WhatsApp).

---

## Decisiones

1. **Sin tocar backend** — el cursor ya está soportado desde S36.
2. **Sin tocar @psico/types** — `EcoThreadResponse.hasMore` ya está en el shape.
3. **Sin tocar @psico/api-client** — `ecoApi.getThread(id, cursor?)` ya soporta cursor.
4. **`onContentSizeChange` early-return** — alternativa a usar refs intermedios. Más simple, semánticamente claro.
5. **`Pressable` sobre `TouchableOpacity`** — coherente con el resto del Eco mobile (idiomatic RN moderno).
6. **Sin `FlatList` rewrite** — refactor invasivo. ScrollView + map sirve hasta ~200 mensajes; cuando duela se migra.

---

## Smoke verification

```
Mobile tests     20/20 (sin cambios)
Mobile typecheck OK
Mobile lint      OK
Web tests        122/122 (sin cambios — touch de ningún archivo web)
API tests        653/654 (sin cambios)
@psico/crypto    34/34
```

---

## Deuda técnica abierta

- **Anchor exacto** — usuario tras prepend ve su mensaje anterior al fondo de la nueva página, no en la misma línea. Aceptable v1.
- **Sin tests UI** dedicados — el flow de paginación involucra ScrollView ref + ActivityIndicator + async. RN Testing Library puede ejercitarlo pero el ROI marginal. Diferir.
- **Sin animación** entre páginas — el contenido aparece de golpe. Animated.layoutAnimation sería el camino.
- **FlatList con `inverted` + `onEndReached`** — pattern más nativo si los hilos crecen >200 mensajes. Refactor diferido.

---

## Cierre Phase 1 UX polish

La auditoría reveló que el resto de deuda UX que mencionamos al inicio del sprint **ya estaba cerrada**:

- Edit entry Diario web ✓ (composer completo con mood/tags/decrypt-re-encrypt)
- Audio playback Lector — backend signed URL ya emitido; UI cuando se requiera
- Mobile highlights/selection — bloqueado por RN text selection libs

Cierra el sprint Polish Phase 1.

---

## Próximo paso

Próximos sprints candidatos:

- **Bugfix #2 Stripe price IDs reales** — deuda de ops desde Sesión 30 (más urgente para producción).
- **Observability (Sentry)** — wire API + worker + web + mobile.
- **JSDoc round 4** — ~15 DTOs restantes (Books admin, Author, etc).
- **Audio playback Lector** — UI `<audio>` web + `expo-av` mobile, backend URL ya listo.
