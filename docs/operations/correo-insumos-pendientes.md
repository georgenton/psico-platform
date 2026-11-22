# Correo — montado, y comprobado con una recepción real

> Ficha corta, para saber en una pantalla qué hace el correo hoy. Corte del
> **2026-11-19, noche**.
>
> El recorrido de operación está en
> [runbook §2.5.1](../deploy/coolify-runbook.md); el tramo hasta producción, en
> §4.1 del mismo documento.

## 0 · El estado, en una línea

**Una persona que olvida su contraseña la recupera.** Comprobado de punta a
punta el 19-11 contra `qa@syntavera.dev`: mensaje recibido en la **bandeja
principal**, enlace abierto, contraseña nueva, y acceso con ella desde una
sesión limpia.

**La decisión de arquitectura:** Microsoft 365 para las bandejas que administra
Syntavera; **Resend** para los mensajes automáticos de FeelVerse; OVH con
Coolify como única infraestructura.

## 1 · Los siete resultados, separados

Son siete afirmaciones distintas y conviene no colapsarlas: sólo las tres
últimas describen lo que le pasa a una persona.

| Resultado                       | Hoy | Qué lo acredita                                                    |
| ------------------------------- | --- | ------------------------------------------------------------------ |
| Configuración preparada         | ✅  | registros publicados y variables escritas en API y worker          |
| Dominio verificado              | ✅  | Resend marca `feelverse.app` como Verified                         |
| Credencial efectiva             | ✅  | el arranque dice «Resend client initialised»                       |
| Mensaje aceptado por proveedor  | ✅  | tres mensajes en el registro de Resend, los tres **Delivered**     |
| **Mensaje recibido en Outlook** | ✅  | los tres en la **bandeja principal**, ninguno en correo no deseado |
| **Cuenta recuperada**           | ✅  | contraseña nueva y acceso con ella desde sesión limpia             |
| **Mensaje del worker recibido** | ✅  | aviso de exportación, enviado por el worker y recibido             |

**Aceptación del proveedor no es recepción**, y ninguna de las dos es
recuperación. Las tres se comprobaron por separado y en ese orden.

## 2 · Lo que se comprobó, con su resultado

### El recorrido de la persona

| Paso                                   | Resultado                                                          |
| -------------------------------------- | ------------------------------------------------------------------ |
| Registro                               | HTTP 201                                                           |
| Recepción del mensaje de verificación  | bandeja **principal**                                              |
| Apertura del enlace y verificación     | «¡Listo! Confirmamos tu correo»; en la base, `emailVerified: true` |
| Solicitud de recuperación desde la app | «Revisa tu correo»                                                 |
| Recepción del mensaje de recuperación  | bandeja **principal**                                              |
| Contraseña nueva                       | HTTP 204                                                           |
| Acceso con ella, **sesión limpia**     | HTTP 200, con token emitido                                        |
| Enlace ya usado                        | **HTTP 410** `TOKEN_INVALID_OR_EXPIRED`                            |
| Contraseña anterior                    | **HTTP 401** `UNAUTHORIZED`                                        |

> **El 401 de la última fila importa que sea 401.** Un **429** ahí sería un
> bloqueo por demasiados intentos y **no** probaría que la contraseña dejó de
> servir. Los límites son estrechos —`login` 5 por 15 min, `forgot-password` 3
> por hora, ambos por IP—, así que el recorrido se planifica para no gastarlos:
> si sale 429, se espera y se repite, no se da por bueno.

### El worker

El camino es la **exportación de datos**, `POST /api/user/data-export` desde el
perfil. El procesador corre **en el worker**, sube el fichero a R2 y manda el
aviso. Observado: `Building data export… → [email sent] to=qa@syntavera.dev →
READY · 2306 bytes uploaded`, y el mensaje recibido, con enlace a
`staging.feelverse.app/dashboard/perfil` y la autenticación prevista — el
fichero **no viaja en un enlace público**.

> **No sirve el cambio de correo hacia la propia dirección.**
> `users.service.ts:518-522` lanza `ConflictException("Email already in use")`
> si **cualquier** usuario tiene esa dirección — incluido el que la pide. Da
> **409 antes de encolar nada**. Y la exportación tiene **enfriamiento de 30
> días por cuenta**: antes de pedirla, se mira si ya hay una.

### La restricción de destinatarios

`EMAIL_ALLOWLIST=qa@syntavera.dev` en **API y worker**. Comprobada **dentro de
los dos contenedores** con `scripts/check-mail-recipient.cjs`:

| Dirección probada       | Veredicto               |
| ----------------------- | ----------------------- |
| la autorizada exacta    | `SÍ SALE (allowlisted)` |
| con **una letra menos** | `NO SALE`               |
| un tercero cualquiera   | `NO SALE`               |

Esa última fila es el **rechazo acreditado sin invocar al proveedor**. Y el
resultado en vivo lo confirma: el registro de Resend de esta ejecución tiene
**tres mensajes y los tres van a la misma dirección**.

## 3 · Cómo está montado

### Las bandejas, en Microsoft

| Dirección               | Qué es                                   | Licencia        | Acceso              |
| ----------------------- | ---------------------------------------- | --------------- | ------------------- |
| `qa@syntavera.dev`      | buzón **compartido** «FeelVerse QA»      | ninguna, gratis | Jorge, acceso total |
| `soporte@syntavera.dev` | buzón **compartido** «FeelVerse Soporte» | ninguna, gratis | Jorge, acceso total |

**Por qué en `syntavera.dev` y no en la marca.** `feelverse.app` **no está en
Microsoft**, y su recepción vive en el **reenvío de Namecheap**, cuya cuenta no
es accesible. Sin poder acreditar sus destinos, **sus MX se conservan**.

> **Los alias de marca necesitan una ruta de recepción, no sólo un alias.**
> Añadir `qa@feelverse.app` o `soporte@feelverse.app` como alias de estos
> buzones **no basta**: ese dominio no entrega en Microsoft. Antes hace falta
> una de dos rutas — una regla de reenvío en Namecheap, que no cambia ningún
> MX, o añadir el dominio a Microsoft y trasladar su recepción, que sí los
> cambia y exige inventariar primero los reenvíos existentes. Hoy ninguna está
> disponible, así que el alias por sí solo sería una dirección que no recibe.

### El envío, en Resend

Cuenta preexistente. `feelverse.app` **verificado**, región São Paulo. La
credencial es de **sólo envío** y está **limitada a ese dominio**.

**Resend pidió CNAME**, no el par MX/TXT — el caso que su documentación anuncia
para dominios recientes. Por eso los registros se piden a la cuenta y no se
escriben aquí de memoria.

### Los registros DNS

La zona pasó de **10 a 14**. Los cuatro nuevos van en **subdominios**:
`resend._domainkey` (DKIM), `rsend` y `send` (envío, **dns-only**) y `_dmarc`
(`p=none`). **No** se publicó el host de «Enable receiving», que competiría con
la recepción actual. Revalidado con `dig` **después** de escribir: los cinco MX
del ápice, el SPF del ápice y los tres A, intactos.

## 4 · Dos trampas que cuestan una hora

**`EMAIL_FROM` admite sólo la dirección pelada.** Es `z.string().email()` y la
validación es **fatal al arrancar**: con `Nombre <correo@dominio>` la API y el
worker **no arrancan**. El nombre visible se configura en Resend.

**Despliega antes de probar, y comprueba qué contenedor sirve.** En esta
ejecución se registró una cuenta mientras la actualización progresiva todavía
servía el contenedor **anterior**, que no tenía la credencial: el correo no
salió y no hay forma de reemitir una verificación —`sendVerificationEmail` sólo
se dispara desde `register()`—. Hubo que rehacer la cuenta. Antes de la primera
prueba, confirma que sólo hay **un** contenedor en marcha.

> _Nota del 2026-11-22._ «No hay forma de reemitir» era cierto ese día y dejó
> de serlo con #870: hoy se pide otro enlace desde el login. La trampa no
> cambia —el reenvío también lo atiende el contenedor que sirve— y el nuevo
> enlace sale por la cola `email`, así que el worker también tiene que estar en
> marcha y con la misma lista de destinatarios.
