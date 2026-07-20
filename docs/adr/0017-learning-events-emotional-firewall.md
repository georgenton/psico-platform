# ADR 0017 — LearningEvent V1: comandos de dominio append-only con firewall emocional absoluto

**Estado:** Propuesto (diseño CC-7, 2026-07-19; corregido tras review de PR
#584). Sin implementación aún — contrato completo en
[docs/architecture/learning-events.md](../architecture/learning-events.md).

## Contexto

Content Core está en producción (ADR 0016; CC-6E cerrado). El siguiente
sistema es el registro de actividad educativa que alimentará Guide V1 y el
progreso de aprendizaje. El modelo `LearningEvent` existe **inerte** en el
schema desde Content Core (tabla migrada, cero escrituras, cero endpoints),
con un `payload Json?` y un enum de 8 kinds que **no** se asumen como contrato
final.

El programa V2 del Mapa Emocional estableció (Fase C, "aprendizaje ≠ mapa")
que el engagement educativo no puntúa ejes emocionales. Ese principio debe
sobrevivir a la llegada de un log educativo rico.

La primera versión de este diseño modelaba un `POST /api/learning/events`
genérico donde el cliente declaraba hechos (`unit_completed`, `result:
"correct"`, `stepsCompleted`). La review lo rechazó con razón: **un log no es
server-owned si el evento se limita a copiar una afirmación del cliente.**

## Decisión

1. **Comandos de dominio, no eventos en el wire.** El cliente invoca comandos
   (`POST /api/learning/units/:unitKey/open|complete`,
   `…/concepts/:conceptKey/explore`, `…/recall-attempts`,
   `…/practices/:exerciseKey/complete`, `POST /api/guide/sessions`,
   `PATCH …/complete`). Cada comando valida, ejecuta una **transición de
   estado server-side** y solo entonces emite el evento vía el escritor único.
   No existe un POST genérico capaz de solicitar todos los tipos. La matriz de
   ownership declara por tipo qué garantiza el servidor y qué permanece
   self-reported (una respiración completada no es verificable server-side y
   no se presenta como tal).
2. **Hechos calculados por el servidor, claims clasificados:** en
   `unit_completed` el servidor garantiza unidad/revisión válidas,
   entitlement, estado previo registrado, transición de progreso aceptada
   (sin ella ⇒ 409 `LEARNING_EVENT_INVALID_TRANSITION`) y reloj/identidad
   server-owned — pero el consumo real, la atención y la comprensión
   permanecen self-reported (`unit_opened` no es prueba de consumo; el copy
   dice "marcaste N como completados", no "completaste N"); el `result` del recall en ítems
   objetivos lo **califica el servidor** contra el catálogo
   (`selectedOptionKey`, jamás texto); los autoevaluados quedan marcados
   `evaluationSource="self_assessed"`, excluidos de precisión y sin gobernar
   el espaciado; `stepsCompleted` lo cuenta el servidor desde el estado de la
   GuideSession. Los `guide_session_*` solo nacen de transiciones de sesión —
   no son expresables como request.
3. **`idempotencyKey` obligatorio** en todo comando de cliente (400 si falta;
   replay exacto ⇒ 200; misma key con payload distinto ⇒ 409
   `LEARNING_EVENT_IDEMPOTENCY_CONFLICT`), además de la dedup semántica por
   tipo.
4. **Entitlement por resolución completa:** toda clave de catálogo se resuelve
   server-side `catalog key → concept/exercise/item → unit → edition → book →
ContentAccessService`. Sin contextos opcionales que eviten el gate; clave
   sin relación editorial inequívoca ⇒ 422
   `LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT` y nada persiste.
   `GET /api/learning/progress` no expone metadata de contenido al que el
   usuario ya no tiene acceso.
5. **Escritor único + ratchet:** `LearningEventRepository.appendValidated` es
   el único punto autorizado a escribir la tabla — recibe solo la unión
   discriminada validada (su firma no admite `Json`), reconstruye el payload y
   añade actor/reloj/schemaVersion/IDs. El ratchet
   `no-direct-learning-event-write` falla el build si
   `prisma.learningEvent.create|update|delete|upsert` (y variantes `*Many`)
   aparece fuera del repositorio. **Append-only no depende de que no exista un
   endpoint HTTP.**
6. **Firewall emocional absoluto (invariante):** la actividad educativa no lee
   ni modifica `value`/`confidence`/`status`/`evidence`/señal/procedencia de
   ningún eje. Leer ≠ estado emocional; completar ≠ regulación; recordar ≠
   bienestar; engagement ≠ emoción; rendimiento ≠ señal clínica.
7. **Resonance (corregido):** para CC-7, Resonance es cualitativa, requiere
   confirmación explícita, **no modifica automáticamente** ningún eje,
   **jamás** la crea un LearningEvent, y `concept_explored` no es una
   Resonance. La conversión preexistente ARC-C1/ARC-P1 (resonancias →
   Conexión/Propósito) quedó **resuelta en ADR 0018**
   (`EXPLICIT_AXIS_EXCEPTION`): excepción ratificada, acotada por los
   invariantes INV-1…INV-5 y verificada por el test de dos partes con delta
   confinado. Sigue FORBIDDEN para todo lo nuevo de CC-7.
8. **Firewall dinámico adelantado:** PR 2 (persistencia) incluye los dos
   ratchets estáticos **y** el test de inversión semántica DB-level en dos
   partes — Parte 1: proyección canónica del mapa **idéntica** tras crear los
   7 tipos + progreso + sesiones + marcas (sin excepción alguna); Parte 2:
   confirmar una Resonance ⇒ delta confinado a conexion/proposito con
   evidencia ARC + reversibilidad — más el control negativo (un checkin sí
   mueve la proyección). **Los endpoints (PR 3) no aterrizan sin un firewall
   dinámico ejecutable.** Gate: la decisión ARC se resolvió en ADR 0018
   (aprobación en su PR); el test de inversión adopta la forma de dos partes
   (educativa ⇒ idéntico siempre; resonancia ⇒ delta confinado a
   conexion/proposito + reversibilidad) — enmienda explícita y documentada,
   no una excepción silenciosa. PR 8 lo amplía a full-stack.
9. **Append-only ≠ retención infinita.** Sin UPDATE/DELETE por API de
   producto; eventos inmutables durante su vida útil; eliminaciones
   autorizadas: cierre de cuenta, política de retención aprobada ejecutada
   por el worker (con métricas/audit log de conteos, jamás payloads) y
   procedimiento excepcional de privacidad/compliance auditado.
10. **Privacidad como propuesta, no como hecho:**
    `retention_proposal=24_months` y `analytics_k_proposal=10`, ambos
    `PENDING_PRIVACY_PRODUCT_APPROVAL`; los valores finales viven en
    configuración validada, no dispersos en código. k-anonimato se documenta
    como **barrera mínima, no garantía de anonimato**; el threat model cubre
    inferencia por combinación de celdas, ataques de composición entre
    periodos, cohortes pequeñas, reidentificación por claves raras y acceso
    interno indebido.
11. **Entrega en 8 PRs** (contratos puros → persistencia+firewall → comandos →
    GuideSession → web → mobile → analítica → firewall full-stack), cada uno
    aditivo, reversible y deployable de forma independiente.

## Alternativas rechazadas

- **`POST /api/learning/events` genérico** — permitía al cliente declarar
  hechos no verificables con sello del servidor. Rechazado en review;
  reemplazado por comandos de dominio con transición.
- **`meta`/JSON libre client-authored** — agujero directo al firewall y canal
  de exfiltración de texto (ya rechazado en ADR 0016).
- **Eventos como fuente de señal del Mapa** — contradice el programa V2;
  prohibido por invariante y ratchets.
- **Cliente emite `guide_session_*` o declara `stepsCompleted`** — log
  falsificable; solo transiciones server-side con conteo propio.
- **Confiar el append-only a la ausencia de endpoints** — el bypass interno
  (`prisma.learningEvent.*` disperso) queda cerrado por ratchet de build.
- **Duplicar highlights/annotations/resonances como eventos en V1** — sus
  tablas ya son fuente de verdad.

## Consecuencias

- Guide V1 obtiene continuidad, progreso y recall espaciado (solo
  server-graded) leyendo read models educativos, sin acceso a Diario/Eco/Mapa
  y sin convertir engagement en score personal.
- El Mapa conserva su contrato V2; la única conversión resonancia→eje que
  existe es la preexistente ARC, ahora marcada como decisión pendiente e
  independiente que el test de inversión obliga a resolver explícitamente.
- El costo de la pureza: cada tipo de evento nuevo exige comando, transición,
  parser y tests. Es deliberado — añadir un evento debe doler un poco para que
  nadie cuele telemetría arbitraria ni claims disfrazados de hechos.
