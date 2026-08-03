# Documentación — índice

El mapa de **qué documento manda sobre qué**. Cuando dos documentos se
contradicen, gana el marcado aquí como autoridad canónica.

- **Bitácoras de sprint** (qué se construyó y cuándo) →
  [`informes/INDEX.md`](informes/INDEX.md).
- **Diseño de producto** (pantallas, shapes, endpoints) →
  [`design/handoff/INDEX.md`](design/handoff/INDEX.md).
- **Línea temporal completa** → el session log de [`../CLAUDE.md`](../CLAUDE.md).

---

## Mapa Emocional

| Tema                                                              | Autoridad canónica                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelo V2, fuentes permitidas, autoinforme vs inferencia, rollout | [`architecture/emotional-map-v2.md`](architecture/emotional-map-v2.md)                                                                                                                                     |
| Separación Facts / Narrator (el LLM nunca puntúa)                 | [`adr/0014-emotional-map-v2-facts-narrator.md`](adr/0014-emotional-map-v2-facts-narrator.md)                                                                                                               |
| Qué puede alimentar un eje, y las resonancias como fuente         | [`adr/0018-resonance-axis-policy.md`](adr/0018-resonance-axis-policy.md)                                                                                                                                   |
| Ánimo canónico: normalización, elegibilidad, atestación           | [`architecture/emotional-map-mood-normalization.md`](architecture/emotional-map-mood-normalization.md)                                                                                                     |
| Copy público — términos prohibidos y ratchet                      | [`product/emotional-map-copy-contract.md`](product/emotional-map-copy-contract.md)                                                                                                                         |
| Modelos con id, gates y estado (OU, EWS, TXT, CHK, ARC, NAR)      | [`research/emotional-map-model-registry.md`](research/emotional-map-model-registry.md)                                                                                                                     |
| Dinámica afectiva (OU, tendencia, intervalos)                     | [`research/emotional-map-affect-dynamics.md`](research/emotional-map-affect-dynamics.md)                                                                                                                   |
| Banco de personas — validación offline del scoring                | [`research/emotional-map-benchmark.md`](research/emotional-map-benchmark.md)                                                                                                                               |
| Resultados experimentales (E1–E6)                                 | [`research/paper-1-results.md`](research/paper-1-results.md) · [`research/paper-1-methods.md`](research/paper-1-methods.md) · [`research/paper-1-methods-outline.md`](research/paper-1-methods-outline.md) |
| Tendencias — PRD                                                  | [`PRD-tendencias-mapa-emocional.md`](PRD-tendencias-mapa-emocional.md)                                                                                                                                     |

Privacidad: el mapa nunca lee texto. La garantía vive en
[`adr/0007-e2e-encryption-diario-eco.md`](adr/0007-e2e-encryption-diario-eco.md);
los snapshots y el consentimiento del análisis local, en `emotional-map-v2.md`.

## Experiencia del libro

**[`product/book-experience-standard-v1.md`](product/book-experience-standard-v1.md)
es la autoridad canónica** de cómo se presenta cualquier libro en la
plataforma: los cinco modos (Libro · Audiolibro · Podcast · Video · Experiencia
guiada), el contenido primario de cada uno, los tres estados de superficie
(`HIDDEN` · `COMING_SOON` · `PUBLISHED`) y la regla de la que cuelga todo lo
demás — un modo sin activo reproducible no puede parecer publicado. Cuando otro
documento la contradiga en materia de presentación multimodal, manda esa.

### Book Experience V2 — visual design context

```
V1 = RUNTIME ACTUAL      (autoridad de producción)
V2 = DISEÑO FUTURO       (no implementado, no autorizado)
```

| Documento                                                                                    | Qué aporta                                                                 |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`design/book-experience-v2-design-brief.md`](design/book-experience-v2-design-brief.md)     | **Punto de entrada**: autoridad, precedencia, vocabulario, nueve pantallas |
| [`product/book-experience-v2-user-journeys.md`](product/book-experience-v2-user-journeys.md) | Perfiles, journey del capítulo, pantallas y estados                        |
| [`product/book-experience-v2-product-spec.md`](product/book-experience-v2-product-spec.md)   | Modelo, doce tipos de paso, Signal Model V1                                |
| [`product/book-experience-v2-design.md`](product/book-experience-v2-design.md)               | Discovery: qué existe hoy y qué supuestos romper                           |

Para describir la producción actual manda V1
([`product/book-experience-standard-v1.md`](product/book-experience-standard-v1.md)
y [`product/guided-reading-v1.md`](product/guided-reading-v1.md)); para diseñar
el objetivo futuro, V2. **V2 no ha reemplazado a la Guide V1.**

## Guided Reading (Modo Guía)

| Tema                                                                                         | Autoridad canónica                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Especificación completa: catálogo, escenas, anchor, recall, resonancia, estado en producción | [`product/guided-reading-v1.md`](product/guided-reading-v1.md)                                                                                              |
| Ciclo de vida, comandos e idempotencia                                                       | [`product/guide-v1-lifecycle.md`](product/guide-v1-lifecycle.md)                                                                                            |
| Superficie HTTP (5 comandos + availability)                                                  | [`product/guide-v1-http-surface.md`](product/guide-v1-http-surface.md)                                                                                      |
| Definición de la primera guía                                                                | [`product/guide-v1-first-definition.md`](product/guide-v1-first-definition.md)                                                                              |
| Experiencia web y recuperación tras recarga                                                  | [`product/guide-v1-web-experience.md`](product/guide-v1-web-experience.md)                                                                                  |
| Rollout piloto (off · pilot · on)                                                            | [`product/guide-v1-pilot-rollout.md`](product/guide-v1-pilot-rollout.md)                                                                                    |
| Ejercicios de la primera unidad                                                              | [`product/exercise-content-first-guide-unit.md`](product/exercise-content-first-guide-unit.md)                                                              |
| Procedencia de sesiones y pasos                                                              | [`adr/0019-guide-session-step-source.md`](adr/0019-guide-session-step-source.md)                                                                            |
| Despliegue y verificación en producción                                                      | [`operations/cc7-production-runbook.md`](operations/cc7-production-runbook.md) · [`operations/cc7-production-smoke.md`](operations/cc7-production-smoke.md) |
| Snapshot histórico de preparación (pre-deploy)                                               | [`operations/cc7-production-readiness.md`](operations/cc7-production-readiness.md)                                                                          |

## Audio, podcast y video del capítulo

| Tema                                                                                             | Autoridad canónica                                                           |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Catálogo de medios, proveedores, acceso firmado, disponibilidad, placeholders y estado editorial | [`product/chapter-01-media-package.md`](product/chapter-01-media-package.md) |
| Eventos de medios y su reflejo en Mi Evolución                                                   | [`architecture/learning-events.md`](architecture/learning-events.md)         |
| Superficie del lector y modos (Libro / Guía)                                                     | [`product/guided-reading-v1.md`](product/guided-reading-v1.md)               |
| Proveedor de video para terapia (decisión aparte)                                                | [`adr/0014-video-provider-daily-co.md`](adr/0014-video-provider-daily-co.md) |

## Libros y Content Core

| Tema                                                                                               | Autoridad canónica                                                                                 |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Modelo Work / Edition / Revision, identidad estable, ingest no destructivo, preservación de marcas | [`architecture/content-core.md`](architecture/content-core.md)                                     |
| Por qué la identidad se ancla al id legacy                                                         | [`adr/0016-content-core-work-edition-revision.md`](adr/0016-content-core-work-edition-revision.md) |
| **Libro nuevo: bootstrap, ediciones de prueba OCR, reemplazo por el máster, rollback, producción** | [`operations/book-test-edition-ingest.md`](operations/book-test-edition-ingest.md)                 |

[book-learning-activation.md](operations/book-learning-activation.md) — materializar Concept/ConceptLink/Exercise de un libro ya publicado.
| Slugs en URLs y almacenamiento en R2 | [`adr/0003-content-module-slug-urls-r2-storage.md`](adr/0003-content-module-slug-urls-r2-storage.md) |

## Actividades y aprendizaje

| Tema                                                         | Autoridad canónica                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Learning Events: qué se registra, idempotencia, Mi Evolución | [`architecture/learning-events.md`](architecture/learning-events.md)                               |
| Aprendizaje ≠ Mapa Emocional: qué nunca cruza                | [`product/learning-vs-emotional-map.md`](product/learning-vs-emotional-map.md)                     |
| El firewall que lo hace cumplir en código                    | [`adr/0017-learning-events-emotional-firewall.md`](adr/0017-learning-events-emotional-firewall.md) |
| Actividades de capítulo (contenido)                          | [`product/exercise-content-first-guide-unit.md`](product/exercise-content-first-guide-unit.md)     |

## Plataforma y decisiones transversales

| Tema                                      | Autoridad canónica                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Monorepo Turborepo                        | [`adr/0001-monorepo-turborepo.md`](adr/0001-monorepo-turborepo.md)                                                     |
| JWT + refresh tokens en BD                | [`adr/0002-jwt-refresh-tokens-en-bd.md`](adr/0002-jwt-refresh-tokens-en-bd.md)                                         |
| Stripe: billing y webhooks                | [`adr/0004-stripe-billing-webhooks.md`](adr/0004-stripe-billing-webhooks.md)                                           |
| Payment pool (strategy)                   | [`adr/0005-payment-pool-strategy-pattern.md`](adr/0005-payment-pool-strategy-pattern.md)                               |
| Prefijo global + versionado URI           | [`adr/0006-global-prefix-uri-versioning.md`](adr/0006-global-prefix-uri-versioning.md)                                 |
| Rate limiting + idempotencia + codegen    | [`adr/0008-rate-limiting-idempotency-openapi-codegen.md`](adr/0008-rate-limiting-idempotency-openapi-codegen.md)       |
| OAuth con ID token de Google              | [`adr/0009-oauth-with-google-id-token.md`](adr/0009-oauth-with-google-id-token.md)                                     |
| Worker BullMQ en servicio separado        | [`adr/0010-bullmq-worker-same-codebase-separate-service.md`](adr/0010-bullmq-worker-same-codebase-separate-service.md) |
| Multi-rol sin multi-tenant                | [`adr/0011-multi-rol-sin-multi-tenant.md`](adr/0011-multi-rol-sin-multi-tenant.md)                                     |
| Live Activities vía APNs                  | [`adr/0012-live-activities-via-apns-strategy.md`](adr/0012-live-activities-via-apns-strategy.md)                       |
| Invalidación de tokens por revisión       | [`adr/0015-auth-revision-token-invalidation.md`](adr/0015-auth-revision-token-invalidation.md)                         |
| Índice completo de decisiones             | [`adr/`](adr/) — 0001…0019                                                                                             |
| Cifrado E2E del Diario y Eco              | [`adr/0007-e2e-encryption-diario-eco.md`](adr/0007-e2e-encryption-diario-eco.md)                                       |
| OpenAPI como fuente de verdad del cliente | [`adr/0013-openapi-as-source-of-truth.md`](adr/0013-openapi-as-source-of-truth.md)                                     |
| Roadmap de infraestructura                | [`ROADMAP.md`](ROADMAP.md)                                                                                             |
| Checklist de congelamiento v1             | [`v1-freeze-ops-checklist.md`](v1-freeze-ops-checklist.md)                                                             |
| Cutover alpha v0.5                        | [`deploy/v0-5-alpha-cutover.md`](deploy/v0-5-alpha-cutover.md)                                                         |

---

## Convención

Un documento nuevo **solo** se crea cuando ninguna autoridad existente cubre el
tema; si la cubre parcialmente, se extiende la existente. Todo documento debe
quedar enlazado desde aquí o desde uno de los dos índices especializados
(`informes/INDEX.md`, `design/handoff/INDEX.md`) — un documento fuera de índice
es un documento que nadie encontrará cuando lo necesite.
