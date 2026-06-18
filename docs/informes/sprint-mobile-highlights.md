# Sprint Mobile Highlights — block-level v1

**Fecha:** 2026-06-17
**Rama:** `feature/sprint-mobile-highlights`
**Tests:** 37/37 mobile (+8 nuevos) · 668/669 API · 142/142 web · 34/34 crypto
**Roadmap:** [docs/ROADMAP.md §3-4 — Sprint 4 Mobile text-selection](../ROADMAP.md)

---

## Lo que se construyó

Cierra Sprint 4 del roadmap (text-selection mobile en el Lector). Hasta hoy mobile era **view-only** — los users podían leer + dejar notas, pero no resaltar pasajes. Web tiene highlights inline desde S6. Este sprint le da paridad funcional al mobile con la decisión pragmática de **block-level highlights v1**: en lugar de selección carácter-a-carácter, un long-press en el párrafo marca el bloque entero (`startOffset: 0, endOffset: content.length`).

### Pantalla mobile

`apps/mobile/app/(tabs)/books/[slug]/lector/[chapterOrder].tsx`:

- Nuevo state `highlights: HighlightSummary[]` poblado desde `data.highlights` del `lectorApi.getChapter`.
- Nuevo state `actionBlockId: string | null` para la sheet del long-press.
- Long-press en cualquier block: antes abría directamente el composer de annotation; ahora abre el `BlockActionsSheet` con 3 acciones (color + nota + cancelar) y una cuarta destructiva (quitar) cuando el block ya tiene highlights.
- `createHighlight(blockId, color)`: POST `/highlights` con range del block entero. Optimistic insert con temp ID → swap a server ID al éxito, rollback al error.
- `deleteHighlight(id)`: optimistic remove + DELETE.
- `BlockView` recibe `highlights: HighlightSummary[]`. El primer highlight tinta el bloque (background + borderLeft del color). `testID` exposed for tests.

### BlockActionsSheet (componente compartido)

`apps/mobile/src/components/dashboard/lector/BlockActionsSheet.tsx`:

- Componente presentacional 100% — todas las callbacks vienen del parent.
- 3 color swatches (Amarillo/Azul/Rosa) con `accessibilityLabel` distintos.
- Backdrop tap o "Cancelar" cierra.
- "Quitar resaltado" condicional al prop `hasHighlight`.
- Helper `highlightStyleFor(color)` exportado para que la screen lo reuse.

### Tests

`apps/mobile/src/components/dashboard/lector/BlockActionsSheet.test.tsx` — 8 tests:

- Render: title + 3 swatches + add-note + cancel.
- Destructive row gated por `hasHighlight` (presente cuando true, ausente cuando false).
- Callbacks: `onPickColor("YELLOW"/"BLUE"/"PINK")`, `onAddNote`, `onRemoveHighlights`, `onCancel`.
- `highlightStyleFor` retorna bg + borderLeftColor + borderLeftWidth correctos por color.

Mock `react-native` para que `<Modal visible>` renderee inline (jest-expo no lo hace por default). Mismo patrón que TimezoneCard mobile tests.

---

## Decisiones

1. **Block-level v1 sobre character-level** — RN 0.76 no tiene API de selection de texto first-party. Las libraries que la wrappean (react-native-selectable-text) están unmaintained para SDK 52 + new architecture. Block-level satisface el user need (mark passages I want to remember), ship hoy, y usa el mismo contrato server (offsets validados, color enum). Character-level puede aterrizar como sprint propio sin cambiar nada del backend.
2. **`BlockActionsSheet` extraído a componente propio** — vivía inline en la screen file pero (a) expo-router no permite named exports en routes pasa testing, (b) screen file ya tenía 800+ líneas. La extracción mejora la testabilidad y la lectura.
3. **Tint en el primer highlight, no merged** — el design no define qué pasa con highlights de colores diferentes overlapping. Block-level v1 usa el primero. Multi-color edge case queda como deuda chiquita.
4. **Optimistic UI con temp ID** — el feedback visual es inmediato (la cinta colorida aparece al instante). Si la POST falla, el temp se borra + Alert. Misma estrategia que annotations CRUD.
5. **TestID en BlockView**: `block-${id}-${color?}` — útil para tests integrados que quieran verificar tint sin acoplarse a styles.
6. **Long-press substituye al prompt directo de annotation** — antes long-press → composer. Ahora long-press → action sheet → composer (si pickeas "Añadir nota"). Un click extra para el flow de annotation, pero las dos features comparten el mismo gesture.

---

## Smoke verification

```
@psico/mobile tests       37/37 (+8 nuevos BlockActionsSheet)
@psico/mobile typecheck   OK
@psico/mobile lint        OK
API tests                 668/669 (sin cambios — surface del backend ya estaba)
Web tests                 142/142 (sin cambios)
Crypto tests              34/34 (sin cambios)
```

### Flow mental

1. User hace long-press en un block "Empieza así.".
2. Aparece bottom sheet: "Acciones del párrafo" + 3 swatches + "✏️ Añadir nota" + "Cancelar".
3. User tap "Amarillo" → la sheet cierra, el block tinta de amarillo inmediatamente, en paralelo POST `/highlights` con `{blockId, startOffset:0, endOffset:12, color:"YELLOW"}`.
4. User vuelve a hacer long-press en el mismo block → sheet aparece con 4 acciones (la cuarta = "🗑️ Quitar resaltado" en rojo).
5. User tap "Quitar" → cinta amarilla desaparece, DELETE `/highlights/{id}` en paralelo.

---

## Deuda técnica abierta

- **Character-level highlights** — el server ya está listo (DTO acepta cualquier offset válido). Mobile necesita library de selection con maintained support. Tracking issue: revisar `react-native-text-highlight` y `@react-native-community/text-input` cuando RN 0.78 estabilice text-selection nativo.
- **Multi-color en mismo block** — el design no define el merge. Block-level v1 usa el primer highlight para el tint. Char-level lo resuelve naturalmente porque los highlights son rangos.
- **Sin test integrado del flow completo** (long-press → sheet → POST) — el screen file no se testea por la complejidad de mockear `expo-router`. Cubierto a piezas: BlockActionsSheet aislado + API contract unit tests existentes.
- **`note?: string` en el highlight no se setea** — el design contempla notas pegadas a highlights pero v1 las trata como features separadas (annotation es un row distinto).
- **Sin tests del optimistic rollback** — happy path está cubierto; el path de error require mock del `highlightsApi` con failure mode. Aceptable v1.

---

## Próximo paso

Sprint 5 del roadmap: **Recovery seed phrase UI wire + Edit entry mobile**. Backend ready desde S6, UI cliente escrita en S23. Falta wire del modal a primer-unlock para users legacy + parity de edit-entry mobile vs web.
