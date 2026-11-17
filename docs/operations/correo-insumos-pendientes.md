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
| **`feelverse.app` verificado**  | **no comprobable sin la credencial** — vive en la cuenta de Resend, y no se intentó averiguarlo por otra vía                                                                |
| **Una bandeja real autorizada** | **no existe.** El único fichero con «correo» en el nombre del almacén de operaciones es una cuenta de aplicación en `@psico.test`, que por la RFC 2606 **no puede recibir** |
| **Remitente** (`EMAIL_FROM`)    | **ausente**, así que hoy toma el valor por omisión `no-reply@feelverse.app`. El informe de salud delata que nadie lo eligió                                                 |

Los tres primeros son tuyos. El cuarto se resuelve con el segundo: fijarlo a
mano sólo tiene sentido cuando el dominio esté verificado.

---

## 2 · Dónde incorporarlo, de forma segura

**En el panel de variables de Coolify**, en los recursos `feelverse-staging-api`
y `feelverse-staging-worker`. La Web **no** manda correo y no necesita nada.

- **No** en el repositorio, que es público.
- **No** en Notion ni en un mensaje.
- **No** hace falta que nadie dicte la clave en texto: se pega en el panel.

Tres variables, y el **orden importa**:

```bash
# 1 · PRIMERO quién puede recibir. Sin esto, la clave no abre nada —y es a
#     propósito: así no hay ni un minuto con credencial y sin destinatarios.
EMAIL_ALLOWLIST=<la bandeja autorizada>        # API y worker

# 2 · El remitente, cuando el dominio esté verificado en Resend.
EMAIL_FROM=no-reply@feelverse.app              # API y worker

# 3 · Y por último la credencial.
RESEND_API_KEY=<...>                           # API y worker
```

`EMAIL_ALLOWLIST` acepta direcciones completas (`alguien@dominio.com`) o
sufijos con arroba (`@dominio.com`), separados por comas. Un dominio suelto se
rechaza a propósito.

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
