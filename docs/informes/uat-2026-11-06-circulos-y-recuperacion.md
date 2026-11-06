# Círculos en OVH, el respaldo que no se podía alcanzar, y dos defectos de configuración — 2026-11-06

Continúa el cierre del 05-11. Todo lo de abajo está medido contra el entorno que
sirve, no recordado.

|                        |                                                  |
| ---------------------- | ------------------------------------------------ |
| Repositorio al empezar | `main = bcd3e147`                                |
| Integrado hoy          | #823 excepción móvil · #824 remitente del correo |
| Desplegado hoy         | API (dos veces) · worker — **de uno en uno**     |
| Círculos en OVH        | **abierto en `pilot`, sólo para QA**             |
| Ensayo de recuperación | **avanzado, con un hallazgo grave corregido**    |
| Producción             | **sigue sin existir como recurso**               |

---

## 1 · La excepción móvil a las plataformas retiradas (#823)

El rechazo de Railway y Vercel vivía **dentro de la rama `strict`** de
`normalizeOrigin`, así que cubría staging y producción y dejaba fuera
**desarrollo**. Había una prueba que conservaba esa excepción con su razón
escrita: el `.env` del desarrollador apunta allí, y negarlo rompería su único
flujo.

**Esa razón caducó el 05-11.** Mientras esas plataformas eran un respaldo
congelado, apuntar a ellas era usar un entorno vivo que nadie había descartado.
Retiradas del plan, ya no reciben código: una sesión de desarrollo contra ese
host **parece sana** mientras ejercita un producto tres semanas por detrás del
repositorio. Las conclusiones que salen de ahí hablan en silencio de otra cosa
—peor que un rechazo en `pnpm start`, y mucho más difícil de notar.

El flujo local se **redirige**, no se retira: `localhost`, `127.0.0.1` y una
dirección de red local siguen resolviendo, y el mensaje nombra las dos salidas
válidas. La comprobación pasa además **antes** que la regla de https, porque
`http://x.up.railway.app` viola las dos y reportar «usa https» invitaría a
corregir el esquema conservando el host.

Verificado por mutación: devolver la comprobación a `strict` mata **6** pruebas
de las nuevas. Suite móvil 215/215.

---

## 2 · Círculos, completado en OVH/Coolify

### 2.1 Qué hacían los recursos antiguos, y qué ya estaba resuelto aquí

El entorno alojado anterior existía para responder **una** pregunta que ningún
arnés local puede (runbook §12): qué hace el producto cuando el navegador, la
Web y la API están **realmente separados por una red**.

Eso ya lo satisface la instalación actual: `staging.feelverse.app` y
`api-staging.feelverse.app` son hosts distintos sobre una red real. No había que
reconstruir un entorno — había que **configurar el que ya existe**.

Y una pieza estaba ya puesta, que es la que falla en silencio:
`CLIENT_ATTESTATION_SECRET` **coincide en los tres servicios** (comprobado por
hash, sin materializar el valor). Si divergiera, cada visitante de la superficie
de invitado volvería a compartir un solo cupo, sin ruido y sin error visible.

### 2.2 Lo que faltaba

| Variable                     | Antes                  | Ahora                 |
| ---------------------------- | ---------------------- | --------------------- |
| `CIRCLES_ROLLOUT_MODE`       | `off` en API y worker  | `pilot` en los dos    |
| `CIRCLES_PILOT_USER_IDS`     | ausente                | **sólo** la cuenta QA |
| `CIRCLES_SHARED_DATA_KEY_V1` | **ausente**            | presente, nueva       |
| `CLIENT_ATTESTATION_SECRET`  | presente y coincidente | sin tocar             |

**El orden importó.** Bajo `pilot` u `on`, una clave ausente **falla el
arranque** (runbook §5). Las tres variables se escribieron antes de desplegar,
así que ningún arranque vio `pilot` sin clave.

**La clave es nueva y sólo de este entorno.** Los secretos de Círculos son por
entorno: reutilizar uno ataría los dos por su criptografía — quien tuviera uno
podría leer los sobres del otro. No se derivó de ninguna existente y se guardó
fuera del repositorio antes de escribirla en Coolify.

> **Una clave quemada y rotada.** La primera que generé se imprimió
> **parcialmente** en una llamada de herramienta: una redacción con `sed` se
> rompió porque el base64 contenía `/`. Nunca llegó a escribirse en Coolify —las
> seis escrituras fallaron por otro motivo—, así que nada dependía de ella.
> Queda quemada y sustituida. La lección operativa: **no se imprime el cuerpo de
> una respuesta a una petición que llevaba un secreto**, porque el valor puede
> volver reflejado en el mensaje de validación.

### 2.3 Comprobado con actores QA controlados

El instrumento es el del propio proyecto: `production-ready.mjs`, que no crea,
no escribe y no encola nada. **18 comprobaciones, todas verdes**, incluidas las
tres que importan:

- Círculos **no está cerrado**: la superficie de invitado responde
  `401 CIRCLE_GUEST_SESSION_INVALID` y no `503 CIRCLES_UNAVAILABLE` — juzga la
  sesión por sus méritos, no por su existencia. Bajo `off`, ésta es exactamente
  la que falla.
- Una llamada directa a una ruta reservada al BFF se rechaza sin atestación
  (**403**), **y la atestación de la propia Web sí la acepta la API** — es
  decir, los secretos concuerdan de punta a punta, no sólo por hash.
- La vista previa pública de la plantilla aprobada se sirve con su título
  aprobado, y la política CSP lleva un nonce **distinto en cada petición**.

El script dice que lo único que no puede comprobar es un organizador
autorizado entrando y creando, «porque eso necesita su contraseña». Esa parte
**sí se hizo**, con la cuenta sintética cuyo id es el único de la allowlist:

| Paso                      | Resultado                                           |
| ------------------------- | --------------------------------------------------- |
| `GET /api/circles/access` | `available: true`, `canCreateGroups: false`         |
| `POST /api/circles/duo`   | **201** · circleId + activityId                     |
| Leer la actividad         | `INVITING` · título aprobado · seguimiento al 13-11 |
| Organizador / contraparte | `ACCEPTED` / `INVITED`                              |
| Retirarla                 | `CANCELLED` / `WITHDRAWN`                           |

`canCreateGroups: false` es correcto: los grupos tienen su propio interruptor y
siguen cerrados. La actividad sintética se retiró; staging queda limpio.

### 2.4 Lo que sigue pendiente, y no es configuración

**La única entrada productiva del Dúo cuelga de una superficie que no se puede
empezar.** La elegibilidad mapea `eec-c1-cuerpo-antes-que-mente@1` →
`duo-lo-que-me-ayuda@2`, y ese pin de guía está marcado
`RETIRED_FOR_NEW_STARTS`: `discovery` lo sirve con `startable: false` y
`POST /guide/sessions` responde **410** (hoy 503, porque el rollout del guía
estaba cerrado y lo tapa).

El CTA **sí** aparece —`DuoEntryPoint` resuelve del catálogo y nunca toca una
`GuideSession`—, así que un lector puede iniciar un Dúo desde una página cuya
acción principal no está disponible. **No es un defecto de Círculos ni de
configuración: es una incoherencia editorial**, y se resuelve publicando una
entrada de elegibilidad hacia una de las cinco microguías vivas de C01, que es
una decisión con su propia aprobación.

Los datos del entorno anterior **no se tocaron**: ni se borraron ni se migraron.
Conservar información no exige conservar una dependencia operativa, y borrar por
inferencia es lo que no se hace.

---

## 3 · El ensayo de recuperación

### 3.1 El hallazgo: el respaldo no se podía alcanzar sin el servidor

Las credenciales del destino de respaldo vivían **únicamente dentro de Coolify,
en el VPS** — y cifradas con el `APP_KEY` de Coolify, que vive en la misma caja.
**Dos dependencias circulares encadenadas:** en el único escenario para el que
existe un respaldo fuera del servidor —perder el servidor— no había forma de
llegar a él.

Esto no se deduce de una ausencia. Se comprobó: las credenciales viven en
`s3_storages` (fila 2, bucket `syntavera-feelverse-db-backups`), con `key` y
`secret` como blobs cifrados de Laravel; y el único fichero de credenciales S3
fuera de la caja pertenece a **otro proyecto** del servidor, fuera de este
encargo.

**Corregido hoy:** extraídas a un fichero 0600 fuera del repositorio,
canalizando la salida directamente al fichero para que los valores no pasaran
por ningún mensaje ni registro.

> El fichero declara su propio límite: resuelve «el servidor no arranca», **no**
> «se pierden el servidor y este portátil». Una tercera copia es una decisión
> aparte. Y son las credenciales de escritura, así que permiten borrar: si
> Cloudflare admite un par de sólo lectura para ese bucket, sería estrictamente
> mejor.

### 3.2 El respaldo se alcanza, y además se restaura

Desde el Mac, **sin pasar por el VPS** (firmando SigV4 con la biblioteca
estándar, porque esta máquina no tiene ni AWS CLI ni boto3):

| Qué                   | Resultado                                                   |
| --------------------- | ----------------------------------------------------------- |
| Listar el bucket      | **13 objetos**, del 24-10 al 06-11                          |
| Bajar el más reciente | 1 226 705 bytes · `PostgreSQL custom database dump v1.16-0` |
| `pg_restore`          | **rc=0, cero errores**, sobre una base desechable local     |

Que un objeto esté en R2 y que alguien **pueda bajarlo y restaurarlo** son
afirmaciones distintas. La segunda es la que sirve el día malo, y ahora está
comprobada.

> **Una corrección de método que conviene escribir.** El primer `pg_restore`
> dio 691 errores de «ya existe» sobre una base recién creada. No era el
> respaldo: mi arnés lo ejecutó **dos veces**. El primer intento usaba
> `${PIPESTATUS[0]}`, que es de bash, y `sh` es dash — pero dash evalúa esa
> sustitución **después** de correr la tubería, así que la restauración ya había
> terminado cuando el shell murió. Repetido sobre una base recreada: rc=0.

Y el contenido es el del producto, contrastado contra hechos **conocidos**:

| Comprobación                           | Esperado                   | Medido      |
| -------------------------------------- | -------------------------- | ----------- |
| Migraciones aplicadas / fallidas       | 71 / 0 (como el gate)      | **71 / 0**  |
| Bloques con marcas de énfasis          | 732 (reparación del 26-10) | **732**     |
| Bloques con asteriscos crudos          | 2 (los excluidos)          | **2**       |
| _Familias ensambladas_ publicada       | no (reparación del 24-10)  | **no**      |
| Columna de texto en claro en el Diario | ninguna                    | **ninguna** |
| Tablas de Círculos                     | presentes                  | **11**      |

El volcado y el contenedor se eliminaron al terminar: llevaba datos de personas,
aunque cifrados.

### 3.3 Qué se perdería de verdad con la caja

De las 40 variables de la API, clasificadas por lo que cuesta perderlas:

| Clase                           | Cuántas | Nota                                                     |
| ------------------------------- | ------: | -------------------------------------------------------- |
| **Irrecuperable y destructivo** |   **3** | `CIRCLES_SHARED_DATA_KEY_V1`, `VAPID_PRIVATE/PUBLIC_KEY` |
| Regenerable, con coste conocido |       4 | `JWT_SECRET`, `CLIENT_ATTESTATION_SECRET`, dos URLs      |
| Recuperable del proveedor       |      12 | Stripe, Anthropic, OpenAI, R2, Voyage                    |
| Configuración, no secreto       |      21 | banderas, modos, orígenes                                |

**Las tres destructivas tienen hoy copia fuera de la caja, y se verificó que son
las que corren** (comparación por hash: VAPID pública y privada coinciden, y la
clave de Círculos también).

Importa por qué sólo esas tres: perder `CIRCLES_SHARED_DATA_KEY_V1` dejaría cada
sobre de Círculos **ilegible para siempre**, y perder la privada de VAPID
invalidaría toda suscripción de push existente. Las demás se vuelven a emitir.
Y el cifrado del Diario **no** está en esta lista a propósito: su clave se
deriva de la contraseña de cada persona con su sal, que viaja en la base — así
que sobrevive a la pérdida del servidor mientras sobreviva el respaldo.

### 3.4 Lo que el ensayo todavía NO demuestra

Levantar los servicios en una caja nueva: provisionar un host, instalar Coolify,
recrear los tres recursos y restaurar ese volcado. Eso necesita un host, y la
propuesta concreta está en §6.

El nivel 4 ya no es, sin embargo, lo que era esta mañana. Su cimiento —poder
alcanzar y restaurar la copia sin el servidor— estaba **roto** y ahora está
comprobado.

---

## 4 · El remitente del correo, antes de que llegue la clave (#824)

`EMAIL_FROM` tenía como valor por defecto `no-reply@psico.app`. No es el dominio
del producto, y el repositorio ya había sido corregido de esa identidad dos
veces.

Importa más que un nombre porque un remitente por defecto **sólo se ejercita
cuando alguien olvidó elegir uno**, y ese olvido no dejaba rastro:
`RESEND_API_KEY` se lee como configurada, el arranque no decía nada, el informe
tampoco — y cada mensaje saldría reclamando un dominio que nadie verificó.
Resend rechaza eso, **así que la primera prueba de una clave recién llegada
habría fallado por esto y habría parecido una clave mala**.

Ahora el default nombra nuestro dominio, y `GET /api/health/integrations` gana
`resendFrom`, que distingue **elegido** de **por defecto**. La caja no puede
saber qué dominios están verificados en Resend; sí puede saber que nadie eligió
uno, que es la mitad accionable. La lista de arranque lo nombra **sólo cuando
hay clave**, porque sin clave no sale ningún correo.

Verificado por mutación: 4 + 1 + 2 pruebas mueren según lo que se revierta.

---

## 5 · El modo guiado, y por qué las cinco microguías no se veían

`GUIDE_ROLLOUT_MODE` estaba en `off`, que es lo que mantenía el modo guiado en
`NOT_AVAILABLE` y dejaba **sin verificar** si las cinco microguías de C01 se
ejecutan. Lo que faltaba para comprobarlo era una cuenta sintética, para no
escribir progreso en una cuenta personal. Ya existe.

Puesto en `pilot` con **sólo** el id de QA en la allowlist: para cualquier otra
persona el modo guiado sigue cerrado. El orden volvió a importar — con la lista
vacía, el resolutor del guía **lanza al arrancar**, a diferencia del de
Círculos, que cae a `off`.

### El hallazgo: no era el rollout, y no es editorial

Con el rollout abierto, el capítulo 1 seguía respondiendo «no disponible».
El endpoint **no dice por qué** a propósito —tiene cinco causas posibles y
distinguirlas lo convertiría en un oráculo—, así que se acotó por comparación en
vez de por conjetura:

| Capítulo | Respuesta                                                      |
| -------- | -------------------------------------------------------------- |
| 1        | `available: false`                                             |
| **2**    | `available: true` · `eec-c2-universal-no-significa-uniforme@1` |
| 3        | `available: false`                                             |
| **4**    | `available: true` · `eec-c4-cuerpo-datos-no-veredictos@1`      |

Mismo rollout, mismo usuario, mismo plan. Así que no era el rollout, ni la
cuenta, ni la elegibilidad. La causa está en
`guide-discovery-catalog.ts:327`: un **interruptor de seguridad con nombre**,
`EEC_C01_GUIDED_SUITE_V1`, cuyo valor por defecto es `false` y que no estaba
puesto en staging. Gatea **sólo la oferta**: las definiciones siguen
registradas y una sesión ya fijada resuelve sin preguntar.

Esto corrige dos veces la misma línea del inventario y de este propio archivo.
«Las cinco microguías están sin publicar» es falso —están las cinco en
`PRODUCTION_GUIDE_DISCOVERY_ENTRIES`, con título, descripción y duración—, y
«lo que pedían era el rollout» también lo es: el rollout era necesario y no
suficiente. **Lo que las retenía era una variable de entorno con nombre
propio**, y no hay ninguna decisión editorial en el camino.

---

## 6 · Lo que falta y lo que cuesta

### El ensayo del nivel 4 — propuesta concreta

|                             |                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Recurso**                 | Un VPS de OVH temporal, equivalente al actual                                                                                              |
| **Finalidad**               | Provisionar, instalar Coolify, recrear los tres recursos desde el inventario y restaurar el volcado                                        |
| **Coste y duración**        | El de un VPS prorrateado unas horas; se destruye al terminar                                                                               |
| **Qué quedaría demostrado** | El nivel 4 completo: de «se perdió el servidor» a «la aplicación responde con los datos de ayer»                                           |
| **Mientras se habilita**    | Ya está hecho lo que no lo necesitaba: alcanzar la copia, restaurarla, verificar su contenido y poner a salvo las tres claves destructivas |

### Integraciones

|                    | Estado                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Resend**         | **Ninguna credencial autorizada existe en el almacén de ops.** Preparado todo lo demás (§4) |
| `SENTRY_DSN`       | ausente — sin él, un fallo del piloto se investiga a ciegas                                 |
| `GOOGLE_CLIENT_ID` | ausente — sin clave el producto no ofrece el botón, que es un estado honesto                |
| Push web           | **configurado y desplegado**; la entrega real sigue pendiente de un permiso de navegador    |

**La propuesta de Resend**, concreta:

1. **Dominio y remitente:** `feelverse.app` verificado en Resend (sus registros
   DNS), remitente `no-reply@feelverse.app`. `APP_URL` ya apunta a
   `https://staging.feelverse.app`, así que los enlaces del correo caerían
   donde deben.
2. **Destino QA:** hace falta un buzón **real** autorizado. Las cuentas de QA
   usan `@psico.test`, que por diseño (RFC 2606) no puede recibir nada: sirven
   para todo menos para esto.
3. **El recorrido que se verificará**, en este orden y sin saltarse ninguno:
   recepción real del correo → apertura del enlace → finalización del
   restablecimiento → **acceso posterior con la contraseña nueva**.
4. **Antes de activar envíos**, staging queda limitado a ese destino: no se
   alteran las preferencias de ninguna cuenta real para facilitar la prueba.

### Un dato menor del respaldo, que conviene no idealizar

En el listado falta el **29 de octubre**: del 28 se salta al 30. Doce de trece
días consecutivos están, así que «diario y activo» es cierto — pero no es «todos
los días sin excepción», y la diferencia importa el día que se quiera restaurar
precisamente ese.

---

## 7 · Límites

Producción **no se tocó**, y sigue sin existir como recurso. Cero cobros, cero
publicaciones editoriales, cero llamadas facturables al modelo.

Ningún proyecto, base, dominio, variable ni cuenta de las plataformas retiradas
se eliminó.

La cuenta usada es sintética `@psico.test` y su contraseña se leyó por entorno,
sin imprimirla. La actividad de Círculos que se creó para comprobar el recorrido
se retiró al terminar.

**Esto no es una aceptación estética.** Lo de hoy es configuración, recorridos
funcionales y recuperación; la revisión visual con sesión del 05-11 se conserva
tal cual.
