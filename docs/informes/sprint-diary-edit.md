# Sprint Diary Edit — Editar entrada del Diario (web + mobile)

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-diary-edit`
**Tests:** 601/602 API (sin cambios — backend ya existía) · 56/56 web · 20/20 mobile · 34/34 crypto
**ADR aplicado:** [0007 E2E encryption Diario/Eco](../adr/0007-e2e-encryption-diario-eco.md)

---

## Lo que se construyó

Cierra el CRUD del Diario que estaba incompleto desde S22 (detail view tenía delete pero no edit). Sin tocar backend — el endpoint `PATCH /api/diario/entries/:id` existe desde S6 y respeta el contrato E2E (cipher + nonce pairing enforced).

### Web — `EntryDetailView.tsx`

- 4 nuevas piezas de estado: `editing`, `draft`, `savedFlash`, `saving`.
- `startEdit()` — captura el plaintext decrypted como draft inicial.
- `cancelEdit()` — descarta draft.
- `handleSave()` — encripta body + excerpt con la diaryKey, PATCHea, `router.refresh()`, muestra flash "✓ Cambios guardados" 2.5s.
- Body article alterna entre: textarea editor (cuando `editing`) · paragraph view (default) · cipher-failure card (fallback).
- Footer: botón "✎ Editar" lavender al lado del "🗑 Borrar" rojo. Delete se deshabilita cuando estás editando.

### Mobile — `app/(tabs)/diario/[id].tsx`

- Paridad exacta del web: state machine + handlers + UI.
- Editor con `TextInput` multiline (minHeight 180), textarea-style styling.
- Buttons: "✎ Editar" (lavender chip) + "🗑 Borrar" en footer.
- Native `Alert.alert` para errores; mutación local del `detail.entry.textCiphertext/Nonce` post-save (no `router.refresh()` que no existe igual en RN; la vista local reflectea la versión nueva).
- Theme: añadidos `editBtn`, `editorCard`, `editorInput`, `editorActions`, etc.

### Privacy invariant preservado

- Draft solo vive en memoria del componente — sin localStorage / AsyncStorage.
- Cipher + nonce regenerados en cada save (XChaCha20-Poly1305 nonce reuse prevention).
- Excerpt cipher también se regenera (no queda stale el preview de la lista).
- Server NUNCA recibe plaintext.

---

## Decisiones

1. **Mutate detail in-place en mobile**, `router.refresh()` en web — RN no tiene equivalente; mutar local + re-decrypt es más simple que re-fetch.
2. **Save in-place sin separator** — `editing && decrypted` reemplaza el article, no es un modal. Menos clicks, focus contextual.
3. **Disable delete while editing** — evita que el usuario click Borrar pensando "cancel" cuando está editando.
4. **Sin validación de unchanged** — si el draft === text original y guardan, se generan nuevos cipher/nonce (legal). El server acepta — los reads decryptan al mismo plaintext. No-op en términos del usuario; ligero waste de bytes en R2.
5. **Sin diff o version history** — la entrada del Diario es por definición un journal personal; el autor puede editar libremente sin trazabilidad.
6. **`maxLength={20000}`** — mismo cap que el composer original.

---

## Smoke verification (local)

- API tests 601/602 (sin cambios).
- @psico/crypto 34/34.
- Web typecheck + lint + tests OK (56/56).
- Mobile typecheck + lint + tests OK (20/20).

---

## Deuda técnica abierta

- **Sin tests UI dedicados** para el flow de edit. La cobertura del Diario es por integration; agregar test específico si el flow gana surface.
- **Edit tags + mood** — actualmente solo se edita el body. Si el usuario cambia el tono de la entrada, debería poder ajustar el mood + tags. Sprint propio si los users lo piden.
- **Conflict detection** — si dos pestañas editan la misma entrada, gana la última en guardar. Sin `expectedVersion` (el endpoint Diary no lo enforce). Probabilidad real: muy baja.
- **Autosave on debounce** — manual save por ahora. Diferido hasta validar que la fricción molesta.
- **Animation entre view↔edit** — switch instantáneo en v1.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy a Vercel (sin migration).
3. Smoke walk:
   - Crear entrada de prueba en `/dashboard/diario` → "Hola mundo".
   - Navegar al detail → click "✎ Editar" → cambiar a "Hola mundo corregido" → "Guardar cambios" → ver flash ✓.
   - Recargar página → cambio persiste.
   - Volver al list → preview actualizado.

Después: otro sprint según prioridad (Live Activities, Tests UI dedicados, perfil completo, etc.).
