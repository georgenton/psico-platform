# Las cinco microguías de C01 — candidato para revisar

> **Qué es esto.** Lo que hay preparado de las cinco microguías del capítulo 1
> de _Emociones en construcción_, con lo que se comprobó, lo que falta y el paso
> exacto que quedaría por ejecutar si se aprobara publicarlas. **Nada está
> publicado y nada se abrió a nadie.** Las decisiones A y B siguen siendo del
> propietario.

**Corte:** 2026-11-09 · manifiestos canónicos en `artifacts/eec/C01/v1.0/feelverse/guides/`
· SHA del capítulo canónico `e10f42ce…`, intacto.

---

## 1 · Qué se ejecutó, y qué dijo

Con las herramientas del propio repositorio (`eec-c01-guides-main.js`), contra la
base de **staging**, en este orden:

| Orden                   | Resultado                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validate`              | ✅ **5 manifiestos**, SHA canónico coincide, **0 incidencias**                                                                                                     |
| `plan`                  | ✅ resuelve edición, revisión y unidad · **15 objetivos en `VERIFY`** (ya materializados, nada que crear) · **5 borradores en `CREATE`** · flag de la suite activo |
| `create-drafts --apply` | ❌ **RECHAZADO en bloque** con `EXPERIENCE_CODE_OWNED_UNRESOLVED` · **0 filas escritas**                                                                           |
| `verify-drafts`         | `draftCount: 0` · `pilotUntouched: true` · `noDraftClaimsPilotGuide: true`                                                                                         |
| `preview-report`        | `previews: []` — **no hay evidencia de preview, y no se fabrica**                                                                                                  |

**El material está completo.** Lo que no se puede todavía es materializarlo.

---

## 2 · Por qué se rechaza, medido y no supuesto

No es un problema de las cinco. Es una propiedad del **catálogo embarcado**, y el
propio código la declara:

> «because the claims are resolved as a set, **one unresolvable shipped definition
> refuses binding writes in EVERY chapter**, not only its own. […] an incomplete
> catalog ingestion presents as a CMS-wide refusal.»

Hay **dos** definiciones embarcadas, y cada una fija una guía cuyos tres pasos
nombran un concepto, una práctica y un recuerdo. Comprobado en sólo lectura sobre
staging, fila a fila:

| Definición embarcada                                 | concepto  | práctica     | recuerdo     | ¿ubica capítulo? |
| ---------------------------------------------------- | --------- | ------------ | ------------ | ---------------- |
| `eec-c1-cuerpo-antes-que-mente@1` (el piloto legado) | ✅ existe | ❌ **falta** | ❌ **falta** | **no**           |
| `pqp-c1-contacto-sostenido@1`                        | ❌ falta  | ❌ **falta** | ❌ **falta** | **no**           |

`resolveUnitForGuidePin` devuelve `null` para las dos, y `codeOwnedClaimsByUnit`
lanza en la primera. De ahí que el rechazo lo informe MG01 sin que MG01 tenga
nada malo: las cinco quedan `SKIPPED · not created: the set was refused`.

**La pieza que falta, nombrada:** cuatro filas de `Exercise` —dos prácticas y dos
recuerdos— que esas dos guías embarcadas nombran y que nunca se ingirieron en
esta base. Las de las cinco microguías **sí están** (`VERIFY`, 15 de 15).

**No se inventan.** Crear esas cuatro filas sería escribir contenido editorial que
nadie redactó, para destrabar un contador. Las dos salidas honestas están en §6.

---

## 3 · Las cinco, una por una

### EEC-C01-MG01 · eec-c1-teorias-como-lentes@1

**Qué contiene.** Concepto `eec-teorias-como-lentes`, práctica `eec-c1-practice-revisar-un-lente` (`belief_lens`) y recuerdo `eec-c1-recall-teorias-como-lentes`. Ancla en el manuscrito: «Distintas lentes para comprender una emoción» (`eec-c1-distintas-lentes`).

**Qué recorrido presenta.** 7 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·RECALL → 7·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-teorias-como-lentes@1` · manifiesto `e411b39f94c1…`. **Sin fila en la base**: el borrador no se pudo crear.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

### EEC-C01-MG02 · eec-c1-rostro-como-pista@1

**Qué contiene.** Concepto `eec-rostro-como-pista`, práctica `eec-c1-practice-una-sonrisa-varios-contextos` (`context_plausibility`) y recuerdo `eec-c1-recall-rostro-como-pista`. Ancla en el manuscrito: «Paul Ekman: el rostro como pista» (`eec-c1-rostro-como-pista`).

**Qué recorrido presenta.** 7 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·RECALL → 7·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-rostro-como-pista@1` · manifiesto `61ba03390225…`. **Sin fila en la base**: el borrador no se pudo crear.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

### EEC-C01-MG03 · eec-c1-alarma-antes-del-relato@1

**Qué contiene.** Concepto `eec-alarma-antes-del-relato`, práctica `eec-c1-practice-ordenar-alarma-y-relato` (`sequence_ordering`) y recuerdo `eec-c1-recall-alarma-antes-del-relato`. Ancla en el manuscrito: «Joseph LeDoux: la alarma antes del relato» (`eec-c1-alarma-antes-del-relato`).

**Qué recorrido presenta.** 7 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·RECALL → 7·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-alarma-antes-del-relato@1` · manifiesto `f2124adecf3b…`. **Sin fila en la base**: el borrador no se pudo crear.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

### EEC-C01-MG04 · eec-c1-emocion-informa-no-manda@1

**Qué contiene.** Concepto `eec-emocion-informa-no-manda`, práctica `eec-c1-practice-siento-interpreto-impulso-elijo` (`four_part_distinction`) y recuerdo `eec-c1-recall-emocion-informa-no-manda`. Ancla en el manuscrito: «Daniel Goleman: aprender a leer el mundo emocional» (`eec-c1-aprender-a-leer-el-mundo-emocional`).

**Qué recorrido presenta.** 8 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·REFLECTION → 7·RECALL → 8·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-emocion-informa-no-manda@1` · manifiesto `87df0d320258…`. **Sin fila en la base**: el borrador no se pudo crear.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

### EEC-C01-MG05 · eec-c1-construida-no-significa-falsa@1

**Qué contiene.** Concepto `eec-construida-no-significa-falsa`, práctica `eec-c1-practice-senales-y-contextos` (`signal_context_compare`) y recuerdo `eec-c1-recall-construida-no-significa-falsa`. Ancla en el manuscrito: «Lisa Feldman Barrett: la emoción como construcción» (`eec-c1-emocion-como-construccion`).

**Qué recorrido presenta.** 8 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·QUESTION → 7·RECALL → 8·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-construida-no-significa-falsa@1` · manifiesto `b8fb514e617b…`. **Sin fila en la base**: el borrador no se pudo crear.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

---

## 4 · A y B no son lo mismo, y A no es un registro administrativo

Esto corrige una formulación anterior del paquete editorial, que presentaba A como
si sólo afectara a un apunte interno.

**Qué permite A (publicar las cinco Experiences).** La **reproducción**. Hoy las
cinco se recorren por HTTP —31/31, por la API de órdenes de Guide, que resuelve del
catálogo en código— pero **no se pueden abrir en el lector**: el panel necesita una
definición de Experience y no existe ninguna, así que se niega. A es lo que hace que
una persona pueda **ver y hacer** el recorrido en pantalla. No es papeleo.

**Qué sigue restringido por B (el flag `EEC_C01_GUIDED_SUITE_V1` y el rollout).**
_Quién_ las ve. Publicar no abre audiencia: con A ejecutada y B en HOLD, las cinco
existen, son reproducibles y las ve **sólo QA**. Abrirlas a personas reales es la
decisión B, y es posterior.

**Qué sería legible por los endpoints autenticados que ya existen**, una vez
publicadas y con una cuenta ADMIN:

| Endpoint                                                     | Qué devolvería                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /api/pulso/experiences?bookSlug=…&chapterOrder=1`       | las cinco publicadas, más la legada, con su estado                                                                      |
| `GET /api/pulso/experiences/drafts/:id`                      | la definición guardada, para editarla                                                                                   |
| `GET /api/pulso/experiences/drafts/:id/preview`              | **la vista que recibiría un lector**, por el mismo mapper que usa discovery — la evidencia de preview que hoy no existe |
| `GET /api/experiences/discovery/emociones-en-construccion/1` | pasaría de devolver **una** experiencia a devolver **seis**                                                             |
| `GET /api/experiences/mine/<clave>/1`                        | dejaría de dar 404 para quien tenga sesión                                                                              |

**La prueba negativa se conserva para ese momento.** Cuando se ejecute una
publicación aprobada, el recorrido tiene que volver a comprobar que una cuenta
**fuera de QA** recibe `503 GUIDE_UNAVAILABLE` — publicar no puede abrir audiencia
por la puerta de atrás, y esa comprobación es la que lo acredita.

---

## 5 · Lo que esto NO hace

- **No publica nada.** `publishAllowed: false` en los cinco manifiestos, y la
  barrera del [ADR 0027](../adr/0027-control-de-publicacion-de-una-experiencia.md)
  responde `409 EXPERIENCE_NOT_APPROVED` a cualquier intento.
- **No amplía audiencia.** El rollout del guía sigue en `pilot` con una sola cuenta
  sintética, y el control negativo lo acredita.
- **No inventa escenas ni contenido.** Las escenas vienen de los manifiestos
  canónicos; las que no existen, no se escriben.
- **No fabrica una aprobación.** Los manifiestos citan «Decisión autoral 2026-09-03:
  **implementar** las cinco microguías de EEC-C01» — implementar, que no es publicar.
- **No tocó el piloto**: `pilotUntouched: true`, `pilotRows: []`.

---

## 6 · Lo que hace falta para destrabar, y quién puede decidirlo

Dos salidas, y conviene no confundirlas con una decisión editorial sobre las cinco:
el bloqueo es de **integridad del catálogo**, y no es sobre ellas.

| Salida                                                                         | Qué implica                                                                                                                                                                                                         | Quién                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **A · Ingerir las cuatro filas que faltan** para las dos guías embarcadas      | es contenido editorial que hoy no existe en ninguna fuente de este repositorio: habría que escribirlo                                                                                                               | **propietario** (editorial)                                       |
| **B · Retirar del catálogo embarcado las definiciones que no ubican capítulo** | es un cambio de código con consecuencia de producto: el piloto legado es **la única** experiencia que hoy sirve discovery para C01, así que retirarlo deja el capítulo sin ninguna hasta que se publiquen las cinco | **propietario** (producto), ejecutable por mí en cuanto se decida |

**Recomendación: B, y en el mismo acto que A de §4.** El piloto legado ya está
retirado para inicios nuevos, su guía no ubica capítulo, y su única función viva es
ocupar el sitio que las cinco deberían ocupar. Retirarlo _antes_ de publicar dejaría
el capítulo sin experiencia; retirarlo _a la vez_ lo sustituye. Lo que no conviene es
dejarlo como está: es lo que hoy impide crear los cinco borradores.

**Y hay una tercera cosa que falta, menor pero real:** staging **no tiene ninguna
cuenta ADMIN** (12 cuentas, todas `USER`). El CLI resuelve el operador del primer
ADMIN; sin ninguno, responde `EEC_C01_OPERATOR_NOT_RESOLVED`. En esta ejecución se
salvó declarando `EEC_C01_OPERATOR_USER_ID` con una cuenta sintética existente —sin
ascender a nadie— pero los endpoints de Pulso de §4 **sí** exigen rol ADMIN, así que
revisar los borradores por esa vía necesita una cuenta con ese rol.
