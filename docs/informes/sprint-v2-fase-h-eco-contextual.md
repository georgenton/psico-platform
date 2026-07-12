# Sprint V2 · Fase H — Eco contextual + ARC-P1 (Propósito)

**Fecha:** 2026-07-12
**Rama:** `feature/emotional-map-fase-h-eco-contextual`
**Cierra:** la última fase del programa V2 — Eco deja de ser un chat aislado y se vuelve contextual al lector, y el eje **Propósito** (que reunía datos desde Fase F) obtiene por fin su fuente legítima.

---

## 1. Scope de lectura para Eco

- **`EcoScope { bookSlug, chapterOrder }`** viaja opcional en `POST /api/eco/messages`. Presente solo cuando la conversación nace del dock (web) / sheet (mobile) del lector.
- Con scope, el servidor: (a) acota la búsqueda RAG a ese libro (`searchSimilar(embedding, k, bookId)`); (b) ancla el system prompt al **tema del capítulo** (del catálogo `CHAPTER_CONCEPTS`, con fallback al título); (c) prepara la **oferta de resonancia** del capítulo.
- Sin scope (Eco standalone) el comportamiento es idéntico al de antes de Fase H — RAG platform-wide, sin oferta.

## 2. Citas deterministas («contexto consultado»)

`done.sources: EcoSource[]` lista los pasajes libro/capítulo **realmente recuperados** por el RAG — construidos de los hits, nunca de claims del LLM. Dedup por libro+capítulo, títulos resueltos server-side. La UI los muestra como una línea discreta «Contexto consultado: …» bajo la respuesta.

## 3. Ciclo ARC completado: Eco propone, el usuario confirma

- `done.resonanceOffer` (cuando hubo scope) ofrece el concepto del capítulo. **Nada entra al mapa silenciosamente**: solo un tap explícito («🌱 Añadir») hace `POST /resonances` con `source: "eco"`. Descartar no guarda nada.
- Web: chip en `ChatArea` sobre el composer. Mobile: card equivalente en `EcoChat`.

## 4. ARC-P1 → Propósito (cierra el último eje V2)

- **Schema:** `Resonance.important Boolean @default(false)` (migración aditiva `20260712000000`).
- **Endpoint:** `PATCH /api/resonances/:id { important }` — idempotente, ownership por `updateMany` scoped (404 si no es del usuario), invalida el cache del mapa.
- **Scoring (modelo `ARC-P1`):** bajo `EMOTIONAL_MAP_V2`, Propósito = **temas distintos marcados como importantes / 3** (satura); confianza satura a 1 (un solo tema importante ya enciende el eje). `measured: true`, evidencia `{ARC-P1, n}`, sources «Los temas que marcaste como importantes para ti». Legacy conserva el propósito por progreso de lectura (ratchet).
- **UI:** toggle ⭐/☆ en «Mis resonancias» (web `MapResonances` + mobile `mapa`), con copy que explica que alimenta el Propósito. `resonancesApi.setImportant`.

## 5. Verificación

| Suite                    | Resultado                                                                |
| ------------------------ | ------------------------------------------------------------------------ |
| API (Vitest)             | 828/829 (+4: resonances setImportant ×2 + v2-contract ARC-P1 ×2)         |
| Web (Vitest + RTL)       | 308/308 (+2: MapResonances estrella toggle + unmark)                     |
| Mobile (Jest + RNTL)     | sin nuevos (paridad de UI presentacional; cubierta por web)              |
| Typecheck + lint ×3      | ✅                                                                       |
| OpenAPI `generate:check` | in sync — capturó `PATCH /api/resonances/:id` + el nuevo shape de `done` |

## 6. Privacidad (ADR 0007)

- `EcoScope` lleva solo `bookSlug + chapterOrder` (contenido público licenciado — no el Diario).
- `EcoSource` es metadata de catálogo (títulos de libro/capítulo) — nunca el texto del usuario ni el pasaje subrayado.
- `Resonance.important` es un booleano; la fila sigue sin columna de texto.
- El mensaje del usuario a Eco sigue cifrado E2E (hybrid: plaintext in-flight, ciphertext at-rest), sin cambios.

## 7. Cambio público

- Conversaciones de Eco iniciadas desde el lector ahora citan contexto y ofrecen añadir el tema al mapa.
- Bajo el contrato V2 (default), Propósito deja de decir «Reuniendo datos» en cuanto el usuario marca un tema importante.
- Eco standalone (fuera del lector) sin cambios visibles.

## 8. Deuda / siguiente

- **Ops:** aplicar la migración `20260712000000` en Railway.
- Oferta de resonancia también para `EXERCISE` (el enum ya la contempla; falta el flujo desde los ejercicios).
- Sin resumen de hilo cada N mensajes (deuda vieja de S10).
- **Fase I/J** (post-v1): media multi-modal + safety tiers por obra — quedan para cuando el catálogo de contenido crezca.
- El programa V2 del Mapa Emocional queda **cerrado** con Fase H: aprendizaje ≠ mapa, sin pct global, LLM nunca puntúa, todo con procedencia y confirmación explícita.
