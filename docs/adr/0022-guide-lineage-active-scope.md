# ADR 0022 — Experiencias independientes: el lineage de Guide como alcance de la sesión ACTIVE

```
STATUS=PROPOSED
SUPERSEDES=ADR 0019 §6 (autocancel) · §6 (invariante una-ACTIVE) · §7 (locks) · §7 (matriz de concurrencia)
SUPERSEDES_SCOPE=partial
ISSUE=639

GUIDE_LINEAGE_IDENTITY=guideKey
ACTIVE_UNIQUENESS_SCOPE=(userId, guideKey) WHERE status = 'ACTIVE'
SAME_GUIDE_DIFFERENT_VERSION_MULTI_ACTIVE=false
CROSS_GUIDE_MULTI_ACTIVE=true
NEW_PRODUCTION_GUIDE_AUTHORIZED=false
IMPLEMENTATION_AUTHORIZED=false
```

Sucede **parcialmente** a [ADR 0019](./0019-guide-session-step-source.md). Reemplaza
exclusivamente sus decisiones de **concurrencia y selección de sesión**. Todo lo
demás de 0019 sigue siendo autoridad canónica y **no** se pone en duda aquí —
ver §9.

El merge de este ADR constituye **aprobación de diseño**. No autoriza ningún PR
de implementación: cada fase posterior requiere su propia instrucción.

Relacionados: ADR 0016 (Content Core) · ADR 0017 (Learning Events + firewall) ·
ADR 0021 (Experience Player V2) · issue #639.

---

## Contexto — el defecto que lo motiva

Un lector abre un capítulo con dos Experiencias publicadas. Empieza la primera,
avanza, vuelve atrás y empieza la segunda. La primera aparece de nuevo como «sin
empezar»: su progreso desapareció.

No es un fallo de la UI. Es la consecuencia exacta de dos decisiones de 0019
tomadas cuando existía **una sola** Guide en producción:

1. el invariante de base de datos `UNIQUE (userId) WHERE status = 'ACTIVE'`
   ([migración `20260721000000`](../../apps/api/prisma/migrations/20260721000000_cc7_4b_guide_catalog_ledger/migration.sql)),
   que permite **una** sesión activa por usuario en toda la plataforma;
2. el autocancel global de §6, que al empezar cualquier recorrido cancela el
   que hubiera activo, sea cual sea.

Con una Guide, «una ACTIVE por usuario» y «una ACTIVE por recorrido» son la
misma frase. Con dos, dejan de serlo, y la primera cancela trabajo que el lector
no pidió cancelar.

Esto no puede corregirse en silencio: el invariante está escrito en 0019, está
escrito en el esquema y está escrito como comentario en el repositorio
(`findActive`: _"DB enforces at most one"_). Cambiarlo sin registrar la decisión
dejaría tres afirmaciones contradictorias y ninguna autoridad.

---

## 1. Identidad del lineage — `guideKey`

**Decisión: la identidad de la intervención curada es `guideKey`.
`guideVersion` es una revisión inmutable de esa misma intervención, no un
recorrido independiente.**

No es una definición nueva: es la que el catálogo ya implementa. El registro
indexa `versionsByGuide: Map<guideKey, number[]>` y expone
`latestStartableVersion(guideKey)`, documentado como _"Discovery helper for
STARTING a new session only… NEVER used to resolve an already-created
session"_. Un `guideKey` con tres versiones es una intervención con tres
revisiones, y la discovery arranca siempre la más alta.

De ahí se sigue lo demás. Dos versiones del mismo `guideKey` activas a la vez
serían dos copias vivas del mismo recorrido, y el lector no tendría forma de
distinguirlas ni de saber cuál «cuenta». Dos `guideKey` distintos son dos
recorridos distintos y deben poder convivir.

**El endpoint de lectura acepta un pin exacto (`guideKey@guideVersion`). Eso no
es un argumento para que el alcance de exclusividad sea el pin exacto**: el pin
resuelve _qué definición_ lee una sesión ya creada; el lineage decide _cuántos
recorridos_ puede tener vivos un lector.

---

## 2. El invariante ACTIVE

**Invariante futuro de base de datos propuesto:**

```
UNIQUE (userId, guideKey) WHERE status = 'ACTIVE'
```

Consecuencias, todas ellas normativas:

- **`guideKey` distintos pueden estar ACTIVE simultáneamente.** Es el objetivo
  de #639.
- **Versiones distintas del mismo `guideKey` no pueden estarlo.**
- Empezar `X@v2` con `X@v1` ACTIVE afecta **solo al lineage X**.
- **Nunca** cancela una sesión ACTIVE de la Guide Y.
- Las mutaciones posteriores al START siguen acotadas por `(userId, sessionId)`
  — sin cambio respecto a 0019.

El invariante propuesto es **estrictamente más permisivo** que el actual: todo
dato que satisface `UNIQUE(userId) WHERE ACTIVE` satisface también
`UNIQUE(userId, guideKey) WHERE ACTIVE`. Ninguna fila existente lo viola, y por
tanto ninguna necesita ser tocada. Esa asimetría es también la razón por la que
el rollback **no** es simétrico (§8).

---

## 3. El invariante de binding de Experience

Dentro de **un capítulo**:

- **Lineages `experienceKey` distintos deben usar `guideKey` distintos.**
- Versiones distintas del mismo `experienceKey` **pueden** conservar el mismo
  `guideKey`.
- Cambiar `guideVersion` **no fabrica** otra Experiencia independiente.
- **Dos Experiencias no pueden evadir la exclusividad** eligiendo versiones
  distintas del mismo lineage de Guide.

La última regla es la que hace consistente el conjunto. Si dos Experiencias del
mismo capítulo pudieran apuntar a `X@v1` y `X@v2`, el lector las vería como dos
recorridos independientes mientras la base de datos las trataría como uno solo:
empezar la segunda cancelaría la primera, y volveríamos exactamente al defecto
que #639 corrige. **La unicidad del CMS opera sobre `guideKey`, no sobre el pin
exacto.**

---

## 4. Sin contenido de Guide nuevo

`NEW_PRODUCTION_GUIDE_AUTHORIZED=false`.

El catálogo de producción sigue siendo **propiedad del código**. Este ADR no
autoriza añadir una segunda Guide de producción, ni un placeholder, ni
contenido psicológico sintético. Las fixtures de prueba viven en specs y deben
ser estructuralmente incapaces de entrar en `productionGuideRegistry`.

Consecuencia declarada: **C.4 (selección de Guide desde el CMS) queda bloqueada
por producto** hasta que exista una segunda definición aprobada
editorialmente. El resto de #639 no depende de ella.

---

## 5. Tabla de supersesión

| Decisión de ADR 0019                                         | Decisión nueva                                              | Razón                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Una ACTIVE global por usuario (§6, invariantes generales)    | Una ACTIVE por `(userId, guideKey)`                         | Experiencias independientes deben coexistir                 |
| `START_LOCK = guide:start:<userId>` (§7)                     | Serialización de START acotada al lineage                   | Guides distintas no deben bloquearse ni cancelarse entre sí |
| Autocancel global al iniciar otra sesión (§6)                | Autocancel **solo** dentro del mismo `guideKey`             | Preservar recorridos ajenos                                 |
| Supuesto de `findActive(userId)` con una única fila (§6, §7) | Lectura determinista acotada al lineage                     | Tolerar varias filas ACTIVE                                 |
| Matriz de concurrencia antigua (§7)                          | Matriz revisada mismo-lineage / cruce-de-lineages (§7 aquí) | #639                                                        |

**Todo lo demás de ADR 0019 sigue vigente salvo que aparezca explícitamente en
esta tabla.**

---

## 6. Semántica de transición de versión — `X@v1 → X@v2`

Sin esto, «una ACTIVE por lineage» quedaría ambiguo justo donde más importa.

- Una sesión ACTIVE de `X@v1` **permanece fijada a v1** y se resuelve siempre
  contra v1. Es la regla de 0019 §6 y no cambia.
- **Publicar o descubrir `X@v2` no cancela ni reescribe `X@v1` en silencio.**
  Publicar no es un acto del lector.
- **Completar no cruza versiones**: completar `X@v1` no puede afirmar que
  `X@v2` fue completada.
- **Si el lector arranca `X@v2` de forma explícita**, el servidor cancela la
  ACTIVE de `X@v1` y crea v2 **atómicamente, dentro del mismo lineage**.
- Una sesión COMPLETED o CANCELLED antigua **es inmutable** y sigue siendo
  resoluble por su pin exacto y por su identidad de sesión.
- **Ningún otro lineage de Guide se ve afectado** por nada de lo anterior.

### Recuperación versionada — obligatoria, no opcional

Cuando la Experiencia publicada actual usa **el mismo `guideKey`** que una
sesión ACTIVE fijada a una versión anterior:

- El Home de capítulo **debe ofrecer continuar esa sesión ACTIVE, usando su
  versión fijada**. No es una opción de diseño: sin esto el lector ve «empezar»
  sobre un recorrido que tiene a medias, que es el defecto de #639 con otra
  cara.
- **No debe arrancar la versión nueva en silencio.**
- **No debe marcar la versión nueva como completada** porque una versión
  anterior se completara.
- **Arrancar la versión nueva exige una acción explícita del lector**, y solo
  entonces ejecuta el reemplazo documentado dentro del mismo lineage.
- **El futuro endpoint de estado debe distinguir** la recuperación por lineage
  (hay una ACTIVE de este `guideKey`, fijada a otra versión) de la finalización
  de una versión exacta (esta versión concreta fue completada). Colapsar ambas
  en un solo estado vuelve a hacer indistinguibles cosas que el lector sí
  distingue.

Este ADR **no** diseña la UI final: no fija copy, ni disposición, ni
etiquetas. Fija que la recuperación existe y qué no puede hacer.

### Orden de operaciones del START

Orden normativo, implementable tal cual:

```
 1. validación cerrada y canonicalización del comando   (HTTP/parser, sin DB)
 2. abrir la transacción
 3. LINEAGE_START_LOCK = guide:start:<userId>:<guideKey>
 4. resolver guideKey@guideVersion, contexto editorial y ancla   (en la tx)
 5. construir la ValidatedGuideStartSemantics completa, propiedad del servidor
 6. inspeccionar el receipt   (bajo el lock de lineage)
 7. si es replay: devolver la sesión original y salir
       — sin re-chequeo de entitlement, sin autocancel, sin sesión,
         sin receipt, sin evento
 8. aplicar el gate de entitlement   (comando nuevo)
 9. buscar la ACTIVE del MISMO guideKey   (determinista, nunca global)
10. si existe: tomar su SESSION_MUTATION_LOCK, releerla y autocancelar
       — solo esa sesión del mismo lineage
11. crear sesión + receipt + evento, atómicamente
12. devolver el snapshot derivado por el servidor
```

**Por qué los pasos 4–6 van en ese orden y no al revés.**
`ValidatedGuideStartSemantics` incluye `editionId` y `unitId`, que **resuelve el
servidor**. Las semantics no existen antes del paso 4, así que inspeccionar el
receipt antes sería imposible: no habría nada con qué comparar. Y la inspección
debe ocurrir **bajo el lock de lineage**: dos START concurrentes del mismo
lineage con la misma `idempotencyKey` que la hicieran fuera del lock podrían
observar ambos `absent`.

**Qué significa exactamente «el receipt antes de cualquier efecto»** — y qué no:

- Significa **antes de las escrituras irreversibles**: autocancel, sesión,
  receipt, evento.
- **Tomar un advisory lock y leer catálogo o contexto no son efectos
  persistentes.** No dejan rastro y son reversibles con la transacción.
- El receipt sigue inspeccionado **antes de toda transición de estado
  irreversible**, que es la garantía que 0019 §6 quería dar.
- **El orden de locks no cambia:** `LINEAGE_START_LOCK → SESSION_MUTATION_LOCK`.
- **Un replay se decide bajo el lock de lineage y nunca vuelve a autocancelar**:
  ni una segunda cancelación, ni una segunda sesión, ni un segundo receipt, ni
  un segundo evento.

**Los fingerprints de receipt no cambian.** Este orden describe cuándo se
construyen y se comparan las semantics, no de qué se componen.

---

## 7. Contrato de locks

Namespaces conceptuales futuros:

```
LINEAGE_START_LOCK    = guide:start:<userId>:<guideKey>
SESSION_MUTATION_LOCK = guide:session:<userId>:<sessionId>
```

**Orden fijo cuando el START autocancela una versión anterior del mismo
lineage:**

```
LINEAGE_START_LOCK → SESSION_MUTATION_LOCK
```

**Nunca al revés.** Es la misma regla anti-deadlock de 0019 §7, con el primer
lock estrechado: el START toma su lock de lineage y solo después muta la sesión
previa.

El `SESSION_MUTATION_LOCK` **no cambia**: sigue compartido por step complete,
recall, cancel y session complete, y sigue serializando toda mutación de una
sesión contra las demás.

### Matriz de concurrencia revisada

| #   | Escenario                                         | Resultado                                                                                            |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Mismo user, mismo `guideKey`, misma versión       | El lock de lineage serializa: **a lo sumo una ACTIVE**.                                              |
| 2   | Mismo user, mismo `guideKey`, versiones distintas | **A lo sumo una ACTIVE**; el arranque explícito posterior reemplaza **solo** a la del mismo lineage. |
| 3   | Mismo user, `guideKey` distintos                  | **Ambas pueden quedar ACTIVE.** Ningún lock compartido, ninguna cancelación cruzada.                 |
| 4   | Replay exacto de receipt                          | Cero cancelaciones, cero sesiones, cero receipts, cero eventos adicionales.                          |
| 5   | Cancelar o completar la Guide A                   | La Guide B **permanece intacta**.                                                                    |
| 6   | `guideKey` distintos, **misma `idempotencyKey`**  | **A lo sumo una transacción commitea** (ver abajo); la perdedora devuelve el conflicto canónico.     |

Las filas 2–6 de la matriz de 0019 §7 (accepts del mismo step, pasos fuera de
orden, último step vs complete, cancel vs step, complete vs complete) **siguen
vigentes sin cambio**: todas se serializan por `SESSION_MUTATION_LOCK`, que este
ADR no toca.

### La carrera de idempotencia entre lineages

Acotar el START lock al lineage significa, **por diseño**, que dos `guideKey`
distintos **no se serializan**. Eso abre un escenario que hay que documentar en
vez de descubrirlo en producción: mismo usuario, Guides A y B, START
concurrentes, **la misma `idempotencyKey`**, semantics distintas.

Ninguno de los dos locks de lineage protege aquí. Quien lo cierra es una
autoridad **transversal que ya existe** y que este ADR no modifica: la
constraint `UNIQUE(userId, idempotencyKey)` sobre `GuideCommandReceipt`, más el
patrón `createMany(skipDuplicates)` → **relectura** de la fila almacenada →
**comparación semántica estructural** dentro de la transacción de quien llama.

La traza es esta. Ambas inspecciones ven `absent`, porque ninguna ha commiteado.
Ambas crean su sesión. Al insertar el receipt, la segunda **se bloquea** sobre el
índice único hasta que la primera resuelve. La primera commitea; la segunda
salta el duplicado (`count = 0`), **relee** la fila almacenada y encuentra
semantics que no son las suyas.

### El nivel de aislamiento es parte del contrato, no del entorno

```
GUIDE_COMMAND_TRANSACTION_ISOLATION=READ COMMITTED
```

El paso «relee y encuentra semantics ajenas» **solo ocurre bajo READ
COMMITTED**, donde cada sentencia toma una instantánea nueva y por tanto ve la
fila que la ganadora acaba de commitear. Bajo REPEATABLE READ la perdedora
seguiría fallando cerrado, pero **releería su instantánea original, no
encontraría la fila y devolvería un fallo de almacenamiento en lugar del
conflicto canónico**. El contrato normativo cambiaría de forma sin que nadie
tocara una línea de código.

Hoy el código **no fija ningún `isolationLevel`**, así que hereda el default de
la sesión/servidor. **Un contrato normativo no puede depender en silencio de
configuración mutable de base de datos**: un cambio de parámetro en el motor, o
un pooler con otro default, bastaría para romperlo.

Por eso C.0A debe hacer una de estas dos cosas **antes** de apoyarse en el
resultado canónico:

**Preferida** — pedir `ReadCommitted` explícitamente en la transacción del
comando Guide, mediante la opción de transacción soportada por Prisma,
**conservando la transacción atómica única** que cubre sesión, receipt y evento.
Verificado localmente contra el runner de este proyecto (Prisma 7.8 +
`PrismaPg`): el override se admite y **aplica de verdad** — pedir
`RepeatableRead` devuelve `repeatable read`, luego no se ignora.

**Aceptable solo si el aislamiento explícito por transacción no estuviera
técnicamente disponible** — afirmar el nivel de la sesión/servidor al arrancar y
**fallar cerrado** si no es READ COMMITTED.

**No basta con confiar en los defaults de Railway o Postgres.**

Lo que esto **no** cambia: el esquema del receipt · la versión ni la fórmula del
fingerprint · la constraint única · la autoridad de replay/conflicto · la
atomicidad de la transacción.

**Alcance de lo verificado, con precisión:** el default se comprobó en el
**runner local**. **La configuración de producción no se consultó.** La
implementación en runtime hará explícito el contrato de aislamiento **antes** de
habilitar multi-ACTIVE.

Resultado exigido, y que el comportamiento actual ya produce:

- **A lo sumo una transacción commitea.**
- La ganadora crea su sesión, su receipt y su evento.
- La perdedora observa semantics distintas y devuelve el **contrato de conflicto
  de idempotencia ya existente**; su sesión y su evento recién creados
  **revierten con la transacción**, porque el error se lanza dentro de ella.
- **No queda un segundo receipt ni una sesión huérfana.**

Este ADR **no introduce ningún lock adicional** para esto: el mecanismo
transversal es suficiente y añadir uno acoplaría lineages que la decisión de §2
quiere desacoplados.

### Requisitos de prueba para C.0A / pg-specs

Obligatorios antes de relajar el índice:

1. **`guideKey` distintos + `idempotencyKey` distintas** → ambos START tienen
   éxito y **ambas sesiones quedan ACTIVE**. Es la prueba de #639.
2. **`guideKey` distintos + misma `idempotencyKey`** → **exactamente una**
   commitea; la otra devuelve el conflicto canónico.
3. **Mismo `guideKey` + misma `idempotencyKey`** → una creación y **un replay
   exacto**, sin segunda cancelación.
4. **Mismo `guideKey` + versiones distintas + keys distintas** → el START
   explícito posterior reemplaza **solo** a la ACTIVE del mismo lineage.

Y, por el contrato de aislamiento:

5. **Afirmar que la transacción corre bajo READ COMMITTED** — la aserción
   directa, no inferida del entorno.
6. **Sin huérfanos** tras la carrera del escenario 2: ni sesión, ni receipt, ni
   evento sobrantes.
7. **Sonda de contraste bajo REPEATABLE READ**, que demuestre _por qué_ existe
   el requisito explícito: el mismo escenario deja de producir el conflicto
   canónico. **Es una sonda de contraste, no un camino de producción
   soportado.**

---

## 8. Gobernanza de rollback y migración

Este ADR registra **arquitectura y orden**, no SQL ejecutable. El SQL exacto, la
recuperación ante fallo parcial y el procedimiento de Railway pertenecen a la
revisión de C.0B.

- **El código de producción actual (`eac804f`) deja de ser un destino de
  rollback seguro** en cuanto exista más de una fila ACTIVE. Llama a
  `findActive(userId)` asumiendo una sola fila, compara el pin **después**, y
  autocancela globalmente: con N filas leería una arbitraria y cancelaría
  recorridos ajenos.
- **Una release de compatibilidad C.0A, revisada por separado, debe convertirse
  en el suelo de rollback** antes de relajar el índice.
- **C.0A debe eliminar toda lectura global arbitraria de la sesión activa** y
  tolerar N lineages ACTIVE **mientras el índice global antiguo sigue en pie**.
- **C.0A debe además hacer explícito el contrato de aislamiento** de la
  transacción del comando Guide (§7). Sin eso, el resultado canónico de la
  carrera entre lineages queda colgando del default del motor.
- **Ninguna sesión existente se borra, se reescribe ni se cancela en masa.** El
  invariante nuevo es más permisivo que el actual: los datos ya son compatibles.
- **El índice por lineage debe establecerse antes de retirar el índice global.**
- **Crear y retirar son pasos de migración recuperables por separado**, de modo
  que un fallo en el segundo deje intacto el índice global, que es el más
  estricto de los dos.
- **El comportamiento multi-ACTIVE se habilita solo después de verificar la
  transición de esquema**, nunca en el mismo despliegue.

### Sobre la sonda local de `CONCURRENTLY`

Una sonda local efímera verificó que `CREATE INDEX CONCURRENTLY` se aplica
correctamente a través del `prisma migrate deploy` exacto de este proyecto
(salida 0, índice creado, migración registrada como terminada). **Eso prueba
únicamente el camino feliz.** No prueba la recuperación tras una interrupción,
ni el caso de un índice concurrente que queda inválido, ni el comportamiento
bajo carga real. Ambas cosas son materia de C.0B.

---

## 9. Qué de ADR 0019 **no** se toca

Este ADR no rechaza ni debilita ninguna de estas decisiones, que siguen siendo
autoridad canónica:

- **Ledger explícito** `GuideSessionStep` como única fuente de verdad del
  progreso (§3), y `stepsCompleted` derivado exclusivamente de él.
- **`GuideCommandReceipt`** y sus fingerprints de idempotencia (§7) — este ADR
  **no cambia ningún fingerprint**.
- **Máquina de estados** de `GuideSession` y sus invariantes por estado (§6),
  incluido el pin inmutable `guideKey + guideVersion` por sesión.
- **Vocabulario de step kinds y policies**, y las combinaciones inexpresables
  (§2).
- **Matriz de consecuencias educativas** y la separación Guide/Eco (§5).
- **Autoridad server-side**: el cliente nunca decide el avance (§3).
- **Privacidad** (§9): la clasificación de lo almacenable y las columnas que no
  existirán.
- **`SESSION_MUTATION_LOCK`** y la transacción canónica de aceptación de paso
  (§7).

---

## 10. Identidad de capítulo — alcance

`CHAPTER_ORDER_FINDING=preexisting_positional_debt`

**No es una regresión de B.B2/B.B3.** El reorder de Content Studio cambia
`RevisionUnit.order`, **no** el `Chapter.order` heredado — probado
behaviouralmente en `draft-reorder.pg-spec.ts` (_"does not touch Chapter.order
or Book.totalChapters"_).

- La identidad estable del lector se entregó por separado (B.B1: el manifiesto
  publicado es la autoridad estructural).
- **El binding de Experience/Guide sigue arrastrando deuda posicional
  heredada**: `ChapterExperienceVersion` se ancla en `(bookSlug, chapterOrder)`,
  y `chapterOrder` es un localizador mutable, no una identidad.
- **Los locks futuros de binding deben usar una identidad de capítulo estable
  ya resuelta**, no un localizador posicional.
- **Migrar `ChapterExperienceVersion` a identidad estable NO queda incluido en
  silencio en este ADR.** Sería un cambio de modelo y necesita su propia
  decisión.
- **C.3 debe revisar la resolución de `ContentUnit.id` / `Chapter.id` heredado
  antes de elegir su clave de lock.**

---

## 11. Ciclo de vida de drafts — decisión relacionada de #639

Se registra aquí por pertenecer a #639, **no** como parte del estado de
`GuideSession`.

- Hoy, **toda fila DRAFT y PUBLISHED de Experience reserva su binding de
  Guide**. Es un fallo-cerrado deliberado: la colisión se detecta antes del
  trabajo editorial, no en el publish.
- **La reserva indefinida por un draft abandonado no es el comportamiento final
  deseado de producto.** Con un catálogo de dos Guides, un draft olvidado puede
  monopolizar una guía escasa para siempre, y hoy no existe ninguna operación de
  archivado, liberación ni borrado. Que un comentario del código lo describa no
  lo convierte en decisión aprobada.
- **#639 incluirá un ciclo de vida mínimo y no destructivo:**
  - transición `DRAFT → ARCHIVED`;
  - **la fila nunca se borra**;
  - las filas PUBLISHED permanecen inmutables;
  - **un draft ARCHIVED no reserva Guide**;
  - los números de versión **nunca se reutilizan**;
  - archivar y liberar **comparten el mismo lock de capítulo/binding que la
    creación**.
- La implementación exacta de esquema, API y UI pertenece a **C.3/C.4**, no a
  C.0D.

---

## 12. No-objetivos

Explícitamente fuera de alcance de este ADR:

- crear una Guide de producción;
- autoría de Guides desde el CMS;
- definiciones de Guide en base de datos;
- un motor de workflows genérico;
- cambios a los fingerprints de receipt;
- cambios a la autoridad de `GuideSessionStep`;
- backfills de contenido o de sesiones;
- migraciones destructivas;
- **cualquier implementación en runtime dentro de este PR**.

---

## 13. Orden de implementación (fuera de este PR)

| Fase      | Contenido                                                                                                        | Esquema | Rollback                   |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ------- | -------------------------- |
| **C.0D**  | Este ADR — solo documentación                                                                                    | no      | trivial                    |
| **C.0A**  | Tolerancia a multi-ACTIVE **+ contrato explícito de aislamiento** de la transacción Guide; índice global intacto | no      | **suelo de rollback**      |
| **C.0B1** | Añadir índice por lineage; el global permanece                                                                   | sí      | retirar el nuevo           |
| **C.0B2** | Retirar el índice global + START por lineage                                                                     | sí      | a C.0A, **no** a `eac804f` |
| **C.1**   | Endpoint aditivo de estado por Experience                                                                        | no      | limpio                     |
| **C.3**   | Reserva de binding segura ante concurrencia                                                                      | no      | limpio                     |
| **C.2**   | La web consume estados independientes                                                                            | no      | limpio                     |
| **C.4**   | Selección de Guide en el CMS — **bloqueada por producto**                                                        | no      | limpio                     |
| **C.5**   | Verificación en producción (solo lectura)                                                                        | —       | —                          |

Cada fase requiere su propia autorización explícita.
