# Sprint UI Tests — Cobertura para componentes Author + Pulso + AI helper

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-ui-tests`
**Tests:** 95/95 web (+30) · 20/20 mobile · 601/602 API · 34/34 crypto

---

## Lo que se construyó

Cubre cuatro componentes UI que se shipearon sin tests dedicados durante los sprints recientes:

- **`MonthlyEarningsTable`** (S71.C-revenue) — tabla de cobros del autor.
- **`RoleSelector`** (S72) — admin user role management.
- **`NewBookButton`** (S71-front) — crear libro en author dashboard.
- **`AiHelperModal`** (S71.C-AI) — assistant de edición del editor de autor.

Cubre paths críticos: empty/loading/success/error + interacciones del usuario.

### Tests escritos (+30)

**`MonthlyEarningsTable` (8 tests):**
- Empty state cuando no hay rows.
- Header columnas presentes cuando hay rows.
- USD currency formatting (cents → $X,XX).
- Badge PAID renderiza correctamente.
- Badge PENDING renderiza correctamente.
- Payment reference visible cuando existe.
- Reference oculta cuando null.
- Múltiples rows con valores distintos.

**`RoleSelector` (7 tests):**
- Idle state con botón "Cambiar rol".
- Editor abre con select + textarea + Cancelar.
- Action call con id + new role + reason.
- `isSelf=true` deshabilita opciones no-ADMIN.
- Submit no dispara cuando role === currentRole.
- Cancel vuelve a idle sin firing.
- Error inline cuando action throws.

**`NewBookButton` (7 tests):**
- Idle CTA "Nuevo libro".
- Form inline abre al click.
- Reject titles < 2 chars.
- Action con título trimmeado.
- Router.push a `/autor/libros/<id>` post-success.
- Error inline cuando action throws.
- Cancel sin fire.

**`AiHelperModal` (8 tests):**
- 4 intent cards visibles.
- Preview del texto seleccionado.
- Fetch con shape correcta (URL + body con intent/text/blockId).
- Suggestion renderiza post-success.
- Etiqueta "modo local" cuando `source: fallback`.
- `onAccept` + `onClose` callbacks cuando se "Reemplaza bloque".
- Error inline cuando fetch falla.
- Backdrop click → onClose.

### Patrón usado

- `vi.mock("@/app/...path/actions")` para server actions.
- `vi.mock("next/navigation")` para router.push.
- `vi.spyOn(globalThis, "fetch")` para AiHelperModal que llama fetch directo (apiClient bypass).
- `beforeEach` reset de mocks para no contaminar tests entre cases.
- `userEvent.setup()` por test (RTL recomendación oficial).

---

## Decisiones

1. **No tests UI para `ShowSeedPhraseCard`** — lógica trivial state machine sin side-effects testeables. El crypto subyacente está cubierto por `@psico/crypto` tests.
2. **`MonthlyEarningsTable`: locale-agnostic assertions** — busco `/111[,.]00/` en lugar de `enero`, porque jsdom no garantiza `es-EC` full ICU para month names.
3. **`AiHelperModal`: spy en `fetch` global** — el modal bypassea `apiClient` (usa fetch directo con apiBase + token). Spying en global es más sencillo que mockear el cliente.
4. **`RoleSelector`: aria-disabled assertion** — los `<option disabled>` son válidos en HTML aunque no tengan ARIA explícito; el test usa el query natural de DOM.
5. **`NewBookButton`: navegación verified post-success** — assertion del `mockPush` con la URL correcta cierra el contrato real del componente.

---

## Smoke verification (local)

- Web typecheck OK.
- Web lint clean.
- Web tests **95/95** (+30).
- API tests 601/602 (sin cambios — no se tocó backend).
- @psico/crypto 34/34.
- Mobile 20/20 (sin cambios).

---

## Deuda técnica abierta

- **`ShowSeedPhraseCard`** sin tests dedicados — diferido.
- **`PayoutSettingsForm`** sin tests — método pago/details JSON requires más setup.
- **`AuthorRequestActions`** sin tests — server action mock + state machine completa, sprint propio.
- **`CoverImageUpload` y `AudioUpload`** — fetch + FileReader hace setup complejo.
- **`BookMetaForm`** y **`ChapterEditor`** — formularios grandes, candidatos a integration tests en lugar de unit.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy (solo tests; no afecta runtime).
3. Próximo sprint: continuar con observability (Sentry web/API/mobile) o cerrar deudas UI restantes.
