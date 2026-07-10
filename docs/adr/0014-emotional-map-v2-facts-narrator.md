# ADR 0014 — Mapa Emocional V2: transformación con separación Facts/Narrator

**Estado:** Aceptado (Fase B) · **Fecha:** 2026-07-11
**Decisión de producto vinculante:** el Mapa Emocional **se transforma, no se elimina** (usuario, 2026-07-11).

## Contexto

La auditoría de Fase A verificó que el pipeline legacy (H1) mezcla fuentes con semánticas incompatibles: engagement (lectura, highlights, mensajes a Eco) alimenta ejes psicológicos; un LLM produce puntuaciones numéricas de constructos; un porcentaje global se presenta como "Comprensión emocional"; el copy afirma "Te recuperas rápido" con n=20 y "Confianza 100 %" con n=40, mientras la propia investigación del proyecto ([paper-1-results.md](../research/paper-1-results.md)) muestra que θ es esencialmente no identificable bajo n≈100, que los intervalos bootstrap cubren ~78 % (nominal 90 %) y que el detector EWS tiene sensibilidad 40 % — y aún así el EWS se serializa al cliente público con una nota de "Señal temprana".

## Decisión

1. **Separación Facts/Narrator.** Un `FactsEngine` produce hechos con procedencia e incertidumbre (momentos autoinformados, dinámica OU con gates, autoinforme de check-ins, resonancias confirmadas, recursos practicados, patrones de lenguaje opt-in). Un `Narrator` opcional redacta copy descriptivo sobre esos hechos y **puede apagarse sin alterar ningún dato**. Ningún LLM crea, rellena o modifica puntuaciones.
2. **Aprendizaje separado.** El engagement migra a un LearningDashboard; el contrato de fuentes vive en [learning-vs-emotional-map.md](../product/learning-vs-emotional-map.md) y se hace cumplir con tests.
3. **Model Registry como fuente de verdad** ([emotional-map-model-registry.md](../research/emotional-map-model-registry.md)): IDs estables (H1, OU-G0, OU-GT, OU-O1, EWS-R1, TXT-L1, CHK-S1), estados honestos, gates anclados a constantes de código por spec.
4. **EWS-R1 research-only**, retirable del wire vía `EMOTIONAL_MAP_EWS_PUBLIC` (implementado en Fase B con default que preserva el comportamiento hasta el sign-off L1).
5. **Copy contract con ratchet** ([emotional-map-copy-contract.md](../product/emotional-map-copy-contract.md)): términos prohibidos fallan el build; las violaciones actuales quedan pineadas y solo pueden decrecer.
6. **Derivados = datos sensibles**: `DiaryTextFeature` gana FK CASCADE a `DiaryEntry` (borrar la entrada borra sus derivados); el opt-in explícito del análisis local llega en Fase D (decisión L4).
7. **Migración sin inferencia retrospectiva**: los hechos migran como hechos; ninguna marca histórica se convierte automáticamente en resonancia o rasgo.

## Alternativas descartadas

- **Eliminar el mapa**: rechazado por decisión de producto — el mapa es identidad del producto; el problema es semántico, no existencial.
- **Big-bang V2**: rechazado; el programa avanza por fases con flags (`EMOTIONAL_MAP_V2`, `EMOTIONAL_MAP_LEGACY_UI`, …) y dual-run por contrato.
- **Arreglar solo el copy**: insuficiente — el mezclado de fuentes es estructural (fórmulas), no solo de presentación.

## Consecuencias

- Fase B no cambia comportamiento público; cada cambio visible (B' en adelante) es una decisión explícita con flag y rollback.
- Los tests de caracterización convierten cada violación conocida en deuda medible que solo puede decrecer.
- El núcleo matemático (ou/bootstrap/ews/banco de personas) se conserva intacto como activo de investigación.
