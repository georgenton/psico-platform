# ADR 0017 — LearningEvent V1: registro educativo append-only con firewall emocional absoluto

**Estado:** Propuesto (diseño CC-7, 2026-07-19). Sin implementación aún —
contrato completo en [docs/architecture/learning-events.md](../architecture/learning-events.md).

## Contexto

Content Core está en producción (ADR 0016; CC-6E cerrado). El siguiente
sistema es el registro de actividad educativa que alimentará Guide V1 y el
progreso de aprendizaje. El modelo `LearningEvent` existe **inerte** en el
schema desde Content Core (tabla migrada, cero escrituras, cero endpoints),
con un `payload Json?` y un enum de 8 kinds que **no** se asumen como contrato
final.

El programa V2 del Mapa Emocional estableció (Fase C, "aprendizaje ≠ mapa")
que el engagement educativo no puntúa ejes emocionales. Ese principio debe
sobrevivir a la llegada de un log educativo rico — el riesgo obvio es que un
sistema futuro "aproveche" los eventos como señal psicológica.

## Decisión

1. **Append-only, server-owned.** El cliente solicita (`type` + claves de
   catálogo); el servidor valida contra una **unión discriminada cerrada**,
   resuelve IDs, fecha con su reloj y construye el registro. Sin UPDATE ni
   DELETE por API. Sin `Record<string, unknown>`, sin campo `meta`, sin JSON
   libre en el wire (la columna `payload Json` es encoding de un payload ya
   validado, no contrato).
2. **V1 = 7 tipos:** `unit_opened`, `unit_completed`, `concept_explored`,
   `guide_session_started`, `guide_session_completed`,
   `active_recall_attempted`, `practice_completed`. Los `guide_session_*` solo
   los emite el servidor en transiciones de `GuideSession` (no request-ables).
   Los kinds sobrantes del enum actual (`BLOCK_DWELL`, `HIGHLIGHT_CREATED`,
   `ANNOTATION_CREATED`, `RESONANCE_CONFIRMED`) quedan fuera de V1.
3. **Sin texto personal por construcción:** ningún campo del contrato puede
   portar texto libre — todos los strings son claves validadas contra catálogo
   (Content Core, CHAPTER_CONCEPTS, CHAPTER_EXERCISES, ítems de recall) y el
   resultado de recall es categórico (`correct|incorrect|skipped`), jamás la
   respuesta del usuario.
4. **Firewall emocional absoluto (invariante):** LearningEvent, ReadingSession,
   GuideSession, progreso, quizzes, highlights, annotations y toda actividad
   educativa **no leen ni modifican** ejes, confianza, evidencia, procedencia
   ni estado del Mapa Emocional. Leer no implica estado emocional; completar
   una actividad no implica regulación; recordar no implica bienestar;
   engagement no es una emoción; rendimiento no es una señal clínica.
   `Resonance` sigue siendo el único puente, cualitativo y por confirmación
   explícita (ARC) — ningún evento se transforma automáticamente en resonancia
   ni en valor de eje.
5. **Enforcement en tres capas:** frontera de módulos + ratchet estático
   `no-learning-in-map` (espejo del `no-emotional-map` existente); tipos (el
   input del scoring no gana campos learning); y el **test de inversión
   semántica** — proyección canónica del mapa antes/después de crear todos los
   tipos V1 + sesiones + marcas, con igualdad estricta exigida y un control
   negativo (un checkin SÍ debe mover la proyección) para que el test no pase
   vacío.
6. **Privacidad:** retención 24 meses rolling; borrado en cierre de cuenta
   (cascade ya presente); incluidos en el data export; analítica solo agregada
   con k-anonimato n≥10; prohibido su uso para publicidad o perfiles
   emocionales; entitlement de eventos = el mismo `ContentAccessService` del
   lector.
7. **Entrega en 8 PRs pequeños** (contratos puros → persistencia → endpoints →
   GuideSession → web → mobile → analítica → firewall full-stack), cada uno
   aditivo, reversible y deployable de forma independiente.

## Alternativas rechazadas

- **`meta`/JSON libre client-authored** — un agujero directo al firewall y un
  canal de exfiltración de texto (ya rechazado en ADR 0016; aquí se vuelve
  contrato con validación whitelist).
- **Eventos como fuente de señal del Mapa** ("leyó mucho ⇒ está mejor") —
  contradice el programa V2 completo; prohibido por invariante y ratchet.
- **Cliente emite `guide_session_*`** — log de sesiones falsificable; solo
  transiciones server-side.
- **Duplicar highlights/annotations/resonances como eventos en V1** — sus
  tablas ya son fuente de verdad; duplicar sin consumidor es ruido.

## Consecuencias

- Guide V1 obtiene continuidad, progreso y recall espaciado leyendo read
  models educativos, sin acceso a Diario/Eco/Mapa y sin poder convertir
  engagement en score personal.
- El Mapa conserva su contrato V2 intacto: solo autoinforme, dinámica ordinal,
  texto on-device consentido y resonancias confirmadas.
- El costo de la pureza: cada tipo de evento nuevo exige tocar el contrato
  (unión + parser + tests). Es deliberado — añadir un evento debe doler un
  poco para que nadie cuele telemetría arbitraria.
