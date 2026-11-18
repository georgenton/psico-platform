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

**Consecuencia operativa:** incorporar a alguien es **añadir un id a una lista
que ya existe**, en un modo que ya está puesto, y **redespliega un solo
servicio** — la API. Ni cambiar de modo, ni tocar el interruptor de C01, ni
desplegar la Web ni el worker.

**Y la precondición que no se negocia:** B puede aprobarse antes de que el
correo funcione, pero **la primera invitación y la entrada de una persona real
esperan el recorrido de recuperación por correo completado**. Sin eso, quien
olvide su contraseña pierde su cuenta y nadie puede devolvérsela.

---

## 1 · Cómo se identifica a cada persona, después de su registro

**El padrón identifica por `id` de servidor, no por correo.** El resolutor lo
dice en su propio comentario: «server-side user ids only: no email, no token»,
y valida cada entrada contra `^[A-Za-z0-9_-]{1,128}$`. Así que **el id no existe
hasta que ella se registra**, y de ahí sale el orden de los pasos:

1. Ella se registra en `staging.feelverse.app/register`, con su correo y una
   contraseña que elige. Entra como **FREE**, sin rol promovido.
2. Nos dice que ya está. En ese momento **lee y navega como cualquiera**: la
   biblioteca, el libro, el diario. Lo único que no ve todavía es la pestaña
   guiada.
3. Se obtiene su `id` a partir del correo que ella usó.

**El hueco entre 1 y 3 es deliberado**, y conviene decírselo a ella: es el
precio de identificarla por quien es y no por lo que escriba en un formulario.

### Obtener el `id` sin sacar su correo de donde está

El correo lo aporta Jorge por el canal directo y **no se escribe en el
repositorio, en Notion ni en ningún informe**. La consulta corre dentro del
contenedor, en **sólo lectura**, y devuelve **únicamente el id**:

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

## 2 · Cómo se incorpora su acceso

1. **Leer el padrón actual**, para **añadir y no sustituir**. Se lee del
   contenedor de la API (`GUIDE_PILOT_USER_IDS`). Son ids, no secretos, pero no
   hace falta dejarlos escritos en ningún sitio permanente.
2. **Escribir la lista completa** —los ids de antes **más** el nuevo, separados
   por comas y sin espacios— en `GUIDE_PILOT_USER_IDS`, en el panel de Coolify,
   en el recurso de la **API únicamente**.
3. **Desplegar la API.** Sólo la API: el worker no lee esa lista y la Web no
   participa.

**Qué comprobar después, con su propia sesión:**

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

| Nivel                        | Qué se hace                          | A quién afecta       | Servicio a desplegar |
| ---------------------------- | ------------------------------------ | -------------------- | -------------------- |
| **Retirar a una persona**    | sale su id de `GUIDE_PILOT_USER_IDS` | sólo a ella          | **sólo la API**      |
| **Cerrar el acompañamiento** | `GUIDE_ROLLOUT_MODE=off`             | a todos, QA incluida | **API y worker**     |
| **Cerrar el piloto entero**  | lo anterior, y se habla con ella     | a todos              | ídem                 |

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
