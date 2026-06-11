# Sprint S71.C-AI — AI helpers en el editor del autor

**Fecha:** 2026-06-10
**Rama:** `feature/sprint-s71c-author-ai-helpers`
**Tests:** 580/581 API (+9 nuevos · 1 skipped sentinel) · 56/56 web · 34/34 crypto
**Design handoff:** [docs/design/handoff/16-author.md §editor](../design/handoff/16-author.md) — sección "Editor Substack-like" + "Pedir ayuda a IA"

---

## Lo que se construyó

Cierra parte de la deuda S71.C abierta desde S71. El handoff del editor describe 4 helpers IA: revisar tono, sugerir ejemplo, cambiar tono, simplificar. Sprint entrega los 4 detrás de un único endpoint con fallback rule-based para que funcione incluso sin `ANTHROPIC_API_KEY`.

### Backend

**Nuevo servicio `AuthorAiService`** dentro de `AuthorModule`:
- Cliente Anthropic directo (no reusa `AIService` del Eco para mantener el módulo Author autónomo).
- 4 system prompts curados (uno por intent). Tono editorial cálido + instrucciones de "responde solo con el texto ajustado, sin preámbulo".
- Sonnet 4.6 · `max_tokens: 600` · sin streaming en v1 (predecible para el modal del editor).
- **Fallback rule-based** cuando: la key no está configurada / LLM devuelve empty / hits 4xx. Cada intent tiene su transformación local mínima (truncate, append, replace).
- **503 AI_PROVIDER_UNAVAILABLE** cuando el LLM devuelve 5xx — el editor sabe que es transitorio.
- Output cleaner que strip-ea prefixes comunes que Claude añade pese a la instrucción (`Aquí:`, `Texto ajustado:`, comillas).

**Nuevo endpoint** bajo `/api/autor/libros/:id/ai-help`:

```
POST /api/autor/libros/:id/ai-help
Body: { intent: "revisar"|"ejemplo"|"tono"|"simplificar", text, blockId?, context? }
Returns: { intent, suggestion, source: "model"|"fallback", inputTokens?, outputTokens? }
```

- Throttle 30/min/user.
- Ownership check vía `service.getBook(userId, bookId)` — 404 si no es del autor.
- Heredamos `JwtAuthGuard + RolesGuard + @RequiredRole("AUTHOR")` del controller.

### Privacy

- El texto del autor **no es E2E** (es contenido público licenciado que irá al catálogo).
- Mandarlo al LLM está justificado.
- No persistimos las sugerencias — son one-shot helpers.
- Sin información del usuario (PII) en el system prompt.

### Tipos compartidos (+3)

- `AuthorAiIntent`
- `AuthorAiHelpRequest`
- `AuthorAiHelpResponse`

### Cliente API

- `authorApi.aiHelp(bookId, body)` en `packages/api-client/src/author.ts`.

### Web — UI

**Nuevo componente `AiHelperModal.tsx`** en el editor de capítulo:
- Modal con 4 cards de intent (revisar / ejemplo / tono / simplificar) con descripción de qué hace cada uno.
- Muestra el texto seleccionado como preview.
- Botón "Generar sugerencia" → fetch al endpoint.
- Muestra la sugerencia en card lavender con etiqueta "Sugerencia IA" o "Sugerencia (modo local)" según `source`.
- Botón "Reemplazar bloque" sobreescribe el contenido del bloque en el editor padre.
- Modal cierra con click fuera, ESC implícito.

**Wire en `ChapterEditor.tsx`:**
- Botón ✨ por bloque (lavender, disabled cuando el bloque está vacío).
- State `aiTarget` con el índice del bloque activo.
- `apiBase` y `accessToken` se inyectan desde el Server Component padre — mismo patrón que `EcoShell`.
- `bookContext` (resumen del libro) se pasa al modal para que el LLM tenga contexto editorial.

### Tests (+9)

- Fallback cuando no hay key.
- `EMPTY_TEXT` 400 con whitespace only.
- Happy path con LLM response real.
- Output cleaning de prefixes (`Aquí: Texto limpio` → `Texto limpio`).
- Fallback cuando LLM devuelve empty.
- Fallback cuando LLM throws 4xx.
- 503 cuando LLM throws 5xx (distinguible por regex `5\d{2}` en el message).
- Contexto del libro se incluye en el user prompt.
- Verifica `model: claude-sonnet-4-6` + `max_tokens: 600`.

---

## Decisiones

1. **Sync endpoint, no SSE** — el modal del editor recibe una sugerencia completa, no token-por-token. SSE agrega complejidad (consumer ReadableStream + framing) sin valor real para este uso. Si UX lo pide, sprint propio.
2. **Cliente Anthropic propio en AuthorAiService** (no reuso `AIService` del Eco) — desacopla el módulo Author. `AIService` está cargado con context de RAG + conversaciones; mezclar haría tests frágiles.
3. **Fallback rule-based no es nunca dañino** — degrada con dignidad si la key falla, key falta, o LLM hace timeout. El autor siempre obtiene algo (incluso si es el texto original ligeramente transformado).
4. **Throttle 30/min/user** — más generoso que Eco (30/min también) porque el editor es bursty: el autor click ✨ varias veces seguidas mientras itera.
5. **Sin cuota separada** — los AI helpers no consumen del pool de Eco. Decisión: el editor de autor es B2B, asume costo plataforma. Si volumen crece, agregar quota en sprint propio.
6. **No persisto la sugerencia** — el autor decide aceptar o no en el momento. No hay valor en logs de sugerencias sin contexto.
7. **`context` opcional del libro** — el resumen del book va como contexto editorial. Sin estimar tokens precisamente; 1000 chars max es ~250 tokens, marginal.

---

## Smoke verification (local)

- API typecheck OK.
- API lint clean (4 warnings preexistentes, sin errores nuevos).
- API tests 580/581 (+9 nuevos, 1 skipped sentinel).
- Web typecheck + lint clean.
- Web tests 56/56.
- @psico/types + @psico/api-client builds OK.

---

## Deuda técnica abierta

- **Cover image upload + audio upload** (multipart R2) — siguen pendientes de S71.C.
- **Revenue share** (`/api/autor/cobros`) — siguen pendiente.
- **Streaming SSE** — diferido. Si UX feedback pide percepción más rápida, agregar.
- **Cuota separada** para autores cuando volumen lo justifique.
- **Mobile** del editor — el editor de autor es desktop-first; no se incluye mobile parity.
- **Tests UI dedicados** para `AiHelperModal` — diferidos.
- **Métricas LLM** (cost tracking) — no se loggean tokens a `BillingUsageDay` ni tabla equivalente. Cuando importe, agregar.
- **Helpers más complejos** (ej. "buscar similitudes en otros libros del catálogo", "verificar referencias") — fuera de scope v1.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy a Railway (sin migration, requiere `ANTHROPIC_API_KEY` ya configurado).
3. Smoke walk:
   - Como AUTHOR: abrir un capítulo, escribir un párrafo.
   - Click ✨ → seleccionar "Revisar tono" → "Generar sugerencia" → "Reemplazar bloque".
   - Si la key no está configurada, el response llega con `source: "fallback"` y el modal muestra "modo local".

Después: cover/audio upload (S71.C-uploads) o cobros (S71.C-revenue) o un sprint nuevo.
