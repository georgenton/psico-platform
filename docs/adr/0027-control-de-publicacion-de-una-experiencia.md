# ADR 0027 — Qué autoriza publicar una experiencia

- **Estado:** propuesto. No aplicado al runtime.
- **Fecha:** 2026-10-21
- **Alcance:** `apps/api/src/experience/experience-admin.controller.ts`,
  `experience-admin.service.ts`, `apps/api/src/content-core/eec-c01-guides-cli.ts`,
  `artifacts/eec/**/guides/*.manifest.json`.
- **Caso mínimo:** `experience-admin.service.spec.ts`, bloque «publicar y la
  aprobación editorial».

## Lo que parece haber

Cada manifiesto de microguía declara su procedencia editorial:

```json
"canonicalVersion": "EEC_C01_v1.0_TEXT_LOCKED_2026-08-20",
"canonicalSha256":  "e10f42ce…c023018",
"status":           "DRAFT",
"publishAllowed":   false,
"approvalReferences": [ … ]
```

Leído de corrido parece un circuito de aprobación: un documento firmado que
dice de qué manuscrito sale el texto, quién lo aprobó y que **todavía no** se
puede publicar.

## Lo que hay, medido

Esos campos los lee **una** herramienta: el CLI que **crea** los borradores.
`eec-c01-guides-cli.ts:201` rechaza un manifiesto cuyo `publishAllowed` no sea
`false`, igual que rechaza un `canonicalSha256` que no corresponda al capítulo
o un `status` distinto de `DRAFT`. Es una precondición de la creación.

Después, nadie vuelve a mirarlos:

- No llegan a la base. La fila real de MG03 en una base desechable lleva nueve
  claves en `definitionJson` —`bookSlug`, `chapterOrder`, `experienceKey`,
  `experienceVersion`, `guidePin`, `scenes`, `status`, `summary`, `title`— y
  ninguna columna de `ChapterExperienceVersion` guarda procedencia: identidad,
  colocación, estado, definición, autor y marcas de tiempo.
- `POST /api/experiences/admin/drafts/:id/publish` valida que la fila exista,
  que siga siendo `DRAFT`, que la definición resuelva contra la guía exacta del
  registro y que la reserva de linaje siga en pie. Nada editorial.
- El único filtro de la ruta es `@UseGuards(RolesGuard)` +
  `@RequiredRole("ADMIN")` a nivel de clase: una respuesta a «quién entra», no
  a «qué está aprobado». El mismo permiso que lista borradores publica el que
  quiera.

**Conclusión:** no existe un control efectivo. Un ADMIN que llegue al endpoint
publica MG03 hoy, y el `publishAllowed: false` de su manifiesto no participa.
Que no haya ocurrido se debe a que nadie ha pulsado el botón, no a que algo lo
impida.

## Por qué no es un `if`

El dato no está. Un control en el endpoint tendría que empezar por **conservar
la procedencia en la escritura del borrador**, y eso es un cambio de contrato:
`validateExperienceDefinition` valida un esquema cerrado, así que la
procedencia no cabe dentro de `definitionJson` sin tocarlo.

## Propuesta mínima

Lo más pequeño que convierte una decisión que ya existe en una barrera real,
sin modelar aprobaciones:

1. **Sellar el borrador al crearlo.** Columna nueva y anulable en
   `ChapterExperienceVersion` —`editorialOrigin Json?`— con lo que el CLI ya
   tiene en la mano: `manifestId`, `canonicalVersion`, `canonicalSha256`,
   `publishAllowed` y `approvalReferences`. Migración aditiva; ninguna fila
   existente cambia.
2. **Consultarla al publicar.** Si el sello existe y dice
   `publishAllowed: false`, `publish` responde **409 `EXPERIENCE_NOT_APPROVED`**
   con un mensaje que nombre el manifiesto. Publicar MG03 pasa a exigir que
   alguien edite el manifiesto y vuelva a correr la herramienta — que es
   exactamente donde vive la decisión editorial.
3. **No inventar una respuesta para lo que no tiene sello.** Una fila sin
   `editorialOrigin` es una fila anterior a este control o creada a mano; el
   gate la deja pasar y lo dice en el log. Negarlas en bloque convertiría una
   mejora en una interrupción, y afirmar que están aprobadas sería peor.

Coste honesto: el punto 3 deja una puerta abierta mientras existan filas sin
sello. Se cierra cuando todas lo tengan, y ese día el valor por defecto puede
invertirse — pero es otra decisión, con su propio recuento de filas.

## Lo que NO se propone

- Un flujo de aprobación en la interfaz. No hay quien lo use todavía: la
  aprobación vive en el manifiesto y en el expediente, no en la aplicación.
- Validar el `canonicalSha256` contra el manuscrito en tiempo de publicación.
  El CLI ya lo hace cuando crea, que es cuando el texto entra; repetirlo al
  publicar exigiría tener el manuscrito en el servidor.
- Quitar o ablandar el rol ADMIN. Es necesario y no es suficiente; esto añade,
  no sustituye.

## Invariantes que cualquier implementación debe conservar

- MG03 sigue en `DRAFT`, con sus siete escenas, su SHA, sus claves y su
  procedencia intactos.
- Ninguna publicación real ocurre por efecto de este ADR.
- Un borrador sin sello no se vuelve impublicable de golpe.
- El rol ADMIN sigue siendo necesario.

## Cómo se comprueba

El bloque «publicar y la aprobación editorial» de
`experience-admin.service.spec.ts` fija hoy tres hechos sin cambiar
comportamiento: que un borrador válido se publica sin consultar aprobación
alguna, que la definición almacenada no lleva procedencia que consultar, y que
el único filtro declarado de la ruta es el rol. Una implementación futura
tendrá que venir a responder a ese archivo: cuando el control exista, esas tres
pruebas fallarán, y ese fallo es la señal.
