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

## 2. La exclusión: revocar las sesiones, no apagar el servicio

**Mecanismo elegido: revocación de sesiones** (`auth/session-revocation.ts`,
ADR 0015), y no una ventana de mantenimiento. El motivo es que la revocación
**se puede acreditar** y el mantenimiento no cerraba el caso que importa.

`revokeAllUserSessions` hace dos escrituras en una transacción: sube
`User.authRevision` —con lo que **todo token de acceso ya emitido lleva un
claim `ar` obsoleto y `JwtStrategy` lo rechaza en su siguiente petición**, sin
esperar los 15 minutos de expiración— y borra todos los `RefreshToken`.

Por qué eso cierra el problema, caso por caso:

| Caso                                                  | Qué lo cierra                                                                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una pestaña abierta con el texto **anterior**         | **La revocación.** No puede escribir: 401 inmediato. Para volver a escribir tiene que autenticarse, y eso recarga la aplicación y vuelve a leer el capítulo |
| Un subrayado creado **antes** de que el reparador lea | **La consulta por ancla.** El ejecutor lo encuentra y **aborta** — no lo pisa                                                                               |
| Un subrayado creado **después** de nuestro commit     | **La revocación.** Ese cliente tendría que haberse autenticado de nuevo, y entonces su texto ya es el reparado                                              |

> **Por qué no «quince minutos sin actividad».** Una versión anterior de este
> documento proponía exigir que `ReadingSession.lastSeenAt` no se hubiera
> movido en 15 minutos. Eso describe el **pasado** y no demuestra nada sobre el
> presente: una pestaña abierta sin heartbeat reciente conserva el texto
> anterior en memoria y puede escribir en cualquier momento. La revocación no
> describe, **impide**.

> **Por qué tampoco la bandera de mantenimiento de Coolify.** Dejaría de servir
> y permitiría ejecutar dentro del contenedor vivo, pero no impide que un
> cliente escriba **al reabrir** con el texto anterior ya cargado — que es
> justo el caso que hay que cerrar. Y detener el contenedor para después
> «ejecutar dentro de él» es una contradicción; si alguna vez hiciera falta
> apagarlo, la ejecución tendría que ser **puntual sobre la misma imagen
> revisada** (`docker run --rm` con las variables del servicio). Esa opción
> queda nombrada, no elegida.

### 2.1 Impedir escrituras nuevas

Una sola sentencia, dentro de una transacción, sobre la base de staging:

```sql
BEGIN;
UPDATE "User" SET "authRevision" = "authRevision" + 1;
DELETE FROM "RefreshToken";
COMMIT;
```

Es exactamente lo que hace `revokeAllUserSessions` para un usuario, aplicado a
todos. Alcance: **cierra la sesión de todo el mundo en staging**. En un entorno
de pruebas eso es un inconveniente de un inicio de sesión, no una pérdida.

### 2.2 Acreditar que la exclusión funciona

Con un token capturado **antes** de revocar:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  https://api-staging.feelverse.app/api/user/me -H "Authorization: Bearer <token previo>"
# 200 antes de revocar · 401 después. Un 200 después significa que no revocó.
```

Y que el reparador puede correr: el contenedor sigue arriba.

```bash
sudo docker ps --filter name=aft7nt3p6wsormno2cejtavj --format '{{.Status}}'
```

### 2.3 Reabrir

No hay nada que reabrir: el servicio nunca dejó de servir. Lo que hay es
**comprobar**, en este orden:

1. `GET /api/health/ready` → `ready=true` con `pending` **y** `failed` vacíos.
2. Replanificar: **0 operaciones** propuestas (convergió).
3. Las dos representaciones concuerdan (el comparador del inspector).
4. Abrir un capítulo en pantalla: negritas donde antes había asteriscos.
5. Crear y leer una marca con una cuenta QA, y comprobar que selecciona sus
   palabras.

### 2.4 Si hay que revertir

El comando de recuperación del §4.3. Se niega si algo cambió después de la
reparación —texto, `meta`, hash nativo o cualquier subrayado— y en ese caso
**no se insiste**: se mira qué cambió. Esta herramienta no reconcilia.

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
| Planificar                                      | 57 ms     | 94 ms     |
| Aplicar, 732 bloques, con la preimagen en disco | **2,4 s** | **4,1 s** |
| Revertir desde el archivo                       | **2,0 s** | **2,2 s** |
| Tamaño de la preimagen                          | 328 KiB   | 328 KiB   |

El plazo de la transacción es **explícito: 60 s** (`TRANSACTION_TIMEOUT_MS`),
unas quince veces la medición más lenta. **No** es el de Prisma por defecto (5 s): el camino
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

---

## 7. Ejecución del 2026-10-26 · APLICADA en staging

Ejecutada contra `feelverse_staging` con el plan revisado
`planId 5a9c0dd4-90b4-4c0f-882c-406aec9a52c8`,
`planHash sha256:d1551eaf2a18d1ee520b17fff8fc006ae28e113e66249b2132675fbc0c5bd2fb`.

### Secuencia y evidencia

| Paso                        | Resultado                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #814 integrado              | `main = 19fcc261` · 15/15 comprobaciones verdes sobre el estado fusionado                                                                                                                                    |
| API desplegada              | `aft7nt3p6wsormno2cejtavj:19fcc261` · healthy · contiene los 9 archivos del reparador, los 3 scripts y `ts-node`                                                                                             |
| Readiness                   | `ready=true`, `reason=ok`, 71/71, `pending` y `failed` vacíos                                                                                                                                                |
| Plan contra datos vivos     | hash **idéntico** al revisado · 732 a reescribir · 2651 intactos · 2 bloqueados · base `feelverse_staging`, postura `staging`                                                                                |
| **Exclusión**               | 10 usuarios con `authRevision` subido, **126** refresh borrados. Un token capturado ANTES pasó de **200** a **401**                                                                                          |
| Aplicación                  | **732 bloques** · preimagen escrita · comprobación posterior: **0 operaciones pendientes — convergió**                                                                                                       |
| Preimagen extraída          | `~/.psico-ops/eec-emphasis-plan-20261026b.preimage.json` · 353 KB · 732 = 732 con cobertura exacta · `planId`/`planHash` coincidentes · **sin prosa**                                                        |
| Concordancia                | 3385 bloques, 3385 con versión nativa · **DERIVA 0** en texto, `meta`, orden y kind                                                                                                                          |
| Identidades y referencias   | sin cambios: 0 subrayados, 1 anotación, 18 sesiones de lectura. 288 viñetas conservadas                                                                                                                      |
| Asteriscos restantes        | **2 bloques**, los dos bloqueos editoriales. `inlineMarks` en **732**                                                                                                                                        |
| Lectura por API (cuenta QA) | capítulo 1: 188 bloques, **49 con `inlineMarks`**, 1 con asterisco (el bloqueado)                                                                                                                            |
| Marca creada y leída        | `POST /api/highlights` 201 · en la base: `[12,17)` con `quote=mitos` sobre el bloque reparado — en el texto viejo esos offsets eran `" mito"` · leída por el lector seleccionando `'mitos'` · retirada (204) |
| **En pantalla**             | lector con **25 negritas** y **24 cursivas** renderizadas; los **4** asteriscos que quedan están todos en el bloque `**Nota editorial:**`, que es la cita bloqueada por el backtick                          |

### Lo que quedó fuera, por decisión editorial pendiente

| Dónde                           | Motivo                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| cap 1 · bloque 166 · `QUOTE`    | `UNREPRESENTABLE_MARKUP` — backtick. Es el bloque cuyos asteriscos se ven en pantalla |
| cap 5 · bloque 368 · `EXERCISE` | `KIND_NOT_FORMATTABLE`                                                                |

Las 288 viñetas `- ` siguen fuera de alcance y no se tocaron. No hubo reingesta.

### Nota de credenciales

La comprobación en pantalla exige sesión —la vista libre es una puerta de plan,
no de autenticación (el lector responde 401 sin token)—, así que la contraseña
de la cuenta QA se materializó una vez para rellenar el formulario y **se rotó
inmediatamente después**, quedando marcada como quemada en el almacén de ops.
Es la misma convención que ya aplicaba `feelverse-staging-qa.env`.
