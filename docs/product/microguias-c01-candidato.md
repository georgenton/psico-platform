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

### Y repetido en un entorno aislado, donde sí se puede — 2026-11-10

El mismo recorrido contra una base desechable, con el candidato de §2 aplicado:
**`APPLIED`, cinco `CREATED`, `pending: []`**, `verify-drafts` en 9/9 y
`preview-report` con cinco entradas. La evidencia de vista previa de cada una está
en §3.

**Una corrección que importa para el orden de las decisiones:** la vista previa de
un borrador **no** necesita que se publique nada. `getDraftPublicView` lee la fila y
la presenta por el mismo mapper que usa el lector, sin exigir `PUBLISHED` — lo que
exige es rol **ADMIN**, que es otra cosa. Así que revisar el contenido de las cinco
es posible **antes** de la decisión A, y lo que la decisión A autoriza es que una
persona real las abra. Donde este documento daba a entender lo contrario, estaba
equivocado.

---

## 2 · Por qué se rechaza, medido y no supuesto

No es un problema de las cinco. Es una propiedad del **catálogo embarcado**, y el
propio código la declara:

> «because the claims are resolved as a set, **one unresolvable shipped definition
> refuses binding writes in EVERY chapter**, not only its own. […] an incomplete
> catalog ingestion presents as a CMS-wide refusal.»

> **Corrección del 2026-11-10.** Lo que esta sección decía antes era falso en sus
> dos mitades, y conviene dejarlo escrito porque la explicación equivocada
> llevaba a una salida equivocada. Decía que faltaban «cuatro filas de contenido
> que nadie escribió» y que había «dos definiciones embarcadas bloqueantes», y de
> ahí concluía que sólo quedaban dos caminos: inventar esos textos o borrar las
> definiciones. Ninguna de las dos afirmaciones se sostiene, y por tanto esa
> disyuntiva tampoco. Lo que sigue es el diagnóstico verificado.

**Las cuatro fuentes existen.** Están declaradas en `exercise-ingestion-catalog.ts`,
y el par histórico al que pertenecen lleva `retired: true`. No es un olvido: es una
**exclusión deliberada**, porque su encabezado ya no está en el canónico vigente del
capítulo. `materializablePairs` los filtra a propósito:

```ts
return (EXERCISE_INGESTION_CATALOG[bookSlug] ?? []).filter((p) => !p.retired);
```

Un par retirado «sigue teniendo que responder por las filas y sesiones que ya
existen» —lo dice su propio comentario—, y por eso se conserva en el catálogo en vez
de borrarse. Lo que no puede es volver a materializarse sobre un manuscrito que ya
no lo contiene.

**Parejas no es el segundo bloqueo.** Ya está `ARCHIVED`, y el conjunto de reservas
se construye **sólo** con lo publicado:

```ts
definitions: PRODUCTION_EXPERIENCE_DEFINITIONS.filter(
  (d) => d.status === "PUBLISHED",
),
```

Así que no entra, y su propio comentario explica por qué quedó así: la oferta se
retiró sin romper las dos sesiones que viven en ese pin, una de ellas todavía
`ACTIVE`.

**La contradicción activa es UNA.** El piloto legado de EEC sigue `PUBLISHED`, entra
en el conjunto, su guía no ubica capítulo, y como las reservas se resuelven **como
conjunto**, eso rechaza las escrituras vinculantes de **todos** los capítulos. De ahí
que el rechazo lo informe MG01 sin que MG01 tenga nada malo: las cinco quedan
`SKIPPED · not created: the set was refused`. Las fuentes de las cinco **sí están**
(`VERIFY`, 15 de 15).

**La protección de identidad está haciendo su trabajo.** No se omite su error, no se
fabrican objetivos y no se sustituye la identidad estable por una coincidencia de
posición. Lo que hay que corregir es la contradicción, no la guarda que la detecta.

### El candidato, demostrado en aislamiento

El mecanismo ya existe y ya se usó: **archivar**. `byChapter` sólo indexa
`PUBLISHED`, mientras `byExactVersion` indexa **todo** estado — así que archivar
retira la oferta y conserva la resolución. Es literalmente el antecedente de
Parejas.

Probado sobre PostgreSQL `pgvector/pgvector:pg18` **fijada por digest** (18.6, la
misma que sirve staging), con migraciones, `eec-c01-e2e-seed` y una identidad
sintética ADMIN del propio entorno aislado — sin elevar ninguna cuenta real:

|                         | Sin el candidato                                 | Con el candidato                             |
| ----------------------- | ------------------------------------------------ | -------------------------------------------- |
| `create-drafts --apply` | **REFUSED** · `EXPERIENCE_CODE_OWNED_UNRESOLVED` | **APPLIED** · 5 `CREATED` · `pending: []`    |
| filas de Experience     | ninguna                                          | 5 `DRAFT`                                    |
| `verify-drafts`         | —                                                | ok · `draftCount 5` · **9/9** comprobaciones |
| `preview-report`        | lista vacía                                      | **5 entradas** · 7/8/8/7/7 escenas           |

Y la continuidad que la transición promete, medida y no supuesta:

```
estado declarado de la oferta legada : ARCHIVED
getExact(pin legado)                 : RESUELVE «El cuerpo, antes que la mente»
oferta del capítulo 1                : (vacía)
getExact(Parejas, ya ARCHIVED)       : RESUELVE (precedente intacto)
```

El candidato vive en [PR #839](https://github.com/georgenton/psico-platform/pull/839),
**en Draft y sin fusionar**: cambia la oferta de un capítulo publicado, y eso es una
decisión de ciclo de vida editorial.

---

## 3 · Las cinco, una por una

### EEC-C01-MG01 · eec-c1-teorias-como-lentes@1

**Qué contiene.** Concepto `eec-teorias-como-lentes`, práctica `eec-c1-practice-revisar-un-lente` (`belief_lens`) y recuerdo `eec-c1-recall-teorias-como-lentes`. Ancla en el manuscrito: «Distintas lentes para comprender una emoción» (`eec-c1-distintas-lentes`).

**Qué recorrido presenta.** 7 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·RECALL → 7·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-teorias-como-lentes@1` · manifiesto `e411b39f94c1…`. **En staging, sin fila**: el borrador no se pudo crear. **En el entorno aislado, creado y con vista previa** — ver la tabla al final de esta sección.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

### EEC-C01-MG02 · eec-c1-rostro-como-pista@1

**Qué contiene.** Concepto `eec-rostro-como-pista`, práctica `eec-c1-practice-una-sonrisa-varios-contextos` (`context_plausibility`) y recuerdo `eec-c1-recall-rostro-como-pista`. Ancla en el manuscrito: «Paul Ekman: el rostro como pista» (`eec-c1-rostro-como-pista`).

**Qué recorrido presenta.** 7 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·RECALL → 7·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-rostro-como-pista@1` · manifiesto `61ba03390225…`. **En staging, sin fila**: el borrador no se pudo crear. **En el entorno aislado, creado y con vista previa** — ver la tabla al final de esta sección.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

### EEC-C01-MG03 · eec-c1-alarma-antes-del-relato@1

**Qué contiene.** Concepto `eec-alarma-antes-del-relato`, práctica `eec-c1-practice-ordenar-alarma-y-relato` (`sequence_ordering`) y recuerdo `eec-c1-recall-alarma-antes-del-relato`. Ancla en el manuscrito: «Joseph LeDoux: la alarma antes del relato» (`eec-c1-alarma-antes-del-relato`).

**Qué recorrido presenta.** 7 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·RECALL → 7·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-alarma-antes-del-relato@1` · manifiesto `f2124adecf3b…`. **En staging, sin fila**: el borrador no se pudo crear. **En el entorno aislado, creado y con vista previa** — ver la tabla al final de esta sección.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

### EEC-C01-MG04 · eec-c1-emocion-informa-no-manda@1

**Qué contiene.** Concepto `eec-emocion-informa-no-manda`, práctica `eec-c1-practice-siento-interpreto-impulso-elijo` (`four_part_distinction`) y recuerdo `eec-c1-recall-emocion-informa-no-manda`. Ancla en el manuscrito: «Daniel Goleman: aprender a leer el mundo emocional» (`eec-c1-aprender-a-leer-el-mundo-emocional`).

**Qué recorrido presenta.** 8 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·REFLECTION → 7·RECALL → 8·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-emocion-informa-no-manda@1` · manifiesto `87df0d320258…`. **En staging, sin fila**: el borrador no se pudo crear. **En el entorno aislado, creado y con vista previa** — ver la tabla al final de esta sección.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

### EEC-C01-MG05 · eec-c1-construida-no-significa-falsa@1

**Qué contiene.** Concepto `eec-construida-no-significa-falsa`, práctica `eec-c1-practice-senales-y-contextos` (`signal_context_compare`) y recuerdo `eec-c1-recall-construida-no-significa-falsa`. Ancla en el manuscrito: «Lisa Feldman Barrett: la emoción como construcción» (`eec-c1-emocion-como-construccion`).

**Qué recorrido presenta.** 8 escenas — 1·INTRO → 2·PASSAGE → 3·CONCEPT → 4·EXAMPLE → 5·PRACTICE → 6·QUESTION → 7·RECALL → 8·SUMMARY.

**Estado de su preparación.** `status: DRAFT` · `publishAllowed: false` · guía fijada `eec-c1-construida-no-significa-falsa@1` · manifiesto `b8fb514e617b…`. **En staging, sin fila**: el borrador no se pudo crear. **En el entorno aislado, creado y con vista previa** — ver la tabla al final de esta sección.

**Qué se comprobó.** Esquema y suma de verificación del manifiesto; que su ancla existe en el capítulo canónico; que sus tres objetivos están materializados (`VERIFY`); y que su pin resuelve a la unidad del capítulo 1.

**Qué quedaría por ejecutar con una publicación aprobada.** Una sola orden, después de destrabar §2:

```bash
node dist/content-core/eec-c01-guides-main.js publish-guides --apply \
  --environment=staging --confirm-production-draft --confirm-publish
```

---

### Las cinco, en una tabla: material · borrador · vista previa

Las tres columnas que el encargo pide separadas. «Aislado» es la base desechable con
el candidato de §2 aplicado; «staging» es el despliegue real, donde el borrador sigue
sin poder crearse hasta que se decida.

| Microguía                                         | Material                           | Borrador (aislado) | Vista previa (aislado)                                   | Borrador (staging) |
| ------------------------------------------------- | ---------------------------------- | ------------------ | -------------------------------------------------------- | ------------------ |
| **MG01** `eec-c1-teorias-como-lentes@1`           | ✅ 3 objetivos `VERIFY` · ancla OK | ✅ `DRAFT` creado  | ✅ «Lo que una teoría alcanza a mirar» · **7 escenas**   | ❌ bloqueado       |
| **MG02** `eec-c1-rostro-como-pista@1`             | ✅ 3 objetivos `VERIFY` · ancla OK | ✅ `DRAFT` creado  | ✅ «Una sonrisa, varios contextos» · **7 escenas**       | ❌ bloqueado       |
| **MG03** `eec-c1-alarma-antes-del-relato@1`       | ✅ 3 objetivos `VERIFY` · ancla OK | ✅ `DRAFT` creado  | ✅ «Cuando reaccionas antes de entender» · **7 escenas** | ❌ bloqueado       |
| **MG04** `eec-c1-emocion-informa-no-manda@1`      | ✅ 3 objetivos `VERIFY` · ancla OK | ✅ `DRAFT` creado  | ✅ «Sentir, interpretar, querer, elegir» · **8 escenas** | ❌ bloqueado       |
| **MG05** `eec-c1-construida-no-significa-falsa@1` | ✅ 3 objetivos `VERIFY` · ancla OK | ✅ `DRAFT` creado  | ✅ «Construida no significa falsa» · **8 escenas**       | ❌ bloqueado       |

**Qué muestran de verdad.** No son cáscaras: cada escena llega con su copy completa
y sus claves ligadas. Una muestra literal, de MG03, por el mismo mapper que usaría
el lector:

```
── eec-c1-alarma-antes-del-relato  [DRAFT]
   «Cuando reaccionas antes de entender» · 7 escenas · startable=true
    1. INTRO      Cuando reaccionas antes de entender    "A veces el organismo se prepara an…"  {title,body,note,actionLabel}
    2. PASSAGE    Una alarma antes de la historia        "Lee el pasaje donde el capítulo pr…"  {title,body,actionLabel,anchorKey}
    3. CONCEPT    Protegerse no es lo mismo que sentir…  "Una señal repentina puede iniciar …"  {title,body,note,actionLabel,conceptKey}
    4. EXAMPLE    Lo que sabía Darwin y lo que hizo su…  "Ante una serpiente protegida por u…"  {title,body}
    5. PRACTICE   Ordena la alarma y el relato           "Imagina que lees tranquilamente y …"  {title,body,note,actionLabel,exerciseKey}
    6. RECALL     ¿Qué demuestra una reacción rápida?    "Recupera la idea central de esta m…"  {title,body,question,options}
    7. SUMMARY    Una alarma no cuenta toda la historia  "Antes de concluir «esto es miedo»,…"  {title,body,actionLabel}
```

Las otras cuatro rinden igual, con `QUESTION` (MG05) y `REFLECTION` (MG04) como
escenas propias. `verify-drafts` confirma además lo que **no** pasó:
`pilotUntouched: true`, `flagOff: true`, `noDraftClaimsPilotGuide: true` y
`noCorrectOptionInDefinitions: true` — es decir, ningún borrador reclama la guía del
piloto y ninguna respuesta correcta viaja en la definición.

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
_Quién puede HACERLAS_ — y conviene no confundir eso con quién puede verlas.

La puerta del rollout (`GuideRolloutGuard`) está montada en **cinco rutas, todas
`POST`, y todas órdenes de un recorrido**: abrir sesión, completar un paso,
responder el recuerdo, cancelar y cerrar. Las **lecturas** no la llevan: tanto
`GET /api/experiences/discovery/:libro/:capitulo` como
`GET /api/experiences/mine/:clave/:version` se guardan sólo con `JwtAuthGuard`, y
ni el controlador ni el servicio de descubrimiento mencionan el rollout. Lo
comprobé en el código, no lo supongo.

De modo que, con A ejecutada y B en HOLD, el comportamiento real es éste:

| Quién                                 | Qué puede                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| cualquier cuenta **con sesión**       | ve las cinco tarjetas en el capítulo, como `PLAYABLE`, **abre la portada y lee las escenas** — el pasaje, los conceptos |
| sólo las cuentas **del padrón** (QA)  | inicia y avanza el recorrido                                                                                            |
| una cuenta con sesión **fuera** de él | recibe `503 GUIDE_UNAVAILABLE` al iniciar, después de haber visto y abierto                                             |

**Por eso se retira la promesa de que «las ve sólo QA»**, que una versión anterior
de este apartado afirmaba y que la propia tabla de abajo ya contradecía. Era falsa:
publicar **expone el contenido a toda cuenta registrada**, y lo único que B retiene
es la ejecución. La decisión A no es «registrar algo que nadie verá hasta B»: es
poner el texto de las cinco microguías delante de cualquiera que tenga cuenta.

Es una diferencia que pesa sobre A, no sobre B, y por eso va aquí. Lo que **no** se
hace es cambiar las reglas de acceso para que la frase vuelva a ser cierta: la
asimetría entre leer y ejecutar es deliberada —una tarjeta que no se puede ni mirar
no se puede revisar— y cerrarla sería un cambio de producto que nadie ha pedido.

**Qué sería legible por los endpoints autenticados que ya existen**, una vez
publicadas y con una cuenta ADMIN:

| Endpoint                                                     | Qué devolvería                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /api/pulso/experiences?bookSlug=…&chapterOrder=1`       | las cinco publicadas, más la legada, con su estado                                                                      |
| `GET /api/pulso/experiences/drafts/:id`                      | la definición guardada, para editarla                                                                                   |
| `GET /api/pulso/experiences/drafts/:id/preview`              | **la vista que recibiría un lector**, por el mismo mapper que usa discovery — y **no espera a A**: ver la nota de abajo |
| `GET /api/experiences/discovery/emociones-en-construccion/1` | pasaría de devolver **una** experiencia a devolver **seis**                                                             |
| `GET /api/experiences/mine/<clave>/1`                        | dejaría de dar 404 para quien tenga sesión                                                                              |

**La vista previa NO espera a la publicación, y esto importa para decidir A.**
`getDraftPublicView` comprueba que la fila exista y nada más: **no exige
`PUBLISHED`**. Lo que exige es la ruta por la que se entra —
`@Controller("pulso/experiences")` con `JwtAuthGuard + RolesGuard` y
`@RequiredRole("ADMIN")`—, así que un borrador se revisa **antes** de publicarse,
por el mismo mapper que después usará el lector. La revisión editorial del
contenido es por tanto un paso **anterior** a A, no una consecuencia suya.

Una formulación anterior decía aquí «la evidencia de preview que hoy no existe». Es
falso en dos sentidos distintos, y conviene separarlos:

- **La capacidad existe** y está demostrada: en el entorno aislado,
  `preview-report` devolvió **cinco entradas** con su copia completa. Que ese
  entorno se haya destruido después no borra la evidencia ni la capacidad.
- **Lo que no existe es el dato en staging.** `ChapterExperienceVersion` tiene
  **cero filas** ahí, comprobado en sólo lectura. Así que hoy no hay nada que
  previsualizar en staging — no porque el mecanismo falte, sino porque los cinco
  borradores aún no se han creado, y crearlos es el paso que el candidato
  desbloquea.

**La prueba negativa se conserva para el momento de publicar.** Cuando se ejecute
una publicación aprobada, el recorrido tiene que volver a comprobar que una cuenta
**fuera de QA** recibe `503 GUIDE_UNAVAILABLE` **al iniciar** — que es lo que B
retiene. No puede comprobar que esa cuenta no vea las tarjetas, porque sí las ve:
eso es lo que la tabla de arriba corrige.

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

> **Corrección del 2026-11-10, precisada el 2026-11-11.** Esta sección ofrecía
> «ingerir cuatro filas que no existen» o «retirar las definiciones que no ubican
> capítulo», y las presentaba como las únicas dos salidas. La primera partía de un
> hecho falso y la segunda describía como borrado algo que el repositorio ya sabe
> hacer sin borrar nada. **Hay una sola salida, y el mecanismo ya está en uso.**
>
> La primera corrección, además, se pasó de ancha: decía «las fuentes **sí** existen,
> retiradas a propósito», y eso mezcla dos cosas que conviene separar, porque de la
> distinción depende que nadie reingeste nada.
>
> - **Las fuentes de las cinco microguías existen y NO están retiradas.** Son diez
>   entradas en `exercise-ingestion-catalog.ts` —una práctica y un recuerdo activo
>   por microguía—, declaradas bajo la decisión autoral del 2026-09-03, con cada
>   `sourceHeading` literal del manuscrito canónico.
> - **Lo retirado es otra cosa: el par del piloto V1**, y es la **única** entrada con
>   `retired: true` en todo el catálogo. Se retiró el 2026-09-02, cuando el
>   manuscrito canónico v1.0 dejó sin el encabezado al que su práctica anclaba. Las
>   filas donde ya se había ingerido siguen resolviendo, porque hay pasos de guía y
>   sesiones pasadas que las referencian.
> - **Y los ejercicios de Parejas no están retirados** —ninguna entrada de sus
>   catálogos lo está—. Lo archivado ahí es su **Experience**,
>   `pqp-c1-contacto-sostenido`, que es el precedente que este candidato sigue. Un
>   ejercicio retirado y una Experience archivada son dos mecanismos distintos sobre
>   dos objetos distintos; tratarlos como uno llevaría a retirar lo que hay que
>   archivar, o a reingerir lo que se retiró a propósito.
>
> Nada de esto se reingesta y ninguna definición histórica se borra.

**Archivar la oferta legada de EEC.** Ni se inventa contenido, ni se borra ninguna
definición, ni se reingesta el par retirado. `status: "PUBLISHED"` → `"ARCHIVED"`,
que es exactamente lo que se hizo con el piloto de Parejas y por la misma razón.

| Qué conserva                                            | Qué cambia                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| la definición, sus claves y sus versiones               | el capítulo 1 de EEC deja de ofrecer su única tarjeta          |
| su guía registrada                                      | y no ofrece ninguna hasta que se publiquen los cinco (A de §4) |
| su respuesta en `PRODUCTION_LEGACY_GUIDE_PINS`          |                                                                |
| `getExact` por pin exacto → las sesiones fijadas siguen |                                                                |
| su tarjeta sigue `PLAYABLE` para quien ya la tiene      |                                                                |

**Lo que se retira ya respondía 410.** Su pin es `RETIRED_FOR_NEW_STARTS` y la vista
pública ya devolvía `startable: false` — medido sobre `eec-c1-cuerpo-antes-que-mente@1`,
y está escrito en `experience-public-view.ts`. Es decir: la tarjeta que desaparece es
un control que hoy no abre nada para nadie nuevo. **La lectura no se toca.**

**El intervalo, sin adornos.** Desplegar el código y publicar los borradores son
**dos actos**, y entre ellos el capítulo no ofrece experiencia alguna. No es una
operación indivisible y no se presenta como tal.

> **Retirado el 2026-11-11.** Aquí se ofrecía «publicar los cinco **primero** y
> archivar después» como una forma de evitar ese intervalo, y se presentaba como
> ejecutable. **No lo es, y no por un detalle de orden.** Con el runtime de hoy:
>
> - **`create-drafts` está bloqueado.** Es la propia razón de este candidato: una
>   definición embarcada que no ubica capítulo rechaza las escrituras de todos los
>   capítulos. Sin borradores no hay nada que publicar, así que el primer paso del
>   orden inverso no existe.
> - **Y publicar comprueba lo mismo.** El `publish` del administrador revalida la
>   reserva en el momento de publicar —su propio comentario lo dice: «The
>   reservation is revalidated here, not inherited from create time»— y esa
>   revalidación entra por el mismo resolutor de reclamaciones embarcadas. Un
>   borrador que hubiera existido de antes se estrellaría contra la misma puerta.
>
> **No basta invertir dos comandos.** Evitar el intervalo exigiría otra cosa —por
> ejemplo, que el candidato escribiera desde una CLI mientras una API más antigua
> sigue sirviendo—, y eso **no está ensayado**, así que no forma parte de la
> solución por defecto ni se propone como tal. Convertir «evitar el intervalo» en
> otro proyecto de ingeniería costaría más que el intervalo.

**Qué pasa durante el intervalo, con precisión.** El capítulo deja de ofrecer la
tarjeta legada y todavía no ofrece las cinco. Y conviene medir qué se pierde: la
tarjeta que desaparece **ya respondía 410 a cualquier inicio nuevo** y su vista
pública ya devolvía `startable: false`, así que lo que el capítulo deja de mostrar
es un control que no abría nada para nadie nuevo. **La lectura del libro no se
toca** —el intervalo es sobre el modo guiado, no sobre el capítulo— y las
definiciones históricas siguen resolviendo por pin exacto, de modo que las sesiones
ya fijadas no se enteran.

**Cómo se recupera, y qué NO recupera.** Volver `status` a `"PUBLISHED"` y
desplegar. No hay dato que migrar ni fila que restaurar, porque el candidato no
escribe ninguna.

Pero conviene separar dos recuperaciones que no son la misma:

- **Deshacer el cambio de catálogo** es eso: un valor y un despliegue. Reversible
  entero.
- **Deshacer lo que se haya escrito después, no.** Si entre el archivado y la
  reversión alguien creó los cinco borradores, o los sellló, o los publicó, esas
  filas **siguen ahí**: republicar la oferta legada no las retira. Volverían a ser
  visibles junto con la legada, que es un estado que nadie ha decidido. Si hay que
  deshacer también eso, se deshace **explícitamente** —archivando esas filas por el
  mismo mecanismo— y como un acto propio.

**Quién decide:** el propietario. Es un cambio de oferta de un capítulo publicado.
Está preparado y probado en
[PR #839](https://github.com/georgenton/psico-platform/pull/839), en Draft.

**Y hay una tercera cosa que falta, menor pero real:** staging **no tiene ninguna
cuenta ADMIN** (12 cuentas, todas `USER`). El CLI resuelve el operador del primer
ADMIN; sin ninguno, responde `EEC_C01_OPERATOR_NOT_RESOLVED`. En esta ejecución se
salvó declarando `EEC_C01_OPERATOR_USER_ID` con una cuenta sintética existente —sin
ascender a nadie— pero los endpoints de Pulso de §4 **sí** exigen rol ADMIN, así que
revisar los borradores por esa vía necesita una cuenta con ese rol.

---

## 7 · La secuencia, en el orden en que de verdad se puede ejecutar

Siete pasos. Los impares son decisiones; los pares, ejecución. **Ninguno se puede
adelantar**, y por qué no se puede está medido arriba, no supuesto.

| #     | Paso                                            | Quién              | Estado hoy                                           |
| ----- | ----------------------------------------------- | ------------------ | ---------------------------------------------------- |
| **1** | candidato técnicamente terminado                | yo                 | ✅ **hecho** — #839, CI cerrada, 1431 pasadas        |
| **2** | **aprobación del archivado**                    | **el propietario** | ⬜ pendiente — es un cambio de oferta de un capítulo |
| **3** | integrar y desplegar el candidato aprobado      | yo                 | ⬜ espera 2                                          |
| **4** | crear las cinco Experiences como **DRAFT**      | yo                 | ⬜ espera 3 — `create-drafts --apply`                |
| **5** | **revisión editorial del contenido**            | **el propietario** | ⬜ pendiente — y no espera a A: ver §4               |
| **6** | incorporar una aprobación **A** válida al sello | ambos              | ⬜ espera 5 — `approval-request`, luego `reseal`     |
| **7** | publicar                                        | yo                 | ⬜ espera 6 — el mecanismo del ADR 0027              |

**B queda fuera de esta columna a propósito.** Abrir el modo guiado a personas
reales es una decisión aparte y **posterior**, y con el alcance que §4 corrige:
publicar ya expone el contenido a toda cuenta con sesión; B decide quién puede
hacerlo.

### Los pasos 4, 6 y 7 con sus órdenes reales

El CLI es
`node dist/content-core/eec-c01-guides-main.js`, y acepta
`validate · plan · apply-targets · create-drafts · approval-request · reseal · publish-test-suite · verify-drafts · preview-report`.
**La simulación es el valor por defecto en todos**; escribir exige `--apply`, y
sobre una caja desplegada además `--environment=production --confirm-production-draft`,
precisamente para que nada escriba en producción por haber corrido un guion en la
terminal equivocada.

**Paso 4 — crear.** `create-drafts --apply`. Deja cinco filas en `DRAFT`, cada una
con su pin explícito. Luego `verify-drafts` dice qué existe **y qué no debe
existir** (que ningún borrador reclame la guía del piloto, que ninguna respuesta
correcta viaje en la definición), y `preview-report` emite la vista que recibiría un
lector, como evidencia.

**Paso 6 — aprobar, y aquí está la trampa que conviene no pisar.** Se pide el acta
con `approval-request`, que **no escribe nada** —ni en disco ni en la base— y por eso
no cobra peaje de confirmación: imprime lo que hay que firmar. Y después:

> **Repetir `create-drafts` NO vuelve a sellar.** Es idempotente **por
> inspección**: una fila `DRAFT` que coincide es un `NOOP` y **nunca reescribe su
> procedencia**. Eso está bien para crear y es insuficiente para aprobar, porque
> pasar de «borrador sin aprobar» a «borrador aprobado» no crea nada: cambia la
> autorización de algo que ya está ahí. Por eso **existe `reseal`**, que es un
> comando propio y explícito y no un efecto secundario de otro.

`reseal` tiene tres negativas, las tres deliberadas: **no aprueba** —sin acta válida
se niega y dice por qué—, **no publica** —deja la fila en `DRAFT`— y **no sella
contenido que no sea el aprobado**: si la fila guarda algo distinto de lo que el acta
firmó, se niega, porque reaprovechar una aprobación después de editar es exactamente
lo que no puede pasar. Sellar dos veces escribe el mismo sello.

**Paso 7 — publicar**, por el mecanismo que ya existe, que vuelve a verificar la
firma por su cuenta.

### Una confirmación de comando no es una aprobación autoral

Conviene decirlo porque las dos cosas se escriben en la misma línea de terminal y no
se parecen en nada.

`--confirm-publish` y `--confirm-production-draft` son **cerrojos de seguridad**:
evitan que un comando escriba donde no se pretendía. Los teclea quien ejecuta, y no
afirman nada sobre el contenido.

La **aprobación** es un acta firmada que se verifica contra un llavero, y el código
la rechaza por seis motivos distintos: malformada, clave desconocida, **firma
inválida**, **identidad que no corresponde**, **revisión que no corresponde** y
**contenido que no corresponde**. Está atada a quién aprueba, a qué revisión y a qué
texto exacto. Ninguna confirmación de comando produce una, y ninguna la sustituye.

Lo digo en primera persona porque es el límite de mi trabajo: puedo dejar los siete
pasos listos, ejecutar los pares y acreditar cada uno con su evidencia. **Los impares
no son míos**, y un `--apply` mío no los convierte en hechos.
