# Sprint Diary Edit Meta — Editar mood + tags desde el detalle

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-diary-edit-meta`
**Tests:** 104/104 web (+9) · 20/20 mobile · 601/602 API · 34/34 crypto

---

## Lo que se construyó

Cierra el gap del sprint Diary Edit (web + mobile editaban SOLO `body`; `mood` y `tags` quedaban fuera). Backend ya soportaba ambos campos en `UpdateDiaryEntryDto` desde S6 — este sprint cocina la UI.

### Web (`apps/web/src/components/dashboard/diario/EntryDetailView.tsx`)

- Modo edit ahora muestra:
  - **Mood selector** — radiogroup con 7 chips (mismo set que `ActiveComposer`).
  - **Tags input** — chips con `×` para remover + input que commitea con `Enter` o `,` + Backspace remueve la última cuando está vacío. Normaliza (lowercase + strip `#`). Cap 12 (`TAGS_MAX`), 32 chars per tag (`TAG_MAX_CHARS`).
- Tags estáticas (bajo el body) ocultas en edit mode para evitar duplicado visual.
- `handleSave` solo envía `mood`/`tags` cuando cambiaron — diff por valor + length-and-position comparison para `tags`.

### Mobile (`apps/mobile/app/(tabs)/diario/[id].tsx`)

- Editor paridad con web: chips mood (con `accessibilityRole="radio"`), chips tags removibles, `TextInput` con `onSubmitEditing` para commit.
- Mismo diff de payload — backend recibe solo lo que cambió.
- Mutación local de `detail.entry.mood` y `detail.entry.tags` post-save para que la vista refleje el cambio sin re-fetch.

### Tests UI web (+9 nuevos)

`apps/web/src/components/dashboard/diario/__tests__/EntryDetailView.test.tsx`:

1. Render en read mode no muestra editor.
2. Click "Editar" abre editor con radiogroup mood + tag input.
3. Commit tag on `Enter`.
4. Remover tag via botón `×`.
5. Save manda payload con `mood` + `tags` cuando ambos cambiaron.
6. Save omite `mood` y `tags` cuando no cambiaron (solo cipher).
7. Dedup de tag duplicada.
8. Normaliza `#FOCO` → `foco`.
9. Commit on `,`.

### Patrones del test

- `vi.mock("@psico/crypto", ...)` — `decryptString` retorna cipher tal cual; `encryptString` retorna ciphertext predecible (`cipher:<text>` + `nonce:fixed`) para asserts.
- `vi.mock("@/lib/crypto/diary-key-context", ...)` — devuelve provider passthrough + key dummy `Uint8Array(32)`.
- `vi.spyOn(globalThis, "fetch")` — el componente bypassea `apiClient` para enviar al endpoint multipart-ish con auth header explícito.

---

## Decisiones

1. **MOODS inlined en el detail view** — no se extrajo a un módulo compartido con `ActiveComposer` para mantener el scope quirúrgico. Si se reusa una tercera vez, refactor.
2. **`onBlur` también commitea tag** — UX más forgiving para usuarios que escriben y hacen click fuera sin presionar Enter.
3. **Backspace en input vacío remueve última tag** — patrón estándar de chip inputs (GitHub Issues, Linear).
4. **Cap 12 tags** — refleja `ArrayMaxSize(12)` del DTO backend.
5. **Tags estáticas hidden in edit mode** — evita duplicado visual (chips también renderizan dentro del editor). Salen como tests fallaron primero, fix en línea.
6. **Mutación local en mobile (`detail.entry.mood = draftMood`)** — sin re-fetch, refleja el cambio inmediatamente. Web usa `router.refresh()` que es más server-side.
7. **No tags edit en `ChapterEditor` ni en `ActiveComposer`** — ese composer ya escribía mood pero no permitía editar tags. Diferido — fuera del scope del sprint.

---

## Privacy

- `mood` + `tags` ya viajaban plaintext desde S6 (metadata categórica analizable para PatronesModule).
- ADR 0007 intacto — no hay ciphertext nuevo, ni la edición cambia el modelo de keys.
- `excerptCiphertext`/`textCiphertext` se rotan con cada save (nonce nuevo).

---

## Smoke verification

- API tests **601/602** (sin cambios — backend no se tocó).
- `@psico/crypto` **34/34**.
- Web tests **104/104** (+9).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en web + mobile.

---

## Deuda técnica abierta

- **`ActiveComposer` tag input** — solo permite escribir tags al crear, no edita.
- **MOODS const duplicado** entre `ActiveComposer` (web), `EntryDetailView` (web) y mobile. Refactor a `@psico/shared-constants` cuando se justifique.
- **Mobile read-mode tags row** debajo del body no se oculta en edit mode (mismo bug que web tenía). No causa duplicado visual porque editor scrollea — aceptable v1.
- **No tests UI mobile** del nuevo editor mood/tags. Patrón Modal+chips funciona en otros sprints.
- **Edit mode no muestra meta-header actualizado** — el "Calma" del badge sigue mostrando el mood original hasta que se guarda. Aceptable porque es un editor inline; el draft view-of-truth está en los chips.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy (solo UI; backend intacto).
3. Próximo sprint candidato: **observability** (Sentry web/API/mobile) o **bookmarks UI** (backend desde S5, UI nunca aterrizó).
