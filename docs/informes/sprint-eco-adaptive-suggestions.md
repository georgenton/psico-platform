# Sprint — Sugerencias adaptativas de Eco (backlog de producto aprobado)

**Fecha:** 2026-07-12
**Rama:** `feature/eco-adaptive-suggestions`
**Cierra:** el último ítem del backlog de producto aprobado ("Sugerencias adaptativas de Eco según cómo el usuario interactúa con libro/actividades + según el Mapa Emocional").

---

## 1. Qué se construyó

Eco propone **aperturas de conversación adaptadas** a lo que el usuario ha estado haciendo (leyendo, reflexionando) y a su ánimo autoinformado del Mapa. Son curadas por reglas (cero LLM, deterministas), y el copy es honesto — refleja señales explícitas del usuario, nunca "la IA notó cómo te sientes".

**Principio de diseño (alineado con V2):** las sugerencias **LEEN** el mapa/actividad para **PROPONER**; nunca escriben nada. Nada entra al mapa por sugerir una conversación.

### Backend

- **`GET /api/eco/suggestions`** — devuelve hasta 3 aperturas. Cada `EcoSuggestion` lleva `{id, title, prompt, reason, scope}`.
- **`eco-suggestions.ts`** — selector puro `buildEcoSuggestions(signals, limit)`. Reglas priorizadas:
  1. `continue-chapter` — capítulo en curso (scope al capítulo, reusa el opener curado de `ECO_CHAPTER_PROMPTS`).
  2. `after-chapter` — capítulo completado hace ≤3 días (mutuamente excluyente con la anterior).
  3. `mood-supportive` / `mood-savoring` — desde el **momento** del Mapa (ánimo autoinformado hard/low → apoyo · good/great → saborear · ok → nada), ventana 2 días.
  4. `after-reflection` — reflexión escrita hace ≤2 días (solo el hecho, jamás el texto).
  5. `cold-start` — fallback genérico; siempre garantiza ≥1.
- **`EcoSuggestionService`** — reúne las señales (ReadingSession + `EmotionalMapService.getForUser` cacheado + DiaryEntry.createdAt + conteo EcoMessage) y delega al selector.
- **HomeService** — `fetchEcoMoment` ahora incluye `suggestions` (top 2) vía `EcoSuggestionService.topForHome`, en paralelo con el resto del agregador.

### Cliente

- `@psico/types`: `EcoSuggestion`, `EcoSuggestionsResponse`, `EcoSuggestionKind`; `HomeEcoMoment.suggestions`.
- `@psico/api-client`: `ecoApi.getSuggestions()`. OpenAPI regenerado.

### Web

- `EcoSuggestions.tsx` — strip de chips en el EcoShell (visible hasta elegir uno o enviar el primer mensaje). Al elegir siembra el composer + scope.
- `EcoMomentSuggestions.tsx` — chips en la Home Eco card; al elegir stashea el handoff (texto + scope) y navega a Eco.
- El handoff reader→Eco se generalizó: `source` opcional + `scope?` — EcoShell aplica el scope al llegar (mejora también el path del lector).

### Mobile

- `EcoSuggestions.tsx` — strip horizontal en la pantalla Eco, paridad con web.
- Home Eco card con chips que stashean el handoff + navegan a `/(tabs)/eco`.
- Handoff mobile generalizado igual que web.

## 2. Privacidad (ADR 0007)

El selector lee solo señales categóricas/temporales: metadata de contenido público (libro/capítulo + progreso), timestamps (`DiaryEntry.createdAt` — **nunca** body/excerpt cipher), el token de ánimo autoinformado (`momento`) y conteos. Ningún ciphertext se selecciona. El copy `reason` refleja un auto-reporte explícito, no una inferencia sobre texto privado.

## 3. Verificación

| Suite                    | Resultado                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| API (Vitest)             | 839/840 (+11 `eco-suggestions.spec.ts`) + home spec actualizado (4º arg del constructor) |
| Crypto                   | 34/34                                                                                    |
| Web (Vitest + RTL)       | 312/312 (+4 `EcoSuggestions.test.tsx`)                                                   |
| Mobile (Jest + RNTL)     | 74/74 (+4 `EcoSuggestions.test.tsx`)                                                     |
| Typecheck + lint ×3      | ✅                                                                                       |
| OpenAPI `generate:check` | in sync — capturó `GET /api/eco/suggestions`                                             |

## 4. Decisiones

1. **Rule-based curado, no LLM** — consistente con `ECO_CHAPTER_PROMPTS`/`CHAPTER_EXERCISES`, determinista, sin costo ni superficie de privacidad extra.
2. **Señal del Mapa = momento (ánimo autoinformado)**, no los ejes de cobertura — evita el framing manipulador de "optimiza tu score" que V2 prohíbe.
3. **Dos superficies**: la pantalla Eco (donde nace la pregunta "¿de qué hablo?") + la Home Eco card (descubrimiento). Ambas siembran, jamás envían solas.
4. **Handoff generalizado con scope** — un mismo mecanismo para lector, Home y (futuro) otras superficies.

## 5. Deuda / siguiente

- Sin tests de integración del `EcoSuggestionService` (queries Prisma reales) — cubierto el selector puro + el service por typecheck.
- La oferta de resonancia desde `EXERCISE` sigue sin UI (el enum ya la contempla) — candidata separada.
- Las sugerencias no se refrescan tras enviar el primer mensaje en la misma sesión (se ocultan, por diseño).
