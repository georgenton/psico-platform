# EEC · sacar el énfasis Markdown del texto

Procedimiento operativo de la reparación que mueve `**negrita**` y `*cursiva*`
del `content` de los bloques a `meta.inlineMarks`. Hermano de
[la reparación de autoría del catálogo](catalog-authorship-repair.md), del que
copia la forma: plan congelado, revisión entre dos comandos, preimagen en disco
y rechazo ante cambios concurrentes.

**Estado: preparado, sin aplicar.** Esto describe cómo se aplicará y cómo se
revierte; nada se ha ejecutado sobre staging.

---

## 1. Por qué hace falta exclusión, y no sólo compare-and-set

La reparación acorta el texto, y un subrayado es un par de desplazamientos
UTF-16 dentro de ese texto. Hay tres riesgos y **sólo dos se cierran dentro de
la transacción**:

| Riesgo                                                                   | Se cierra con       | Cómo                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una edición entre la lectura y la escritura                              | **Compare-and-set** | Cada `UPDATE` repite en su `WHERE` los valores leídos —`content` **y** `meta` en las dos filas de texto, desplazamientos en cada subrayado— y un update que no case aborta |
| Un subrayado creado después de planificar y **ya confirmado**            | **Compare-and-set** | La consulta busca por **ancla**, no por los IDs del plan; cualquier referencia no contemplada lo rechaza                                                                   |
| Un subrayado que una petición **en vuelo** insertará tras nuestro commit | **La exclusión**    | Imposible de ver desde dentro: esa fila todavía no existe                                                                                                                  |

Un candado consultivo no sirve, y está medido:
`apps/api/src/lector/highlights.service.ts` crea subrayados **sin candado y sin
transacción**. Un candado que sólo tome el reparador coordina con nadie.

> **No existe la opción de aplicar sin exclusión.** Una versión anterior de este
> documento decía que, habiendo cero subrayados en staging, el riesgo era nulo.
> Es falso: ese recuento describe el pasado y no impide una escritura nueva. Un
> lector puede abrir un capítulo y subrayar durante los dos segundos que dura la
> aplicación.

---

## 2. La ventana: mantenimiento con el contenedor vivo

**Mecanismo: la bandera de mantenimiento de Coolify** sobre
`feelverse-staging-api` (`is_maintenance_enabled`). El proxy deja de enrutar
hacia el contenedor y sirve la página de mantenimiento, **pero el contenedor
sigue en marcha** — que es justo lo que hace falta, porque el ejecutor corre
dentro de él.

> **Deliberadamente NO se detiene el contenedor.** Pararlo y después ejecutar
> «dentro de ese contenedor» es una contradicción: un contenedor detenido no
> ejecuta nada. Si en algún momento se prefiriera pararlo, la ejecución tendría
> que ser **puntual sobre la misma imagen revisada**
> (`docker run --rm <imagen> …` con las variables del servicio), y eso es otra
> opción, no esta.

### 2.1 Impedir escrituras nuevas

1. Activar mantenimiento en `feelverse-staging-api`.
2. **Acreditarlo desde fuera**, no por la interfaz:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api-staging.feelverse.app/health
# 503 (o la página de mantenimiento). Un 200 significa que sigue sirviendo.
```

3. Acreditar que el contenedor **sigue vivo**, porque de ahí sale el ejecutor:

```bash
sudo docker ps --filter name=aft7nt3p6wsormno2cejtavj --format '{{.Status}}'
# Up …
```

Web puede quedarse arriba: sin API no escribe nada.

### 2.2 Acreditar el drenaje

Dos señales, las dos consultables:

```sql
-- 1. Ninguna consulta activa de la API sobre la base.
SELECT count(*) FROM pg_stat_activity
 WHERE datname = current_database()
   AND backend_type = 'client backend'
   AND state <> 'idle'
   AND pid <> pg_backend_pid();
-- Se espera 0.
```

```sql
-- 2. Ningún lector vivo en el libro afectado. El heartbeat del lector escribe
--    `ReadingSession.lastSeenAt` cada 5 s, así que un lector activo aparece en
--    segundos; 15 minutos es un margen amplio.
SELECT count(*) FROM "ReadingSession" rs
  JOIN "Chapter" ch ON ch.id = rs."chapterId"
  JOIN "Book"    b  ON b.id  = ch."bookId"
 WHERE b.slug = 'emociones-en-construccion'
   AND rs."lastSeenAt" > now() - interval '15 minutes';
-- Se espera 0.
```

Si la primera no baja a 0, esperar: el límite real es el timeout de las
peticiones del lector. **Si la segunda no es 0, no se abre la ventana** — hay
alguien leyendo y su cliente tiene el texto viejo cargado.

### 2.3 Los lectores que conservan el texto anterior

Aquí hay un residuo que conviene decir entero, porque el servidor **no** lo
rechaza hoy: `content-core/marks/mark-anchor.ts` **captura** la cita del
`BlockVersion.content` actual en vez de validar la que manda el cliente. Un
cliente que cargó el capítulo antes de la ventana y escribe después:

- si sus desplazamientos caen dentro del texto nuevo —más corto—, el servidor
  **acepta** la escritura y guarda una cita de las palabras que ahora estén ahí;
- si se salen, responde `OFFSET_OUT_OF_RANGE` (400).

Es decir: el daño posible es **la marca de esa persona sobre otras palabras**,
visible para ella, no una corrupción del libro. El control disponible es la
precondición de §2.2 —ningún lector vivo en 15 minutos— más la propia ventana,
y después de reabrir, que cualquier cliente que recargue vuelva a leer el texto
nuevo.

Lo que **cerraría** el residuo es que el camino de escritura validara la cita
del cliente en lugar de capturarla. Es un cambio de producto, fuera del alcance
de esta reparación, y queda nombrado para que no se pierda.

### 2.4 Reabrir

En este orden, y ninguno es opcional:

1. `GET /api/health/ready` → `ready=true` con `pending` **y** `failed` vacíos.
2. Replanificar: **0 operaciones** propuestas (convergió).
3. El inspector del backfill no reporta deriva.
4. Abrir un capítulo en pantalla: negritas donde antes había asteriscos.
5. Desactivar mantenimiento y comprobar `/health` → 200.

### 2.5 Si hay que revertir

Se usa el comando de recuperación del §4. Se niega si algo cambió después de la
reparación —texto, `meta`, hash nativo o cualquier subrayado— y en ese caso
**no se insiste**: se mira qué cambió. Esta herramienta no reconcilia.

---

## 3. El artefacto desde el que se ejecuta

El comando corre **dentro del contenedor de la API**, la única caja con el
código y acceso a la base:

```
/app/apps/api                      ← ts-node en node_modules/.bin/ts-node
```

Comprobado el 2026-10-26 sobre `aft7nt3p6wsormno2cejtavj:a31ddaa4`: trae `src`,
`dist` **y** `ts-node`, así que los scripts de `package.json` corren tal cual.

**Pero los archivos de esta reparación no están en esa imagen** —son
posteriores—, así que **hay que redesplegar la API**. Eso es todo:

| Servicio   | ¿Redesplegar? | Por qué                                                                                                                                                                 |
| ---------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API**    | **Sí**        | Es de donde se ejecuta, y la imagen actual no lo contiene                                                                                                               |
| Web        | No            | No participa; mantiene su imagen                                                                                                                                        |
| **worker** | **No**        | No ejecuta esta utilidad. Verificado por lectura del grafo: nada en `jobs/` importa `markdown-repair*`, y sólo el CLI y su módulo de datos lo hacen. Mantiene su imagen |

---

## 4. Los tres comandos

### 4.1 Planificar

```bash
pnpm --filter @psico/api content:eec:emphasis:plan -- \
  --plan-out=/ruta/privada/eec-emphasis-plan.json
```

Sin acceso a la red de la base, `--snapshot=<ruta>` planifica desde una
exportación de sólo lectura: el planificador es puro, así que da el plan
idéntico sin credencial de por medio. Las dos invocaciones que escriben
**rechazan** `--snapshot`.

Salida: resumen, bloqueos con su motivo, `planId` y `planHash`. **Esos dos se
revisan y se declaran en el paso siguiente.**

### 4.2 Aplicar

```bash
export ALLOW_STAGING_EEC_EMPHASIS_REPAIR=1
pnpm --filter @psico/api content:eec:emphasis:apply -- \
  --plan=/ruta/privada/eec-emphasis-plan.json \
  --expect-database=feelverse_staging \
  --expect-posture=staging \
  --expect-plan-id=<planId revisado> \
  --expect-plan-hash=<planHash revisado>
```

Comprobaciones antes de mover una sola fila:

- `DATABASE_URL` existe y su base coincide con `--expect-database`;
- la **postura** del proceso coincide con `--expect-posture`; `production` se
  rechaza y **no hay token que lo habilite**;
- `staging` exige el token **en esta invocación**, también por loopback;
- **`current_database()`**, preguntado al servidor: dos etiquetas de acuerdo no
  son un destino, y una copia restaurada produciría el mismo hash;
- el plan es del formato, libro y base correctos, **y es el aprobado** —
  `planId` y `planHash` vienen de la invocación, porque un archivo sustituido
  respondería por sí mismo;
- la base **todavía produce ese plan**: se replanifica y se comparan hashes.

La preimagen se escribe en `<plan>.preimage.json` **antes de la primera
escritura** y se reescribe completa en cada operación, de modo que el archivo es
siempre un reverso completo y parseable, o el completo anterior.

### 4.3 Revertir

```bash
export ALLOW_STAGING_EEC_EMPHASIS_REPAIR=1
pnpm --filter @psico/api content:eec:emphasis:revert -- \
  --plan=/ruta/privada/eec-emphasis-plan.json \
  --preimage=/ruta/privada/eec-emphasis-plan.preimage.json \
  --expect-database=feelverse_staging \
  --expect-posture=staging \
  --expect-plan-id=<planId> \
  --expect-plan-hash=<planHash>
```

Comprueba el destino igual que la aplicación, más:

- **correspondencia** plan ↔ preimagen: mismo `planId`, mismo `planHash`, misma
  base, y la preimagen cubre **exactamente** los bloques del plan — ni uno de
  más ni uno de menos, porque una reversión parcial no se ejecuta a ciegas;
- **la postimagen**, derivada del plan y de la preimagen y no leída de las filas
  que va a comprobar: texto, `meta` de **las dos** representaciones, `contentHash`
  nativo, y los desplazamientos **y la cita** de cada subrayado;
- las referencias **por ancla**: un subrayado creado después de la reparación
  aborta la reversión, porque devolver el texto movería sus palabras.

No comprueba que la base siga produciendo el plan — no lo produce, la reparación
ya se aplicó. Lo que comprueba es la postimagen.

**No hace falta el texto anterior**: el plan lleva `removals` y `restoreSpans()`
reinserta los asteriscos exactos; el digest de la preimagen confirma que la
reconstrucción es la correcta. Por eso la preimagen no guarda prosa.

---

## 5. Límites operativos medidos

Ensayo del recorrido **completo** contra PostgreSQL real, con los mismos
archivos y el mismo mecanismo de persistencia que la ejecución operativa — plan
congelado a archivo, aplicación reescribiendo la preimagen en cada operación,
**memoria descartada**, recuperación leyendo el archivo:

| Fase                                            | Local     | En CI     |
| ----------------------------------------------- | --------- | --------- |
| Planificar                                      | 57 ms     | 166 ms    |
| Aplicar, 732 bloques, con la preimagen en disco | **2,6 s** | **3,4 s** |
| Revertir desde el archivo                       | **2,1 s** | —         |
| Tamaño de la preimagen                          | 328 KiB   | —         |

El plazo de la transacción es **explícito: 60 s** (`TRANSACTION_TIMEOUT_MS`),
unas veinte veces lo medido. **No** es el de Prisma por defecto (5 s): el camino
real cabría en un buen día y no en uno malo, que es la peor propiedad que puede
tener un límite.

La ventana operativa completa —mantenimiento, drenaje, aplicación, comprobación,
reapertura— es de **minutos**, y la parte que escribe, de segundos.

---

## 6. Lo que esta herramienta NO hace

- **No reconcilia contenido ya derivado.** Un bloque cuyas dos representaciones
  ya discrepan —en texto, `meta`, `order` o `kind`, por el comparador del propio
  inspector— se **bloquea**. Es otro defecto con otro arreglo.
- **No reconcilia cambios posteriores a la reparación.** La reversión se niega y
  dice qué encontró.
- **No borra ni recrea bloques.** Las marcas anclan a
  `blockId`/`contentBlockId`, y `ReadingSession.lastBlockId` no tiene clave
  ajena: un bloque recreado la dejaría apuntando a una fila inexistente.
- **No toca las viñetas.** 288 bloques empiezan por `- `. Una lista es
  estructura de bloque y no hay tipo donde ponerla.
- **No fuerza un contador a cero.** Los dos bloqueos editoriales —un backtick en
  una cita y un `EXERCISE` con asteriscos— quedan **fuera de la aplicación**.
