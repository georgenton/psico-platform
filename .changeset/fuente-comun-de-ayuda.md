---
"@psico/types": minor
---

El catálogo de ayuda pasa a ser la fuente común de la API, Eco, `/ayuda` y móvil, y
describe **únicamente lo acreditado** (comprobado el 2026-11-24).

Cada recurso lleva su evidencia junto al dato —organismo, fuentes primarias, fecha,
qué acredita y qué no— y un `estado`. Sólo lo `publicado` se sirve. Salen cuatro
números sin fuente o de otro organismo, y un rótulo que no existe; el registro vive en
`ayuda-retirados.ts`, que no va en el paquete.

Superficie nueva: `CrisisSource`, `CrisisDirectory`, `notes` y `source` en `CrisisLine`,
`directory` en `CrisisResponse`, `country` en el evento `crisis` de Eco,
`crisisDirectory`, `crisisEmergencyFor`, `crisisCheckedOn`, `recursosDeAyuda` y los
tipos `EstadoAyuda`, `FuenteAyuda`, `EvidenciaAyuda`, `RecursoAyuda` y
`CrisisEmergency`. Todo lo añadido al contrato es opcional, y `phone` sigue siendo
siempre un texto.

`CRISIS_FALLBACK` deja de exportarse: traía un teléfono. Lo sustituyen
`crisisDirectory()` y `getCrisisFor()`, que fuera del catálogo responde `lines: []`
con el directorio en su propio campo.
