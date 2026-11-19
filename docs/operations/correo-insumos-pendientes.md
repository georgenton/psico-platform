# Correo — qué falta para que alguien recupere su cuenta

> Ficha corta, para decidir en una pantalla. Corte del **2026-11-18**.
>
> El recorrido completo de operación está en
> [runbook §2.5.1](../deploy/coolify-runbook.md); el tramo hasta producción, en
> §4.1 del mismo documento. Esto es sólo el inventario de lo que falta y dónde
> ponerlo.

## 0 · Cuatro preguntas distintas, y conviene no colapsarlas

Lo que se sabe del correo son cuatro cosas separadas, y cada una se acredita con
una fuente distinta. Resumirlas en un «el correo está / no está» fue el error
que esta ficha arrastró dos cortes.

| #   | Pregunta                                                 | Quién la contesta                       | Hoy                                                     |
| --- | -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| 1   | ¿Qué hay publicado en el **DNS** del dominio?            | el DNS público — no necesita credencial | ✅ **comprobado**: no hay nada de Resend                |
| 2   | ¿Qué registros **exactos** pide la cuenta de Resend?     | sólo la cuenta, en su pestaña Records   | ❓ **no comprobado** — no tenemos acceso                |
| 3   | ¿El proveedor marca el dominio **verificado**?           | sólo la cuenta                          | ❓ **no comprobado**                                    |
| 4   | ¿**Llega** un mensaje y se recupera el acceso de verdad? | una entrega real a una bandeja real     | ❌ **no**, y es la única que acredita que esto funciona |

**La 1 no implica la 2.** Que en el DNS no haya nada de Resend demuestra que
**hoy no se puede enviar** desde `@feelverse.app`; **no** demuestra qué hay
dentro de la cuenta. Alguien pudo añadir el dominio y no publicar los registros,
y en ese caso la 2 ya está contestada y nosotros no lo sabemos.

**Y la 3 no implica la 4.** Un dominio verificado dice que el proveedor acepta
firmar nuestros mensajes. Que Resend acepte la petición dice que el mensaje
**salió**. Lo único que acredita el recorrido es que una persona **recibió** el
enlace y **volvió a entrar** con su contraseña nueva.

**Las tres cosas que esta ficha separa a propósito**, porque se confunden con
facilidad: **guarda comprobada** (nuestra, hecha — ver §3), **proveedor
verificado** (de la cuenta, pendiente) y **recepción comprobada** (de una
entrega real, pendiente). Las dos últimas dependen de insumos que no están aquí.

**Por qué importa, en una frase:** hoy, una persona que olvide su contraseña
**no recupera su cuenta**. Crear otra no es recuperarla — el diario de la
primera sigue cifrado donde estaba y la nueva empieza vacía. Es el único
pendiente que bloquea el piloto.

---

## 1 · Qué falta exactamente

Comprobado el 2026-11-17 en **dos** sitios, porque no son equivalentes: la lista
de variables de los tres recursos de Coolify (donde el token de lectura redacta
los valores, así que no distingue «ausente» de «vacía») **y dentro del
contenedor servido**, que sí lo distingue.

| Insumo                          | Estado hoy                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Credencial de Resend**        | **ausente** en API, Web y worker, y ausente dentro del contenedor. Tampoco hay ninguna en el almacén de operaciones                                                         |
| **`feelverse.app` verificado**  | **No comprobado** — lo dice la cuenta de Resend, y no tenemos acceso. Lo que sí está comprobado (18-11, por DNS) es que **hoy no hay publicado ningún registro de envío**   |
| **Una bandeja real autorizada** | **no existe.** El único fichero con «correo» en el nombre del almacén de operaciones es una cuenta de aplicación en `@psico.test`, que por la RFC 2606 **no puede recibir** |
| **Remitente** (`EMAIL_FROM`)    | **ausente**, así que hoy toma el valor por omisión `no-reply@feelverse.app`. El informe de salud delata que nadie lo eligió                                                 |

Los tres primeros son tuyos. El cuarto se resuelve con el segundo: fijarlo a
mano sólo tiene sentido cuando el dominio esté verificado.

> **Dos estados que conviene no confundir, porque uno es un hecho y el otro una
> laguna.** La credencial y la bandeja están **comprobadas ausentes**: busqué
> donde tendrían que estar y no están. Resumirlas junto con el dominio como «las
> tres ausentes» —que es lo que hice el 17-11— convertía un «no lo sé» en un «no
> hay».

### El dominio: lo que el DNS sí acredita, y lo que no

El DNS público es la fuente que mira un servidor que recibe, y no necesita
credencial. Lo que acredita es la **pregunta 1** de arriba: qué hay publicado.
No es «la configuración de Resend» — eso es la pregunta 2, y vive en la cuenta.
Consultado el **2026-11-18**, con control positivo y negativo:

| Nombre consultado                     | Qué hay hoy                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `feelverse.app` TXT (SPF)             | `v=spf1 include:spf.efwd.registrar-servers.com ~all` — **reenvío del registrador**, no Resend |
| `feelverse.app` MX                    | `eforward1…5.registrar-servers.com` — reenvío del registrador                                 |
| `resend._domainkey.feelverse.app` TXT | **sin registro**                                                                              |
| `send.feelverse.app` TXT / MX         | **sin registro**                                                                              |
| `_dmarc.feelverse.app` TXT            | **sin registro**                                                                              |

Las cinco filas de arriba son **las que se consultaron**, elegidas porque son
los nombres que Resend usaba cuando se escribió esto: dos que el dominio ya
tiene (el SPF y los MX del ápice, del registrador) y tres que estarían si
estuviera configurado para enviar. No son «los registros que pide la cuenta»:
eso es la pregunta 2, y sólo la contesta su pestaña de registros.

**Lo que acredita:** hoy **no se puede enviar desde `@feelverse.app`** aunque
llegara la credencial, porque no hay ni firma DKIM ni subdominio de envío
publicados. **Lo que no acredita:** qué hay dentro de la cuenta de Resend.

**Y una cosa útil de paso:** el dominio **sí** tiene reenvío de correo
configurado en el registrador. Eso hace plausible que una dirección
`@feelverse.app` reciba, pero **no lo doy por hecho ni lo uso**: cuál es la
bandeja autorizada lo dices tú.

### El paso concreto, sin receta genérica

Añadir el dominio en Resend y publicar **exactamente los registros que muestre
la pestaña Records de ese dominio**. No los que diga este documento: la
documentación de Resend advierte que para dominios creados después de agosto de
2026 «puede generar registros CNAME para el envío en vez del par MX y TXT», así
que una receta escrita aquí se habría quedado vieja antes de usarse.

**Lo que NO hay que tocar, y es la parte que importa:** el **SPF del ápice** y
los **MX del ápice** son el reenvío del registrador y se **conservan**. Los
registros de envío de Resend van en `send.feelverse.app` y
`resend._domainkey.feelverse.app`, de modo que no colisionan con lo que el
dominio ya tiene para recibir — su propia documentación lo dice: «los registros
MX sólo afectan al subdominio al que están asociados». Sustituir el SPF del
ápice por el de Resend rompería el reenvío que hoy funciona, y nadie lo ha
pedido.

Un `_dmarc` aunque sea en `p=none` ayuda a que el correo no acabe en spam, que
para un restablecimiento de contraseña importa más de lo que parece. Resend no
lo exige para verificar.

---

## 2 · Dónde incorporarlo, de forma segura

**En el panel de variables de Coolify**, en los recursos `feelverse-staging-api`
y `feelverse-staging-worker`. La Web **no** manda correo y no necesita nada.

- **No** en el repositorio, que es público.
- **No** en Notion ni en un mensaje.
- **No** hace falta que nadie dicte la clave en texto: se pega en el panel.

Tres variables, y el **orden importa**:

```bash
# 1 · PRIMERO quién puede recibir, y para la primera prueba la DIRECCIÓN EXACTA
#     —no un dominio entero—. Sin esto, la clave no abre nada: así no hay ni un
#     minuto con credencial y sin destinatarios.
EMAIL_ALLOWLIST=<la dirección exacta autorizada>   # API y worker

# 2 · El remitente, cuando el dominio esté verificado en Resend.
EMAIL_FROM=no-reply@feelverse.app                  # API y worker

# 3 · Y por último la credencial.
RESEND_API_KEY=<...>                               # API y worker
```

`EMAIL_ALLOWLIST` acepta direcciones completas (`alguien@dominio.com`) o
sufijos con arroba (`@dominio.com`), separados por comas. Un dominio suelto
(`dominio.com`) se **rechaza** a propósito.

**Para la primera prueba va una sola dirección completa.** Un sufijo
`@dominio.com` autoriza todo el dominio, y en una primera entrega eso es más
alcance del necesario: lo que hay que demostrar es que un mensaje llega a **esa**
bandeja. Abrir el dominio es una decisión posterior y aparte.

**Y un valor mal escrito no abre nada.** Si la lista tiene contenido y ninguna
entrada utilizable —un dominio suelto, por ejemplo— no sale correo **en ningún
entorno**, producción incluida, y el arranque lo dice con la palabra
`BLOQUEADO`. Es deliberado: un error al escribir una restricción no puede
terminar permitiendo cualquier destinatario.

---

## 3 · Qué está ya preparado

- **La guarda de destinatarios** (2026-11-17). Fuera de producción el correo lo
  abre `EMAIL_ALLOWLIST`, **no** la credencial: con clave y lista vacía **no
  sale nada**, y el arranque lo dice. Esto es lo que hace segura la operación de
  pegar una clave en staging — antes no lo era, porque el **digest semanal** es
  un cron que escribe a cada cuenta con `weeklyReport=true`.
- **El remitente por defecto** ya nombra un dominio del producto (2026-11-06).
  Antes reclamaba uno ajeno, de modo que la primera prueba de una clave nueva
  habría fallado por eso y habría parecido una clave mala.
- **Las plantillas y los seis correos** existen y llevan la marca correcta desde
  el 2026-10-24.
- **El informe de salud** (`GET /api/health/integrations`, ADMIN) dice en qué
  estado está todo esto sin exponer ningún valor: `mailRecipients.mode` vale
  `no-key`, `withheld`, `unusable`, `allowlisted` u `open`, y **cuenta** los
  destinatarios sin enumerarlos.

**Qué significa «guarda comprobada», exactamente.** Que el mecanismo está
escrito, con pruebas y mutaciones, y que el arranque y el informe de salud
derivan del mismo estado. Es nuestra parte y está hecha. **No** significa que
una entrega haya ocurrido: eso es la pregunta 4, y para ella hacen falta los
insumos de arriba.

---

## 4 · Qué queda por ejecutar cuando lleguen

Los cinco pasos son míos. **No llevan duración cerrada**: cuánto tarda depende
de cuándo se verifique el dominio en el proveedor y de si la primera entrega
llega a la bandeja o al spam, y nada de eso se decide desde aquí. El paso 1 son
minutos; el 4 puede necesitar una segunda vuelta por DMARC o por reputación del
dominio.

1. Escribir las tres variables en el orden de arriba, en API y worker.
2. Desplegar **API y worker** (la Web no manda correo).
3. Comprobar en el arranque que el estado pasa de `RETENIDO` a «restringido a 1
   destinatario», y que `GET /api/health/integrations` dice `allowlisted`.

   > **Qué acredita esa comprobación, exactamente.** Que hay una lista y
   > cuántas entradas tiene — **no cuáles**. El informe cuenta y nunca enumera,
   > a propósito: una dirección es un dato personal y ese informe lo lee
   > cualquier ADMIN. Así que `recipients: 1` confirma que la guarda está
   > restringiendo, y **no** confirma que la dirección sea la correcta.
   >
   > Lo que sí lo confirma es el paso 4: un mensaje que **llega a esa bandeja**.
   > Hasta entonces, lo único que hay es el valor que se pegó en el panel, y la
   > forma de no equivocarse es releerlo ahí antes de desplegar — no deducirlo
   > de un contador.

4. Recorrer la recuperación de verdad, en la bandeja autorizada:
   **solicitar → recibir → abrir el enlace → contraseña nueva → entrar con
   ella**, y comprobar que el enlace **usado deja de valer** y que la contraseña
   **anterior deja de valer**.
5. Comprobar que **no salió nada a ninguna otra dirección**.

**La aceptación es que una persona recupera el acceso.** Una variable puesta no
basta, y tampoco basta que Resend acepte la petición: eso dice que el mensaje
salió, no que llegó. Los tres hitos se informan por separado —guarda
comprobada, proveedor verificado, recepción comprobada— y sólo el tercero cierra
la puerta 1 del tramo a producción.
