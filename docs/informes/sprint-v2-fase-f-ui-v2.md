# Sprint V2 · Fase F — UI V2 del mapa (decisiones L2 + L3)

**Fecha:** 2026-07-11
**Rama:** `feature/emotional-map-fase-f-ui-v2`
**Cierra:** la última fase del núcleo V2 — las dos decisiones que quedaban abiertas (**L2** radar restringido a autoinforme · **L3** LLM → Narrator) + la UI V2 completa web/mobile, todo detrás de un rollout server-driven.

---

## 1. Decisiones aplicadas (recomendaciones documentadas en emotional-map-v2.md §6)

### L3 — el LLM jamás puntúa bajo V2; nace el Narrator (NAR-L1)

- Bajo `EMOTIONAL_MAP_V2`, `provider.score()` **no se invoca nunca** — ni con señal abundante. Los ejes interpretativos sin fuente medida (check-in) muestran "Reuniendo datos" en lugar de un número fabricado. Esto **invierte la KNOWN VIOLATION 5.3** bajo el flag (el test de caracterización de Fase C que verificaba el payload sin engagement quedó obsoleto: ya no hay payload porque no hay llamada).
- **Narrator NAR-L1** (registrado en el Model Registry): flag `EMOTIONAL_MAP_NARRATOR` default **off**. El provider gana un método opcional `narrate(facts)` que recibe SOLO números ya calculados (momento, counts, valores CHK-S1 + n, parámetros OU, resonancias, n de lenguaje) y devuelve `{headline, body}` — copy, nunca puntuaciones. Cualquier fallo → `narrative: null` y el mapa se sirve intacto. **Apagarlo no cambia ningún dato** (separación Facts/Narrator, principio 3).
- El prompt del narrator prohíbe números inventados, diagnóstico, consejo clínico y calificar direcciones como buenas/malas. Test pinea que las keys de los facts son exactamente las 7 esperadas.

### L2 — el radar sobrevive SOLO como «Resumen de tus respuestas»

- La UI V2 no tiene radar de 6 ejes ni "Comprensión emocional N %". El radar queda restringido a **«Cómo me describí»**: los 3 ejes del check-in (CHK-S1), homogéneos y autoinformados, con chip **"Autoinformado"** (nunca "Medido") y sin agregado global. El triángulo solo se dibuja cuando los 3 ejes tienen respuestas; si no, filas con estado honesto + CTA al check-in.

## 2. Wire V2 (cache-tolerant, campos opcionales)

- `v2?: true` — marker de layout. Solo viaja cuando `EMOTIONAL_MAP_V2` on **y** `EMOTIONAL_MAP_LEGACY_UI` off (el service lo strippea durante la ventana de dual-run: contrato V2 vivo bajo layout legacy). Los clientes ramifican por el response — **rollout server-driven, cero envs de cliente**.
- `momento?: {mood, at} | null` — el último registro de ánimo, literal.
- `lenguaje?: {n} | null` — TXT-L1 pasa a **descriptivo-only** bajo V2 (cierra la deuda de Fase D): las features de texto ya NO puntúan ningún eje; la sección «Patrones de lenguaje» reporta cuántas reflexiones procesó el analizador local y aclara que no puntúa el mapa. Legacy conserva el scoring por texto (ratchet).
- `narrative?: {headline, body, modelId} | null`.
- **`pct` queda en el wire por compat** (cron `EmotionalMapSnapshot` + blobs cacheados + serie de Evolución) pero la UI V2 **nunca lo renderiza**. Retirarlo del todo espera el tratamiento V2 del chart de Evolución (Fase G).
- **Gate de tendencia**: bajo V2 la dirección up/down se retiene hasta `TREND_PUBLIC_MIN_OBS = 60` (tabla de gates §4 del doc V2). El fit detrendado sigue corriendo — estabilidad y nivel actual no cambian; solo se calla la etiqueta de dirección con serie corta.

## 3. UI V2 (web + mobile, misma estructura)

Secciones independientes, cada una con su procedencia: **Mi momento** (ánimo literal + fecha) → **Cómo me describí** (radar/filas de autoinforme + ⓘ) → **Dinámica de mis registros** (bloque OU existente) → **Mis resonancias** (Fase E) → **Patrones de lenguaje** (opt-in, descriptivo) → **Una lectura en palabras** (narrative, si existe) → puntero a Mi Evolución.

- **Web:** componentes nuevos `MapMomento` · `MapSelfReport` (con modo `compact` que reutiliza el mini-map de Inicio) · `MapLenguaje` · `MapNarrative`; `page.tsx` ramifica por `map.v2`; `MapInfoButton` gana prop `v2` (intro + línea de privacidad V2) y reescribe «conversaciones con Eco» → «charlas con Eco».
- **Mobile:** `MapSelfReportCard` extraído a `src/components/dashboard/mapa/` (testeable); la pantalla ramifica igual (momento inline + card + secciones); modal de transparencia con el mismo swap de copy.
- **Inicio (web):** bajo `v2`, el mini-map muestra el resumen compacto de autoinforme en vez del radar de 6 ejes + %.

## 4. Ratchets

- **copy-contract:** +6 archivos nuevos bajo contrato (todos con cero violaciones). Snapshot **encogido 4 → 3**: `MapInfoButton` limpio («charlas con Eco» en web y mobile). Lo pineado que queda («comprensión emocional» + «medido» en MapStage/MapDims/mapa mobile) vive SOLO en las ramas legacy — se borra al retirar el layout legacy (Fase G).
- **v2-contract:** +6 tests (score jamás bajo V2 · marker+momento+lenguaje · texto descriptivo vs legacy · narrator on/off con facts pineados · fallo del narrator no rompe el mapa · gate de tendencia 30 vs 70 obs). El test de payload de Fase C fue **reemplazado** por la inversión de 5.3 (documentado en el propio spec).
- **service spec:** +3 tests de la ventana dual-run (V2 on + LEGACY_UI on → marker stripped pero contrato V2 vivo · LEGACY_UI off → marker viaja · V2 off → nada cambia).
- **model registry:** entrada NAR-L1; H1 marcado "never invoked under EMOTIONAL_MAP_V2"; TXT-L1 actualizado (opt-in Fase D + descriptivo bajo V2); spec pinea ARC-C1 y NAR-L1 en la lista de IDs.

## 5. Verificación

| Suite                    | Resultado                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| API (Vitest)             | 820/821 (1 skipped sentinel) — +8: 6 v2-contract + 3 service − 1 reemplazado               |
| Web (Vitest + RTL)       | 312/312 — +11: MapSelfReport ×4 + MapMomento ×3 + MapLenguaje/Narrative ×4                 |
| Mobile (Jest + RNTL)     | 70/70 — +3 MapSelfReportCard                                                               |
| Typecheck + lint ×3      | ✅ (0 errores; 10 warnings preexistentes en API)                                           |
| OpenAPI `generate:check` | in sync — regenerado: capturó `/api/resonances` de Fase E (el emit no se había refrescado) |

## 6. Privacidad (ADR 0007)

- El Narrator recibe solo números y tokens categóricos ya calculados — nunca texto, nunca ciphertext (mismo contrato del provider de score).
- `momento` es el mood ordinal que el usuario ya registró; `lenguaje.n` es un count.
- El modal de privacidad ahora es más preciso bajo V2: «tu ánimo, tus etiquetas, tus respuestas al check-in y los temas que tú confirmas — nunca el texto».

## 7. Cambio público

**Ninguno con los defaults actuales** — `EMOTIONAL_MAP_V2` sigue off; el layout legacy queda intacto (MapStage/MapDims/mini-map como estaban). Los únicos strings públicos que cambian hoy: «conversaciones con Eco» → «charlas con Eco» en el modal de privacidad (web + mobile). Encender la UI V2 = `EMOTIONAL_MAP_V2=on` + `EMOTIONAL_MAP_LEGACY_UI=off` en Railway — decisión de producto por config, con ventana de dual-run intermedia si se quiere.

## 8. Deuda / siguiente

- **Fase G:** retirar el layout legacy (borra las ramas legacy → snapshot del copy-ratchet a cero) + tratamiento V2 de la serie «Comprensión emocional» de Evolución (hoy `pct` la sigue alimentando).
- Propósito sigue "Reuniendo datos" bajo V2 — su flujo de «temas importantes confirmados» queda para diseñarse junto a Fase H (Eco propone, el usuario confirma — mismo ciclo ARC).
- Narrator: fidelidad a los hechos enforced por prompt, no verificada formalmente (spot-checks al encenderlo).
- Fase H: Eco contextual (scopes + citas + propuestas confirmables).
