# Sprint V2 · Fase D — Opt-in del análisis local (L4) + Evidence lite

**Fecha:** 2026-07-10
**Rama:** `feature/emotional-map-fase-d-consent`
**Decisión aplicada:** **L4** (default off + consentimiento explícito + borrado en cascada). El Evidence Ledger persistido (tabla + corregir/ocultar/eliminar por insight) queda para la Fase E con ARC; esta fase entrega su versión lite: procedencia por dimensión en el modal ⓘ.

---

## 1. Qué corrige

Desde la Etapa 6, el cliente analizaba el texto descifrado de las reflexiones **sin pedir permiso** y subía los features numéricos. La auditoría de Fase A lo marcó como violación del V2 ("nada entra al mapa silenciosamente"; los datos derivados son sensibles). Fase D lo invierte: **consentimiento explícito, default off, y borrado de derivados al retirarlo**.

## 2. Qué se construyó

### Backend (L4 — tres capas de enforcement)

- **Schema:** `PrivacySettings.localTextAnalysis Boolean @default(false)` — migración aditiva `20260711120000_fase_d_local_text_analysis_opt_in`. Default off para TODOS, incluidas las cuentas que subieron features antes de que existiera el consentimiento: sus filas quedan **dormidas** (el scoring deja de leerlas) hasta que opten in, y se **borran** si optan out explícitamente.
- **Endpoint:** `POST /api/emotional-map/text-features` → **403 `TEXT_ANALYSIS_NOT_ENABLED`** sin opt-in (gate duro server-side; un cliente stale no puede subir datos no consentidos — los hooks son best-effort con catch, así que el guardado de la reflexión nunca se afecta).
- **Scoring:** `EmotionalMapService.compute()` solo lee `DiaryTextFeature` con consentimiento (el fetch queda condicionado; sin opt-in, `textFeatures: []`).
- **Opt-out = borrado:** `UsersService.updatePrivacy({ localTextAnalysis: false })` ejecuta `diaryTextFeature.deleteMany` + invalida el cache del mapa (`emotionalMapCacheKey` exportado desde el emotional-map service como única fuente de la key; `UsersService` ganó el inject de Redis — módulo global).
- `/user/me` expone `privacy.localTextAnalysis`; `UpdatePrivacyDto` + tipos compartidos extendidos.

### Evidence lite (procedencia por dimensión)

- `EmotionalMapDimension.evidence?: { modelId, n } | null` — opcional (cache-tolerant). `modelId` es un ID canónico del Model Registry; `n` son las observaciones que respaldan el eje:
  - Calma vía OU → `OU-GT` (con tendencia) / `OU-G0`, n = nObs de la serie.
  - Claridad/Compasión/Consciencia → `CHK-S1` (n respuestas del check-in) / `TXT-L1` (n reflexiones analizadas) / `H1` (n entradas, LLM).
  - Conexión/Propósito → `H1` con el conteo de eventos que hoy los alimenta.
  - Eje en "Reuniendo datos" → `evidence: null` (no hay número que justificar).
- `computeCheckinAxes`/`computeTextAxes` devuelven `n` además de value/confidence.
- **Modal ⓘ (web + mobile):** línea nueva bajo las fuentes — "Método {modelId} · basado en N registros".

### Clientes

- **Helper cacheado `textAnalysisConsent()`** (twins web + mobile, fails closed): una consulta a `/user/me` por sesión; el toggle actualiza el cache. Los 4 puntos de análisis (composer del Diario web/mobile + pestaña Reflexión del dock/sheet) verifican el consentimiento ANTES de analizar — sin opt-in ni siquiera se corre el análisis local.
- **Consent cards:** web `LocalTextAnalysisCard` en `/dashboard/security` (switch + confirm inline "Desactivar y borrar"); mobile twin en la pantalla Seguridad (Switch + `Alert.alert` destructivo), auto-cargada vía el helper.
- Copy del consentimiento: "la app analiza el texto de tus reflexiones **en tu dispositivo** — el texto nunca sale de él; solo suben números… Si lo desactivas, borramos esos datos derivados."

### Seed demo

- Las cuentas demo con features sembrados hacen upsert de `localTextAnalysis: true` (consienten) para que su mapa siga encendiendo la fuente "analizado en tu dispositivo". Re-correr `node scripts/seed-demo-users.mjs` post-deploy.

## 3. Cambio de comportamiento público (intencional)

Con el default off, **el texto deja de alimentar el mapa para todos los usuarios existentes hasta que opten in**: quienes tenían Claridad/Compasión/Consciencia "Medido" por TXT-L1 verán esos ejes volver al LLM o a "Reuniendo datos". Es el costo correcto del consentimiento — los datos siguen ahí (dormidos) y se reactivan con un toggle.

## 4. Verificación

| Suite                    | Resultado                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| API (Vitest)             | 806/807 (1 skipped sentinel) — +6: 403 sin consent ×2 · compute skip · evidence · opt-out cascade ×2 |
| Web (Vitest + RTL)       | 298/298 (fixtures de privacy actualizados)                                                           |
| Mobile (Jest + RNTL)     | 65/65                                                                                                |
| Typecheck + lint ×3      | ✅ (10 warnings API: 7 preexistentes + 3 `any` en spec siguiendo el patrón del archivo)              |
| OpenAPI `generate:check` | in sync                                                                                              |

## 5. Deuda / siguiente

- Migración `20260711120000` + re-seed demo pendientes de aplicar en Railway.
- El texto consentido AÚN puntúa ejes (TXT-L1 → claridad/compasión/consciencia); el V2 lo quiere como "patrones de lenguaje descriptivos" — se transforma en Fase F con las secciones V2.
- Evidence Ledger persistido (corregir/ocultar/eliminar por insight) — Fase E con ARC.
- L2 (radar solo autoinforme) y L3 (LLM→Narrator) siguen abiertas.
- La `PrivacyCard` de Perfil (3 toggles simples) no ganó el toggle nuevo: el consentimiento vive en Seguridad porque necesita el flow de confirmación destructiva. Unificar cuando llegue el diseño V2 de settings.
