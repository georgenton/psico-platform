# Piloto B — cómo se ejecuta cuando exista la aprobación

> **Esto no es la decisión; es el procedimiento.** La propuesta vive en
> [piloto-minimo.md §8](../product/piloto-minimo.md) y **sigue pendiente de una
> aprobación expresa de Jorge**. Este documento existe para que, el día que esa
> aprobación llegue, no haya que inventar nada: cada paso está escrito, con lo
> que hay que comprobar después de darlo.
>
> Corte del **2026-11-18**, con el frente de correo actualizado el **2026-11-19**
> y la configuración leída del artefacto servido.
>
> **Lo que este documento NO hace:** no amplía el padrón, no nombra a ninguna
> persona, no envía ninguna invitación y no autoriza nada. Aquí no se escribe
> ninguna identidad.

---

## 0 · El estado desde el que se parte, comprobado

Las tres variables del guía, leídas del contenedor que servía el 18-11
(`85ab7c86`); las de correo, del corte del 19-11:

| Variable                  | Valor                                      | Dónde vive           |
| ------------------------- | ------------------------------------------ | -------------------- |
| `GUIDE_ROLLOUT_MODE`      | `pilot`                                    | **API** y **worker** |
| `GUIDE_PILOT_USER_IDS`    | **1 id** (la cuenta de QA)                 | **sólo la API**      |
| `EEC_C01_GUIDED_SUITE_V1` | `on`                                       | **sólo la API**      |
| `RESEND_API_KEY`          | **presente** desde el 19-11                | **API** y **worker** |
| `EMAIL_FROM`              | `no-reply@feelverse.app`                   | **API** y **worker** |
| `EMAIL_ALLOWLIST`         | **1 entrada**: la bandeja autorizada de QA | **API** y **worker** |

**Incorporar a una persona son DOS cosas distintas**, y conviene no colapsarlas
porque viven en sitios distintos y se aplican en momentos distintos:

| Qué se incorpora                 | Dónde                  | Servicios a desplegar |
| -------------------------------- | ---------------------- | --------------------- |
| su **dirección** de correo       | `EMAIL_ALLOWLIST`      | **API y worker**      |
| su **identificador** de servidor | `GUIDE_PILOT_USER_IDS` | **sólo la API**       |

El «sólo la API» de este documento describe **el cambio del padrón del guía**.
No describe la incorporación completa: cuando además cambia la configuración
del correo —que es siempre, para una persona nueva— se despliegan **los dos**,
porque el worker es quien manda el digest semanal y quien procesa la cola de
correo. Decir «sólo la API» de todo el procedimiento dejaría al worker con una
lista de destinatarios anterior, y el correo que él manda es justo el que
nadie pidió.

### ✅ La precondición de correo se cumplió el 19-11

Este apartado decía que **la primera invitación y la entrada de una persona real
esperaban el recorrido de recuperación por correo completado**. **Ese recorrido
está completado**: el 19-11 se cerró de punta a punta contra la bandeja
autorizada —correo recibido en bandeja principal, contraseña nueva **204**,
acceso con ella en sesión limpia **200**, enlace ya usado **410** y contraseña
anterior **401**—, y el propietario lo aceptó. El motivo por el que esa
precondición existía sigue siendo cierto y por eso se conserva escrito: sin ese
recorrido, quien olvida su contraseña pierde el acceso a su cuenta y nadie puede
devolvérselo.

**Lo que queda de verdad son dos cosas, y ninguna es técnica:**

| Qué                                        | De quién                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **La aprobación de B**                     | Jorge — la propuesta entera está en [piloto-minimo.md §8](../product/piloto-minimo.md)         |
| **La autorización de la persona concreta** | Jorge — su consentimiento y su **dirección exacta**, que es el paso 1 de la secuencia de abajo |

> ### ⚠️ La prueba con QA NO autoriza el correo de otro destinatario
>
> Es el error más fácil de cometer al leer un frente que acaba de cerrarse, así
> que conviene decirlo entero.
>
> **Lo que el recorrido del 19-11 SÍ acredita:** que el transporte funciona, que
> el dominio está verificado por el proveedor, que el mensaje aterriza en bandeja
> principal y que el restablecimiento cierra — **para `qa@syntavera.dev`**.
>
> **Lo que NO acredita:** nada sobre ninguna otra dirección. La guarda restringe
> por **destinatario exacto**, hasta el punto de que la misma dirección con una
> letra cambiada da `NO SALE` (medido). Una dirección que no esté en la lista
> **simplemente no recibe** — ni la verificación de su cuenta, ni el enlace para
> recuperarla, ni el aviso de su exportación.
>
> Así que **cada participante necesita su propia entrada** en `EMAIL_ALLOWLIST`,
> en **API y worker**, **conservando** las anteriores. Es el paso 2 de la
> secuencia, y vuelve con cada persona.

---

## 1 · La secuencia completa, de siete pasos

El orden no es una preferencia: **el correo va antes del registro** porque al
registrarse se dispara el correo de verificación de su cuenta
(`auth.service.ts` lo lanza dentro de `register`). Si su dirección no está
autorizada todavía, ese mensaje se retiene y ella se queda con una cuenta sin
verificar y sin saber por qué.

> **Y no hay vuelta atrás barata**, que es lo que convierte ese orden en una
> regla y no en una recomendación: `sendVerificationEmail` **sólo** se dispara
> desde `register()`, así que **no existe reemisión** —ni por pantalla ni por
> API—. Una cuenta dada de alta sin su dirección autorizada se queda sin
> verificar y hay que **rehacerla**. Pasó el 19-11 con una cuenta de prueba,
> porque la actualización progresiva aún servía el contenedor anterior: de ahí
> que el paso 3 exija comprobar **qué imagen está sirviendo de verdad** antes de
> seguir, y no fiarse de que el despliegue diga «terminado».

**El padrón, en cambio, va después del registro**, y tampoco por gusto:
identifica por `id` de servidor —el resolutor lo dice en su propio comentario,
«server-side ids only: no email, no token», y valida contra
`^[A-Za-z0-9_-]{1,128}$`— y ese id **no existe hasta que ella se registra**.

| #   | Paso                                                                      | Quién   | Dónde                                    |
| --- | ------------------------------------------------------------------------- | ------- | ---------------------------------------- |
| 1   | Su **autorización** y su **dirección exacta** para el correo de su cuenta | Jorge   | canal directo                            |
| 2   | Añadir esa dirección a `EMAIL_ALLOWLIST`, **conservando** las previas     | nuestro | Coolify · **API y worker**               |
| 3   | Aplicar y **comprobar la configuración efectiva** antes del registro      | nuestro | despliegue + arranque + informe de salud |
| 4   | Ella se **registra** por el flujo normal                                  | ella    | `staging.feelverse.app/register`         |
| 5   | Obtener su **identificador** de servidor                                  | nuestro | consulta de sólo lectura                 |
| 6   | Añadir ese id a `GUIDE_PILOT_USER_IDS`                                    | nuestro | Coolify · **sólo la API**                |
| 7   | **Comprobar el alcance** obtenido, con sus controles contrarios           | nuestro | su sesión + una cuenta de fuera          |

### Paso 1 · Su autorización y su dirección

Lo que se le pide es explícito: una dirección a la que podamos escribirle **las
comunicaciones necesarias de su cuenta** —verificar el correo, restablecer la
contraseña, su exportación si la pide— y, si lo quiere, el digest semanal, que
es opcional y se apaga desde su perfil.

El correo lo aporta Jorge por el canal directo. **No se escribe en el
repositorio, en Notion ni en ningún informe**, y no se deduce de ningún sitio.

### Paso 2 · Su dirección en la lista, sin borrar las que ya estaban

```bash
# PRIMERO se lee la lista actual, porque esto AÑADE y no sustituye. Quitar sin
# querer la bandeja de QA dejaría sin correo el recorrido que acredita que el
# transporte funciona, y nadie se enteraría hasta que alguien lo necesitara.
#
# Se escribe en los DOS recursos: API y worker.
EMAIL_ALLOWLIST=<las previas>,<su dirección exacta>
```

**Direcciones completas, no el dominio.** `alguien@dominio.com` autoriza a una
persona; `@dominio.com` autoriza a todo el dominio, y en un piloto de tres eso
es más alcance del necesario. Un dominio suelto (`dominio.com`) se **rechaza** a
propósito, y una lista con valor y sin nada utilizable **no abre nada en ningún
entorno** — el arranque lo dice con la palabra `BLOQUEADO`.

### Paso 3 · Comprobar que la configuración está efectiva ANTES del registro

Desplegar **API y worker**, **confirmar qué imagen está sirviendo cada
contenedor** —no la que el despliegue dice haber terminado: son dos instantes
distintos y el 19-11 no coincidieron— y luego comprobar **tres** cosas. Las dos
primeras son el estado general:

```
GET /api/health/integrations   → mailRecipients.mode = "allowlisted"
                                 mailRecipients.recipients = <cuántas>
```

El informe **cuenta** las entradas y nunca las enumera. Y en el arranque de los
dos procesos tiene que leerse `[correo] restringido a N destinatario(s)`; si
dice `RETENIDO` la lista no llegó, y si dice `BLOQUEADO` hay una errata.

**Pero ninguna de las dos dice CUÁL**, y eso no es un detalle: `recipients: 1`
sale **idéntico** con la dirección correcta y con una errata de una letra que
produzca otra dirección válida. Medido en el contenedor real, lista de una
entrada, `membresla` por `membresia`:

| Lo que se consulta       | Dirección correcta              | Errata de una letra                     |
| ------------------------ | ------------------------------- | --------------------------------------- |
| informe de salud         | `mode=allowlisted recipients=1` | `mode=allowlisted recipients=1` ← igual |
| la comprobación de abajo | `SÍ SALE (allowlisted)`         | **`NO SALE (not-allowlisted)`**         |

Así que la tercera comprobación es **la pertenencia de la dirección exacta, en
los dos procesos**. No se reimplementa la regla: se le pregunta a la **guarda
compilada del propio contenedor**, la misma que decide el envío, así que no
puede discrepar con ella.

```bash
printf '%s' "$DIRECCION" | sudo docker exec -i <contenedor> sh -lc \
  'cd /app/apps/api && /mise/installs/node/20/bin/node scripts/check-mail-recipient.cjs'
```

Con los **dos** contenedores, el de la API y el del worker — el digest semanal
lo manda el worker, así que una lista que sólo llegó a uno deja medio correo
restringido y medio retenido. Salida esperada:
`estado=usable entradas=N entorno=staging → SÍ SALE (allowlisted)`, código 0.

La dirección entra por **stdin**, no por argumento: no queda en el historial
del shell ni la ve un `ps`. La salida es un veredicto — no imprime la
dirección, ni el valor de la lista, ni sus entradas.

**Lo que esto acredita, y lo que sigue sin acreditar.** El proveedor acepta el
dominio y un mensaje llega: las dos cosas quedaron demostradas el 19-11 contra
la bandeja de QA, con el recorrido completo
([runbook §2.5.1](../deploy/coolify-runbook.md)). Lo que esta comprobación añade
para **una dirección nueva** es lo único que falta saber de ella: que la guarda
la dejaría salir. Que su buzón concreto la reciba y no la mande a correo no
deseado es una pregunta de su proveedor, y se mira con el mensaje delante.

**El guion viaja en la imagen** (`apps/api/scripts/check-mail-recipient.cjs`), y
lo llevan los dos contenedores — ya está en el artefacto servido desde el
despliegue del 19-11, así que no hay que esperar a nada para usarlo. El
despliegue de este paso sigue siendo obligatorio de todas formas, porque sin él
la entrada nueva de la lista no surte efecto.

**No se sigue al paso 4 sin esto.** Es el paso cuya omisión produce el fallo
silencioso: ella se registra, no le llega nada, y el síntoma aparece una semana
más tarde cuando intente recuperar la contraseña.

### Paso 4 · Se registra por el flujo normal

En `staging.feelverse.app/register`, con su correo y una contraseña que elige
ella. Entra como **FREE**, sin rol promovido. En ese momento **lee y navega
como cualquiera**: la biblioteca, el libro, el diario. Lo único que no ve
todavía es la pestaña guiada.

Nos dice que ya está. **El hueco entre el paso 4 y el 6 es deliberado**, y
conviene decírselo: es el precio de identificarla por quien es y no por lo que
escriba en un formulario.

### Paso 5 · Obtener el `id` sin sacar su correo de donde está

La consulta corre dentro del contenedor, en **sólo lectura**, y devuelve **únicamente el id**:

```bash
# Dentro del contenedor de la API. `BEGIN READ ONLY` es la salvaguarda: si la
# consulta intentara escribir, PostgreSQL la rechaza.
#
# El correo se pasa por variable de entorno del propio comando, no por el
# historial del fichero: así no queda escrito en ningún sitio del repositorio.
sudo -n docker exec -e Q="<el correo>" <contenedor-api> sh -c '
  cd /app/apps/api && NODE_PATH=./node_modules node -e "
    const {Client}=require(\"pg\");
    (async()=>{
      const c=new Client({connectionString:process.env.DATABASE_URL});
      await c.connect(); await c.query(\"BEGIN READ ONLY\");
      const r=await c.query(\"select id from \\\"User\\\" where lower(email)=lower(\$1)\",[process.env.Q]);
      console.log(r.rows.length===1 ? r.rows[0].id : \"NO ENCONTRADA o AMBIGUA: \"+r.rows.length);
      await c.query(\"ROLLBACK\"); await c.end();
    })();
  "'
```

**Qué comprobar antes de seguir:** que devuelve **exactamente un** id. Si dice
`NO ENCONTRADA`, todavía no se registró o el correo no coincide; si dice `2` o
más, hay que resolverlo antes de tocar nada.

---

## 2 · Pasos 6 y 7 · su acceso al recorrido, y qué se comprueba

### Paso 6 · Su identificador en el padrón

1. **Leer el padrón actual**, para **añadir y no sustituir**. Se lee del
   contenedor de la API (`GUIDE_PILOT_USER_IDS`). Son ids, no secretos, pero no
   hace falta dejarlos escritos en ningún sitio permanente.
2. **Escribir la lista completa** —los ids de antes **más** el nuevo, separados
   por comas y sin espacios— en `GUIDE_PILOT_USER_IDS`, en el panel de Coolify,
   en el recurso de la **API únicamente**.
3. **Desplegar la API.** Sólo la API: el worker no lee esa lista y la Web no
   participa.

**Y aquí «sólo la API» sí es literal**, a diferencia del paso 2. Son dos
despliegues distintos en la secuencia, y el de arriba era de los dos
servicios; si se juntan en uno, se despliegan los dos.

### Paso 7 · Comprobar el alcance obtenido

Con su propia sesión:

```
GET /api/guide/availability     → available: true
```

Y en pantalla: abre el capítulo 1 de _Emociones en Construcción_ y **la pestaña
guiada aparece**, con las cinco microguías numeradas.

**Dos controles que conviene no saltarse**, porque distinguen «funciona» de
«funciona para ella y sólo para ella»:

- una cuenta **fuera** del padrón sigue recibiendo `available: false`, **503
  `GUIDE_UNAVAILABLE`** al iniciar y **404** en `/experiences/mine`;
- la obra **retirada** sigue dando `available: false` también para ella. El
  guard «never substitutes for entitlement»: entrar al padrón no da contenido.

### Si el arranque se niega

La lista valida al arrancar y falla **cerrado** con un código sin valores:
`GUIDE_PILOT_ALLOWLIST_INVALID` para un duplicado, un segmento vacío, un
espacio interno, un correo en vez de un id, o más de 500 entradas. El mensaje
**no lleva ningún id dentro**, a propósito. Se corrige el valor y se vuelve a
desplegar.

---

## 3 · Cómo se la acompaña

| Qué                            | Cómo                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canal**                      | el directo que ya usen con Jorge. **Ninguna herramienta nueva**, ningún formulario, ningún correo automático **de soporte** — los que sí le llegan son los de su cuenta y, si lo quiere, el digest semanal                                                                  |
| **Qué se le dice antes**       | que es un entorno de pruebas, que puede fallar, que avisar de un fallo es justo lo que se le pide, y que **guarde las palabras de respaldo** del diario al crearlas — con la distinción dicha: el correo recupera **su cuenta**, las palabras recuperan **lo que escribió** |
| **Qué se mira**                | las seis señales del §8.5 del piloto: si vuelve sola, dónde se para, qué hace con la microguía, si escribe, qué dice del Mapa, y qué no entendió — con sus palabras                                                                                                         |
| **Qué NO se mira**             | nada automático. Sin `SENTRY_DSN` no hay traza, y el **Mapa Emocional no sirve como telemetría del piloto**: mide lo que ella reporta de sí misma, no si el producto funciona                                                                                               |
| **Si encuentra algo del §6.3** | se detiene **antes** de arreglarlo                                                                                                                                                                                                                                          |

---

## 4 · Cómo termina su participación

Tres niveles, de menos a más, y **ninguno de los dos primeros toca su cuenta**:

| Nivel                        | Qué se hace                          | A quién afecta       | Servicio a desplegar | Su correo       |
| ---------------------------- | ------------------------------------ | -------------------- | -------------------- | --------------- |
| **Retirar a una persona**    | sale su id de `GUIDE_PILOT_USER_IDS` | sólo a ella          | **sólo la API**      | **se conserva** |
| **Cerrar el acompañamiento** | `GUIDE_ROLLOUT_MODE=off`             | a todos, QA incluida | **API y worker**     | **se conserva** |
| **Cerrar el piloto entero**  | lo anterior, y se habla con ella     | a todos              | ídem                 | **se conserva** |

> ### ⚠️ Su dirección NO sale del correo autorizado
>
> Ninguno de los tres niveles toca `EMAIL_ALLOWLIST`, y es una regla, no un
> descuido. Mientras su cuenta exista, su cuenta tiene que poder recuperarse: si
> su dirección sale de la lista, el enlace de restablecimiento se retiene y ella
> queda con una cuenta viva, con lo que escribió dentro, y **sin ninguna forma
> de volver a entrar** si olvida la contraseña.
>
> Desde que el correo funciona, esa lista **es** su recuperación: su entrada no
> es una cortesía de configuración, es la única pieza que le devuelve el acceso.
> Sacarla de ahí no «reduce su alcance en el piloto» — le quita la recuperación.
>
> **Y son dos recuperaciones distintas**, que conviene no colapsar porque se
> pierden por separado:
>
> | Si pierde…                | lo recupera con…                              | y si no lo tiene…                                                                                |
> | ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
> | el **acceso a su cuenta** | el **correo** de restablecimiento             | nadie puede entrar por ella — de ahí que su dirección no salga de la lista                       |
> | la **clave del diario**   | sus **palabras de respaldo**, que guardó ella | lo que escribió **antes** queda ilegible para siempre; la cuenta sigue y puede escribir de nuevo |
>
> El correo no abre el diario, y las palabras no abren la cuenta. Una contraseña
> nueva deja entrar, pero el contenido cifrado con la anterior sólo vuelve por
> las palabras: nosotros nunca tenemos esa clave (ADR 0007).
>
> Su dirección sale de la lista **sólo** cuando su cuenta se da de baja, y eso
> es un acto que le toca pedir a ella — nunca un efecto secundario de cerrar el
> piloto. El orden, cuando llegue, es al revés que el de la incorporación:
> primero se da de baja la cuenta, después sale la dirección.

**Lo que retirar el acompañamiento NO hace**, y conviene decírselo a ella con
estas palabras: no borra lo que escribió, no interrumpe un recorrido ya
guardado —consultar el propio avance no pasa por este control— y no afecta a su
lectura, que no depende del padrón. La deja **leyendo, con su diario y su
historial intactos**.

**«Retirar el acompañamiento» y «cerrar su cuenta» son cosas distintas.** Dar de
baja una cuenta es un acto que le toca **pedir a ella**, y entonces el producto
ya tiene su propio camino (perfil → eliminar cuenta, con su periodo de
enfriamiento). Nunca es un efecto secundario de cerrar el piloto.

---

## 5 · Las cuatro dimensiones, para no prometer de más

Lo que B abre es **la pantalla de lo que C01 publica**. Las cuatro son distintas
y conviene no decirlas con una frase:

| Dimensión                             | Fuera del padrón                          | En el padrón                                                                |
| ------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| **1 · El catálogo**                   | 50 microguías en el libro mayor en código | las mismas 50: B no añade ni quita catálogo                                 |
| **2 · La oferta de la interfaz**      | pestaña guiada ausente                    | presente **sólo donde hay algo publicado o un recorrido propio** — hoy, C01 |
| **3 · Iniciar una sesión por la API** | **503 `GUIDE_UNAVAILABLE`**               | permitido para cualquiera de las 50, con o sin Experience publicada detrás  |
| **4 · Derechos de lectura por plan**  | lo que diga su plan                       | **lo mismo**                                                                |

---

## 6 · La invitación

Está **redactada y sin enviar** en el §7 del piloto mínimo, junto con las
instrucciones de entrada. **No se envía sin una autorización expresa para ese
envío y ese destinatario**, y la autorización de B no es por sí sola la
autorización de enviar.
