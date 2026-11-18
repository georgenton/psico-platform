# Correo — qué falta para que alguien recupere su cuenta

> Ficha corta, para decidir en una pantalla. Corte del **2026-11-17**.
>
> El recorrido completo de operación está en
> [runbook §2.5.1](../deploy/coolify-runbook.md); el tramo hasta producción, en
> §4.1 del mismo documento. Esto es sólo el inventario de lo que falta y dónde
> ponerlo.

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
| **`feelverse.app` verificado**  | **COMPROBADO el 18-11 por DNS público: el dominio NO está configurado para enviar.** Detalle justo debajo                                                                   |
| **Una bandeja real autorizada** | **no existe.** El único fichero con «correo» en el nombre del almacén de operaciones es una cuenta de aplicación en `@psico.test`, que por la RFC 2606 **no puede recibir** |
| **Remitente** (`EMAIL_FROM`)    | **ausente**, así que hoy toma el valor por omisión `no-reply@feelverse.app`. El informe de salud delata que nadie lo eligió                                                 |

Los tres primeros son tuyos. El cuarto se resuelve con el segundo: fijarlo a
mano sólo tiene sentido cuando el dominio esté verificado.

> **Dos estados que conviene no confundir, porque uno es un hecho y el otro una
> laguna.** La credencial y la bandeja están **comprobadas ausentes**: busqué
> donde tendrían que estar y no están. Resumirlas junto con el dominio como «las
> tres ausentes» —que es lo que hice el 17-11— convertía un «no lo sé» en un «no
> hay».

### El dominio: comprobado, y lo que falta es concreto

El 17-11 dejé esto como «pendiente de comprobar» porque la respuesta vive en la
cuenta de Resend. **Pero hay una fuente que sí lo acredita y no necesita
credencial: el DNS público**, que es exactamente lo que mira un servidor que
recibe. Consultado el **2026-11-18**, con control positivo y negativo:

| Registro                              | Qué hay hoy                                                                                   | Qué pide Resend     |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------- |
| `feelverse.app` TXT (SPF)             | `v=spf1 include:spf.efwd.registrar-servers.com ~all` — **reenvío del registrador**, no Resend | su propio `include` |
| `resend._domainkey.feelverse.app` TXT | **sin registro**                                                                              | la clave DKIM       |
| `send.feelverse.app` TXT / MX         | **sin registro**                                                                              | ambos               |
| `_dmarc.feelverse.app` TXT            | **sin registro**                                                                              | recomendado         |
| `feelverse.app` MX                    | `eforward1…5.registrar-servers.com` — reenvío                                                 | —                   |

**Conclusión, dicha con su alcance:** el dominio **no está configurado para
enviar** a través de Resend. Lo que esto demuestra es que **hoy no se puede
enviar desde `@feelverse.app`** aunque llegara la credencial — Resend no
verifica un dominio sin esos registros. Lo que **no** demuestra es qué hay
dentro de la cuenta de Resend: alguien pudo añadir el dominio y no publicar los
registros todavía.

**Y una cosa útil de paso:** el dominio **sí** tiene reenvío de correo
configurado en el registrador. Eso hace plausible que una dirección
`@feelverse.app` reciba, pero **no lo doy por hecho ni lo uso**: cuál es la
bandeja autorizada lo dices tú.

**Así que al insumo «dominio verificado» se le puede poner un paso concreto:**
añadir el dominio en Resend, publicar los registros que te dé (DKIM, y el SPF y
MX del subdominio de envío) y esperar a que marque verificado. Un `_dmarc`
aunque sea en `p=none` ayuda a que el correo no acabe en spam, que para un
restablecimiento de contraseña importa más de lo que parece.

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
  `no-key`, `withheld`, `allowlisted` u `open`, y **cuenta** los destinatarios
  sin enumerarlos.

---

## 4 · Qué queda por ejecutar cuando lleguen

Media hora, y es mío:

1. Escribir las tres variables en el orden de arriba, en API y worker.
2. Desplegar **API y worker** (la Web no manda correo).
3. Comprobar en el arranque que el estado pasa de `RETENIDO` a «restringido a 1
   destinatario».
4. Recorrer la recuperación de verdad, en la bandeja autorizada:
   **solicitar → recibir → abrir el enlace → contraseña nueva → entrar con
   ella**, y comprobar que el enlace no se reutiliza y que la contraseña
   anterior deja de valer.
5. Comprobar que **no salió nada a ninguna otra dirección**.

**La aceptación es que una persona recupera el acceso.** Una variable puesta no
basta, y tampoco basta que Resend acepte la petición: eso dice que el mensaje
salió, no que llegó.
