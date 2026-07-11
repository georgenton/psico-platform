# Sprint V2 · Fase E — Ciclo ARC: resonancias confirmadas

**Fecha:** 2026-07-10
**Rama:** `feature/emotional-map-fase-e-arc`
**Principio que materializa:** "nada entra al mapa silenciosamente" — subrayar deja de ser señal implícita; nace la **resonancia confirmada** (Anclar → Relacionar → Confirmar), la única señal de contenido admitida en el mapa.

---

## 1. El ciclo ARC v1

- **Anclar:** el usuario subraya un párrafo (web) o abre el sheet de acciones (mobile).
- **Relacionar:** el sistema relaciona la marca con el **concepto del capítulo** — catálogo curado `CHAPTER_CONCEPTS` en `@psico/types` (mismo patrón que `ECO_CHAPTER_PROMPTS`), con fallback estable por título. Los 3 capítulos reales de la Parte I tienen concepto propio, alineado con los temas de Eco.
- **Confirmar:** solo un tap explícito («Sí, añadir a mi mapa» / «Me resonó») persiste una `Resonance`. Descartar no guarda nada.

## 2. Qué se construyó

### Backend

- **Schema `Resonance`** — userId, conceptKey (único por usuario), conceptLabel, bookSlug, chapterOrder, source (HIGHLIGHT/ECO/EXERCISE), confirmedAt. Migración aditiva `20260711140000_fase_e_resonances`. Sin columna de texto: solo metadata de catálogo (ADR 0007). Sin columna status: toda fila ES una confirmación; las propuestas viven en el cliente.
- **`ResonancesModule`** — `GET /api/resonances` · `POST /api/resonances` (upsert idempotente por concepto; re-confirmar refresca fecha/fuente) · `DELETE /api/resonances/:id` (borrado real, ownership vía deleteMany scoped → 404). Cada mutación invalida el cache del mapa.
- **Modelo `ARC-C1` en el Model Registry** — bajo `EMOTIONAL_MAP_V2`, **conexión se alimenta EXCLUSIVAMENTE de resonancias confirmadas**: value = conceptos distintos / 4 (satura), confianza satura a 2 (una sola confirmación ya enciende el eje — es autoinforme explícito, a diferencia de los proxies de engagement que reemplaza). `measured: true`, evidencia `{modelId: "ARC-C1", n}`, sources «Las resonancias que confirmaste sobre tus lecturas». El scoring legacy (default) las ignora (ratchet pineado).
- **Flag `CONTENT_RESONANCE` default ON** — todo el ciclo es consentimiento explícito por diseño (cada resonancia es un tap y se puede borrar); no hay riesgo de dato silencioso. Gatea la lectura de resonancias en el compute.

### UI

- **Web — `ResonanceNudge`:** tras el primer subrayado del capítulo (una vez por sesión, `sessionStorage`), una tarjeta flotante ofrece el concepto: «¿Te resonó “X”? Solo entra a tu mapa si tú lo confirmas» → [🌱 Sí, añadir a mi mapa] [Ahora no]. Confirmar muestra el destino («puedes verlo y quitarlo en Mis resonancias»).
- **Web — `MapResonances`:** primera sección V2 del mapa — lista con procedencia completa (Confirmado por ti · Cap. N · fecha) + «Quitar» (server action + optimistic). Empty state que explica cómo se llena.
- **Mobile — `BlockActionsSheet`:** fila nueva «🌱 Me resonó “X”» con hint «Se añade a tu mapa solo si lo confirmas» (props opcionales — callers pre-Fase-E compilan). El screen confirma vía `resonancesApi` + Alert con el destino.
- **Mobile — mapa:** sección «Mis resonancias» con procedencia + Quitar (Alert destructivo, optimistic + rollback).

### Ajuste documentado sobre el plan

El content graph con tablas (`Concept`/`ContentUnit`/`BookManifest`) se difiere: con 2 libros y 3 capítulos curados, un catálogo compartido en `@psico/types` es la herramienta correcta (mismo criterio que L6). Las tablas llegan cuando Author B2B necesite que autores/editores definan conceptos.

## 3. Verificación

| Suite                    | Resultado                                                                        |
| ------------------------ | -------------------------------------------------------------------------------- |
| API (Vitest)             | 812/813 (1 skipped sentinel) — +6: resonances service ×4 + ARC en v2-contract ×2 |
| Web (Vitest + RTL)       | 301/301 — +3 MapResonances                                                       |
| Mobile (Jest + RNTL)     | 67/67 — +2 BlockActionsSheet (fila resonancia)                                   |
| Typecheck + lint ×3      | ✅                                                                               |
| OpenAPI `generate:check` | in sync                                                                          |

## 4. Privacidad (ADR 0007)

- La fila `Resonance` lleva solo metadata de catálogo (clave/label del concepto, libro/capítulo, fuente, fecha) — **nunca el texto subrayado**.
- Todo lo que entra fue un tap explícito; todo puede borrarse (borrado real, no soft-delete).

## 5. Deuda / siguiente

- Migración `20260711140000` pendiente de aplicar en Railway.
- Propósito sigue en "Reuniendo datos" bajo V2 — espera su flujo de «temas importantes confirmados» (diseño en Fase F).
- Fuente `ECO`/`EXERCISE` del enum ya existe pero solo `HIGHLIGHT` tiene UI — Eco propone resonancias en Fase H; los ejercicios cuando su flujo lo pida.
- Fase F (última del núcleo V2): UI V2 del mapa — sin % global, sin «Medido», modal ⓘ V2, radar restringido (decisión L2) y Narrator (L3).
