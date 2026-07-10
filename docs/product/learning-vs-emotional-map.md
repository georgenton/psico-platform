# Qué alimenta qué — contrato de fuentes (Fase B)

**Regla madre:** la actividad de uso alimenta el **LearningDashboard**; el **Mapa Emocional** solo se alimenta de señales explícitas o confirmadas. Ninguna acción entra al mapa silenciosamente.

**Enforcement:** hoy, tests de caracterización en [`emotional-map.v2-contract.spec.ts`](../../apps/api/src/emotional-map/emotional-map.v2-contract.spec.ts) (violaciones pineadas como ratchet). En Fase C, los mismos tests se invierten: `+minutos/+highlights/+mensajes ⇒ el V2 no cambia`.

| Acción                             | Aprendizaje           | Mapa emocional                       | Estado hoy                                     |
| ---------------------------------- | --------------------- | ------------------------------------ | ---------------------------------------------- |
| Leer / tiempo de lectura           | Sí                    | **No**                               | ❌ viola (→ conexión/propósito)                |
| Racha                              | Opcional              | **No**                               | ❌ viola (→ payload LLM)                       |
| Completar capítulo                 | Sí                    | **No**                               | ❌ viola (→ propósito)                         |
| Ver video / escuchar audio         | Sí                    | **No**                               | ✓ (no alimenta)                                |
| Crear highlight / annotation       | Biblioteca            | **No**                               | ❌ viola (counts → conexión)                   |
| Marcar "Me resonó"                 | Candidato             | Todavía no                           | — (ARC no existe, Fase E)                      |
| Confirmar tema/contexto            | Sí                    | **Sí** (resonancia)                  | — (Fase E)                                     |
| Check-in explícito                 | No necesariamente     | **Sí**                               | ✓                                              |
| Mood log explícito                 | No                    | **Sí**                               | ✓                                              |
| Completar práctica                 | Sí                    | Solo "recurso practicado"            | — (completions no se persisten aún)            |
| Enviar mensajes a Eco              | Analítica             | **No**                               | ❌ viola (count → conexión + confianzas + LLM) |
| Reflexionar con Eco                | Privado               | Solo con permiso                     | — (análisis de Eco no existe)                  |
| Confirmar propuesta de Eco         | No                    | **Sí**                               | — (Fase H)                                     |
| Texto local analizado              | No                    | Patrón separado, **opt-in**          | ❌ viola (sin opt-in; puntúa ejes)             |
| Voice transcription count          | Analítica             | **No**                               | ❌ viola (→ confianza de claridad)             |
| Tags del diario                    | Privado               | Solo autoseleccionados y autorizados | ⚠️ van al LLM como counts                      |
| Abandonar lección / tardar leyendo | Analítica / ergonomía | **No**                               | ✓                                              |

Cada ❌ tiene su test de caracterización o su entrada en el copy contract; se van invirtiendo fase a fase (C, D, F) — nunca se agregan nuevos.
