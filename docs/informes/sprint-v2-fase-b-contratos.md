# Sprint — Mapa Emocional V2 · Fase B (contratos, registry, flags, ratchets)

**Rama:** `feature/emotional-map-v2-fase-b`
**Fecha:** 2026-07-11
**Tests:** API +13 nuevos (registry 5 · copy-contract 2 · v2-contract 6) · typecheck + Prisma validate verdes.
**Regla del PR:** **cero cambio de comportamiento público** — todos los flags nacen con defaults que preservan lo actual.

---

## 1. Contexto

La auditoría de Fase A (prompt maestro V2) verificó contradicciones estructurales entre código, investigación y UI del Mapa Emocional: engagement alimentando ejes psicológicos, LLM creando puntuaciones, `pct` global "Comprensión emocional", "Te recuperas rápido" con n=20 (el paper exige ~100), "Confianza 100%" con n=40 (cobertura real del CI ≈78%), y el EWS (sensibilidad 40%) serializado al cliente público con nota de "Señal temprana". **Decisión de producto del usuario: el mapa se transforma, no se elimina.**

Este PR fija el **significado** antes de tocar la visualización.

## 2. Lo que se construyó

1. **`shared/flags.ts`** — flags env-based mínimos (`EMOTIONAL_MAP_V2`, `EMOTIONAL_MAP_LEGACY_UI`, `EMOTIONAL_MAP_OU` [absorbe el kill-switch legacy con la misma semántica], `EMOTIONAL_MAP_LLM_SCORING`, `EMOTIONAL_MAP_EWS_PUBLIC`, `CONTENT_RESONANCE`). Cada flag declara su default = comportamiento actual.
2. **`emotional-map/model-registry.ts`** — IDs canónicos H1 / OU-G0 / OU-GT / OU-O1 / EWS-R1 / TXT-L1 / CHK-S1 con estado, gates, limitaciones citando el paper, y copy permitido/prohibido. El spec ancla los gates declarados a las constantes reales (`MIN_OBS_FOR_FIT`, `EWS_MIN_OBS`, `RECOVERY_MIN_OBS=20` pineado como violación conocida).
3. **Palancas cableadas en el scoring** (puro, sin leer env): `ewsPublic` (false → `affectDynamics.ews = null`, nada llega al wire) y `llmScoringEnabled` (false → el provider jamás se llama; ejes interpretativos caen a "reuniendo datos" salvo señal medida). El service las alimenta desde los flags.
4. **Fix de privacidad**: `DiaryTextFeature.entryId` gana **FK con CASCADE** a `DiaryEntry` (migración `20260711000000_text_feature_entry_cascade`, con limpieza de huérfanos previa). Borrar una entrada del diario ahora borra sus derivados — antes quedaban huérfanos para siempre.
5. **Tests de caracterización (ratchet)** — `emotional-map.v2-contract.spec.ts`: pinean las violaciones actuales (highlights mueven conexión; el LLM crea `compasion=0.83`; existe `pct`) y prueban las palancas nuevas (LLM off ⇒ ningún número fabricado — test obligatorio 33.2.9; ewsPublic=false ⇒ `tauAc` ausente del JSON).
6. **Copy contract con ratchet** — `copy-contract.spec.ts` escanea los 8 componentes públicos del mapa (web+mobile) contra 15 términos prohibidos; el snapshot `KNOWN_VIOLATIONS` captura la realidad exacta de hoy. Término nuevo ⇒ build roto; fix ⇒ encoger snapshot en el mismo PR.
7. **Documentación**: [emotional-map-v2.md](../architecture/emotional-map-v2.md) (arquitectura objetivo + fases + decisiones L1–L6) · [copy contract](../product/emotional-map-copy-contract.md) · [matriz qué-alimenta-qué](../product/learning-vs-emotional-map.md) · [Model Registry doc](../research/emotional-map-model-registry.md) · [ADR 0014](../adr/0014-emotional-map-v2-facts-narrator.md).

## 3. Hallazgos nuevos durante la implementación

- El snapshot real del copy reveló dos ocurrencias que la auditoría manual no vio: **mobile `mapa.tsx` también muestra "Comprensión emocional"** y el **modal de privacidad menciona "conversaciones con Eco"** (ocurrencia benigna — dice que están cifradas — pineada igual para revisión de contexto en Fase F).
- El twin mobile de `affect-copy.ts` contiene exactamente las mismas 6 violaciones que el web (divergencia cero — bueno para el fix de B').

## 4. Qué NO cambia con este PR

Respuesta del API idéntica byte a byte (flags en default), UI intacta, OpenAPI sin cambios, migración solo agrega una FK (aditiva, con limpieza de huérfanos). El apagado del EWS, el gate de recuperación 20→100 y el copy neutro son la **decisión L1** — un PR aparte de pocas líneas cuando el usuario apruebe.

## 5. Decisiones pendientes (bloquean las siguientes fases)

L1 hotfix B' · L2 destino del radar (recomendado: conservarlo restringido a autoinforme) · L3 LLM→Narrator · L4 opt-in del análisis local · L6 alcance del LearningDashboard. Detalle en [emotional-map-v2.md §6](../architecture/emotional-map-v2.md).
