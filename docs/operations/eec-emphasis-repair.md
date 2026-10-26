# EEC · sacar el énfasis Markdown del texto

Procedimiento operativo de la reparación que mueve `**negrita**` y `*cursiva*`
del `content` de los bloques a `meta.inlineMarks`. Hermano de
[la reparación de autoría del catálogo](catalog-authorship-repair.md), del que
copia la forma: plan congelado, revisión entre dos comandos, preimagen y
rechazo ante cambios concurrentes.

**Estado: preparado, sin aplicar.** Este documento describe cómo se aplicará y
cómo se revierte; nada de esto se ha ejecutado sobre staging.

---

## 1. Por qué hace falta una ventana operativa, y no sólo un candado

La reparación acorta el texto, y un subrayado es un par de desplazamientos
UTF-16 dentro de ese texto. Así que hay dos riesgos distintos, y **sólo uno se
puede cerrar dentro de la transacción**:

| Riesgo                                                                         | Se cierra con       | Cómo                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una edición entre la lectura y la escritura                                    | **Compare-and-set** | Cada `UPDATE` repite en su `WHERE` los valores que se acaban de leer —`content` **y** `meta` en las dos filas de texto, desplazamientos en cada subrayado— y un update que no case con ninguna fila aborta la transacción |
| Un subrayado creado **después** de planificar y **ya confirmado**              | **Compare-and-set** | La consulta de aplicación busca por **ancla** (`blockId`/`contentBlockId`), no por los IDs del plan, y cualquier referencia que no estuviera en el plan lo rechaza                                                        |
| Un subrayado que una petición **en vuelo** insertará después de nuestro commit | **La ventana**      | Imposible de ver desde dentro: esa fila todavía no existe. La petición ya leyó el texto viejo y validó su selección contra él                                                                                             |

Y un candado consultivo (`pg_advisory_xact_lock`) **no sirve** aquí, y eso está
medido, no supuesto: `apps/api/src/lector/highlights.service.ts` crea
subrayados **sin candado y sin transacción**. Un candado que sólo tome el
reparador coordina con nadie.

De ahí la elección explícita: **compare-and-set dentro de la transacción, más
una ventana que drene a los escritores**.

### La ventana, acotada

1. Poner la API en mantenimiento o detenerla (`feelverse-staging-api`), de modo
   que deje de aceptar peticiones. Web puede seguir arriba: sin API no escribe.
2. Esperar a que las peticiones en vuelo terminen. El límite real es el timeout
   del propio proceso; **30 s** es holgado para las rutas del lector.
3. Replanificar y aplicar (abajo). El ensayo de volumen da **~2,7 s** para 732
   bloques, así que la ventana total es de **menos de un minuto**.
4. Restaurar el servicio y comprobar.

Si alguien prefiere no detener nada, la alternativa honesta **no** es aplicar y
confiar: es aceptar que un subrayado creado en esos dos segundos puede quedar
mal anclado, y hoy en staging hay **cero** subrayados, así que el riesgo es
nulo mientras siga siendo cero. Esa es la razón de aplicarlo pronto.

---

## 2. El artefacto desde el que se ejecuta

El comando corre **dentro del contenedor de la API**, que es la única caja con
el código y el acceso a la base:

```
/app/apps/api                      ← ts-node en node_modules/.bin/ts-node
```

Comprobado el 2026-10-26 sobre `aft7nt3p6wsormno2cejtavj:a31ddaa4`: el
contenedor trae `src`, `dist` **y** `ts-node`, así que el script declarado en
`package.json` corre tal cual.

**Pero los archivos de esta reparación no están en esa imagen** —son
posteriores—, así que **hay que redesplegar la API** para disponer del comando.
Eso es todo lo que hay que redesplegar:

| Servicio   | ¿Redesplegar? | Por qué                                                                                                                            |
| ---------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **API**    | **Sí**        | Es de donde se ejecuta el comando, y la imagen actual no lo contiene                                                               |
| Web        | No            | No participa. Su artefacto sólo cambia si cambia su código                                                                         |
| **worker** | **No**        | No ejecuta esta utilidad: `jobs/worker.module.ts` no importa nada de `content-core/markdown-repair*`, y ningún processor la invoca |

---

## 3. Aplicar

Dos comandos, y la revisión ocurre **entre** ellos.

### 3.1 Planificar

Desde el contenedor de la API:

```bash
pnpm --filter @psico/api content:eec:emphasis:plan -- \
  --plan-out=/ruta/privada/eec-emphasis-plan.json
```

O, sin acceso a la red de la base, desde un snapshot exportado en sólo lectura
(`--snapshot=<ruta>`): el planificador es puro, así que da el plan idéntico sin
credencial de por medio. La aplicación **rechaza** `--snapshot`, porque lee la
base en vivo y eso es la comprobación que hace el plan seguro.

Salida: el resumen, los bloqueos con su motivo, el `planId` y el `planHash`.
**Esos dos valores se revisan y se declaran en el paso siguiente.**

### 3.2 Aplicar

```bash
export ALLOW_STAGING_EEC_EMPHASIS_REPAIR=1
pnpm --filter @psico/api content:eec:emphasis:apply -- \
  --plan=/ruta/privada/eec-emphasis-plan.json \
  --expect-database=feelverse_staging \
  --expect-posture=staging \
  --expect-plan-id=<planId revisado> \
  --expect-plan-hash=<planHash revisado>
```

Lo que comprueba antes de escribir una sola fila:

- `DATABASE_URL` existe —no hay destino por defecto—, y su base coincide con
  `--expect-database`;
- la **postura** que resuelve el proceso coincide con `--expect-posture`;
  `production` se rechaza y **no hay token que lo habilite**;
- `staging` exige el token **en esta invocación**, también por loopback: un
  túnel o un proxy local no demuestran que detrás no haya otra base;
- **`current_database()`**, preguntado al servidor: dos etiquetas de acuerdo no
  son un destino, y una copia restaurada de staging produciría el mismo hash;
- el plan es del formato, del libro y de la base correctos, **y es el plan que
  se aprobó** — `planId` y `planHash` vienen de la invocación, porque un
  archivo sustituido respondería por sí mismo;
- la base **todavía produce ese plan**: se replanifica y se comparan hashes.

La preimagen se escribe en `<plan>.preimage.json` **antes de la primera
escritura**, y se refresca en cada operación.

---

## 4. Revertir

**No hace falta el texto anterior**, y por eso la preimagen guarda digests en
vez de prosa: la transformación es invertible por construcción. El plan lleva
`removals` —posición y longitud de cada racha eliminada, en coordenadas del
texto viejo—, todo lo eliminado es un asterisco, y `restoreSpans()` reinserta y
reproduce el original.

`revertEmphasisRepair` hace, por bloque y en orden inverso:

1. Comprueba que la fila es **la que la reparación dejó** (digest de la
   postimagen). Si no, **se niega**: una edición posterior no se descarta para
   poner asteriscos.
2. Reconstruye con `restoreSpans` y comprueba el resultado contra el digest de
   la preimagen antes de escribir nada.
3. Escribe texto, `contentHash` y el `meta` anterior en las dos
   representaciones, condicionado otra vez a los valores leídos.
4. Devuelve cada subrayado a sus desplazamientos y su cita anteriores —
   **`null` incluido**: una marca capturada antes de que la cita fuera
   obligatoria no tenía, e inventarle una sería un cambio que nadie pidió.

Ensayado contra PostgreSQL real: estado inicial → aplicación → comprobación →
reversión → comparación de `content`, `meta`, `contentHash`, identidades,
desplazamientos y citas. Más un fallo a mitad que demuestra que no queda una
reparación parcial, y el ensayo de volumen.

---

## 5. Límites operativos medidos

Contra PostgreSQL real, 732 bloques —el volumen que el plan propone—:

| Fase                       | Tiempo |
| -------------------------- | ------ |
| Planificar                 | 46 ms  |
| Aplicar (una transacción)  | ~2,7 s |
| Revertir (una transacción) | ~2,0 s |

Todo cabe en una transacción sin ampliar el timeout por defecto. La ventana
operativa del §1 es, por tanto, de segundos, no de minutos.

---

## 6. Lo que esta herramienta NO hace

- **No reconcilia contenido ya derivado.** Un bloque cuyas dos representaciones
  ya discrepan —en texto, `meta`, `order` o `kind`, por el comparador del
  propio inspector— se **bloquea**. Es otro defecto con otro arreglo.
- **No borra ni recrea bloques.** Las marcas anclan a `blockId`/
  `contentBlockId`, y `ReadingSession.lastBlockId` no tiene clave ajena: un
  bloque recreado la dejaría apuntando a una fila inexistente.
- **No toca las viñetas.** 288 bloques empiezan por `- `. Una lista es
  estructura de bloque y no hay tipo donde ponerla; quitarla borraría un
  carácter visible sin dónde registrar qué significaba.
- **No fuerza un contador a cero.** Los dos bloqueos editoriales conocidos —un
  backtick en una cita y un `EXERCISE` con asteriscos— quedan **fuera de la
  aplicación**, y resolverlos es una decisión editorial, no una de esta
  herramienta.
