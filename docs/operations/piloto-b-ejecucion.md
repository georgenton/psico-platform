# Piloto B — cómo se ejecuta cuando exista la aprobación

> **Esto no es la decisión; es el procedimiento.** La propuesta vive en
> [piloto-minimo.md §8](../product/piloto-minimo.md) y **sigue pendiente de una
> aprobación expresa de Jorge**. Este documento existe para que, el día que esa
> aprobación llegue, no haya que inventar nada: cada paso está escrito, con lo
> que hay que comprobar después de darlo.
>
> Corte del **2026-11-18**, con la configuración leída del artefacto servido.
>
> **Lo que este documento NO hace:** no amplía el padrón, no nombra a ninguna
> persona, no envía ninguna invitación y no autoriza nada. Aquí no se escribe
> ninguna identidad.

---

## 0 · El estado desde el que se parte, comprobado

Leído del contenedor que sirve hoy (`85ab7c86`):

| Variable                  | Valor                      | Dónde vive           |
| ------------------------- | -------------------------- | -------------------- |
| `GUIDE_ROLLOUT_MODE`      | `pilot`                    | **API** y **worker** |
| `GUIDE_PILOT_USER_IDS`    | **1 id** (la cuenta de QA) | **sólo la API**      |
| `EEC_C01_GUIDED_SUITE_V1` | `on`                       | **sólo la API**      |
| `EMAIL_ALLOWLIST`         | **ausente**                | **API** y **worker** |

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

**Y la precondición que no se negocia:** B puede aprobarse antes de que el
correo funcione, pero **la primera invitación y la entrada de una persona real
esperan el recorrido de recuperación por correo completado**. Sin eso, quien
olvide su contraseña pierde su cuenta y nadie puede devolvérsela.

**Lo que una prueba con la bandeja de QA SÍ acredita, y lo que NO.** Que el
transporte funciona, que el dominio está verificado y que el recorrido de
restablecimiento cierra. **No** habilita el correo de otra persona: la guarda
restringe por destinatario, así que una dirección que no esté en la lista
simplemente no recibe —ni la verificación de su cuenta, ni el enlace para
recuperarla—. Cada participante necesita su propia entrada.

---

## 1 · La secuencia completa, de siete pasos

El orden no es una preferencia: **el correo va antes del registro** porque al
registrarse se dispara el correo de verificación de su cuenta
(`auth.service.ts` lo lanza dentro de `register`). Si su dirección no está
autorizada todavía, ese mensaje se retiene y ella se queda con una cuenta sin
verificar y sin saber por qué.

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

Desplegar **API y worker**, y luego comprobar las dos cosas que importan:

```
GET /api/health/integrations   → mailRecipients.mode = "allowlisted"
                                 mailRecipients.recipients = <cuántas>
```

El informe **cuenta** las entradas y nunca las enumera. Y en el arranque de los
dos procesos tiene que leerse `[correo] restringido a N destinatario(s)`; si
dice `RETENIDO` la lista no llegó, y si dice `BLOQUEADO` hay una errata.

**Lo que ese número NO dice es cuál.** `recipients: 1` acredita que la guarda
restringe, no que restrinja a la dirección correcta — y no puede: enumerarlas
convertiría un informe que lee cualquier ADMIN en una lista de direcciones. La
dirección exacta se confirma releyendo el valor en el panel antes de desplegar,
y queda demostrada cuando un mensaje **llega** a esa bandeja. Con una sola
entrada, un error aquí no manda correo a quien no debe: manda correo a nadie y
la persona se queda sin verificar.

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

| Qué                            | Cómo                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canal**                      | el directo que ya usen con Jorge. **Ninguna herramienta nueva**, ningún formulario, ningún correo automático                                                                  |
| **Qué se le dice antes**       | que es un entorno de pruebas, que puede fallar, que avisar de un fallo es justo lo que se le pide, y que **guarde las palabras de respaldo** del diario al crearlas           |
| **Qué se mira**                | las seis señales del §8.5 del piloto: si vuelve sola, dónde se para, qué hace con la microguía, si escribe, qué dice del Mapa, y qué no entendió — con sus palabras           |
| **Qué NO se mira**             | nada automático. Sin `SENTRY_DSN` no hay traza, y el **Mapa Emocional no sirve como telemetría del piloto**: mide lo que ella reporta de sí misma, no si el producto funciona |
| **Si encuentra algo del §6.3** | se detiene **antes** de arreglarlo                                                                                                                                            |

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
> de volver a entrar** si olvida la contraseña. Nadie puede devolvérsela: su
> diario está cifrado con una clave derivada de ese password.
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
