# Correo — estado y el paso que falta

> Ficha corta, para decidir en una pantalla. Corte del **2026-11-19 por la
> tarde**, después de ejecutar el frente de correo.
>
> El recorrido completo de operación está en
> [runbook §2.5.1](../deploy/coolify-runbook.md); el tramo hasta producción, en
> §4.1 del mismo documento.

## 0 · Qué cambió hoy

Esta ficha nació como un inventario de **tres insumos ausentes**. Dos de los
tres dejaron de faltar y el tercero existe pero no está colocado:

| Antes del 19-11                             | Hoy                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Credencial de Resend **ausente**            | **creada**, sólo envío, limitada a `feelverse.app` — falta **pegarla** en Coolify    |
| `feelverse.app` **sin comprobar** en Resend | **verificado** por el proveedor                                                      |
| Bandeja real autorizada **inexistente**     | `qa@syntavera.dev`, buzón compartido real, comprobado que recibe y que Jorge lo abre |

**La decisión de arquitectura queda registrada:** Microsoft 365 para las
bandejas que administra Syntavera; **Resend** para los mensajes automáticos de
FeelVerse; OVH con Coolify como única infraestructura.

## 1 · Cuatro preguntas distintas, y conviene no colapsarlas

Lo que se sabe del correo son cuatro cosas separadas, cada una con su fuente.
Resumirlas en un «el correo está / no está» fue el error que esta ficha
arrastró dos cortes.

| #   | Pregunta                                                 | Quién la contesta                       | Hoy                                                                |
| --- | -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| 1   | ¿Qué hay publicado en el **DNS** del dominio?            | el DNS público — no necesita credencial | ✅ **los cuatro registros de Resend, publicados y propagados**     |
| 2   | ¿Qué registros **exactos** pide la cuenta de Resend?     | sólo la cuenta, en su pestaña Records   | ✅ **conocidos y publicados** — ver §3                             |
| 3   | ¿El proveedor marca el dominio **verificado**?           | sólo la cuenta                          | ✅ **Verified**, 19-11                                             |
| 4   | ¿**Llega** un mensaje y se recupera el acceso de verdad? | una entrega real a una bandeja real     | ❌ **todavía no** — y sigue siendo la única que acredita que sirve |

**La 2 confirmó la advertencia que esta ficha llevaba escrita.** Resend generó
**CNAME** (`rsend`, `send`) en vez del par MX/TXT, exactamente el caso que su
documentación anuncia para dominios recientes. Haber escrito aquí una receta
genérica de nombres habría producido registros equivocados; pedirlos a la
cuenta era el único camino correcto.

**Y la 3 no implica la 4.** Un dominio verificado dice que el proveedor acepta
firmar nuestros mensajes. Lo único que acredita el recorrido es que una persona
**recibió** el enlace y **volvió a entrar** con su contraseña nueva.

---

## 2 · Lo único que falta

**Pegar el valor de la credencial** como `RESEND_API_KEY` en los dos recursos
de Coolify: `feelverse-staging-api` y `feelverse-staging-worker`. La Web no
manda correo y no necesita nada.

La credencial ya existe en Resend con el nombre **`feelverse-staging`**,
permiso **sólo envío** y **limitada a `feelverse.app`**. Su valor no se
transcribe en este repositorio, ni en Notion, ni en ningún informe: una clave
de API se pega directamente en el panel protegido y en ningún otro sitio.

Después de eso, lo que queda es ejecución:

1. `EMAIL_FROM=no-reply@feelverse.app` en los dos recursos.
2. Desplegar **API y worker** (la Web no).
3. Comprobar que el arranque pasa de `sin RESEND_API_KEY` a «restringido a 1
   destinatario» y que `GET /api/health/integrations` dice `allowlisted`.
4. Recorrer la recuperación de verdad: **solicitar → recibir → abrir el enlace
   → contraseña nueva → entrar con ella**, más que el enlace usado deja de
   valer y que la contraseña anterior deja de valer.
5. Comprobar un envío real **del worker**, que la recuperación no acredita —
   esa la manda la API. El camino es la **exportación de datos**:
   `POST /api/user/data-export` desde el perfil de la cuenta QA →
   `DataExportProcessor` **en el worker** → R2 → correo a la dirección de esa
   cuenta, con enlace a `APP_URL`.

   > **No sirve el cambio de correo hacia la propia dirección.**
   > `users.service.ts:518-522` lanza `ConflictException("Email already in use")`
   > si **cualquier** usuario tiene esa dirección — incluido el que la pide. Da
   > **409 antes de encolar nada**, así que no produce ningún envío. Y la
   > exportación tiene **enfriamiento de 30 días por cuenta**: hay un intento,
   > conviene no gastarlo por error.

6. Comprobar que **no salió nada a ninguna otra dirección**, contrastando los
   registros del proveedor con los de la aplicación.

> **Dos trampas que cuestan una hora si no están escritas.**
>
> **`EMAIL_FROM` sólo admite una dirección pelada.** Es `z.string().email()` y
> la validación es **fatal al arrancar**: con `Nombre <correo@dominio>` la API
> y el worker **no arrancan**, con `• EMAIL_FROM: Invalid email address`. El
> nombre visible del remitente se configura en Resend, no aquí.
>
> **La lista va antes que la clave.** Si se invierte, hay una ventana con
> credencial y sin destinatarios declarados. Hoy la lista ya está puesta, así
> que la clave entra sobre terreno seguro.

---

## 3 · Lo que quedó montado, y por qué así

### Las bandejas, en Microsoft

| Dirección               | Qué es                                   | Licencia        | Acceso              |
| ----------------------- | ---------------------------------------- | --------------- | ------------------- |
| `qa@syntavera.dev`      | buzón **compartido** «FeelVerse QA»      | ninguna, gratis | Jorge, acceso total |
| `soporte@syntavera.dev` | buzón **compartido** «FeelVerse Soporte» | ninguna, gratis | Jorge, acceso total |

Son **buzones compartidos**, no usuarios con licencia: no cuestan nada, siguen
el patrón que la organización ya usaba (había cuatro) y conservan bloqueado el
inicio de sesión directo. Se comprobó la ida y la vuelta entre los dos y que
ambos abren en OWA con la identidad de Jorge.

**Por qué en `syntavera.dev` y no en `feelverse.app`.** `feelverse.app` **no
está añadido en Microsoft**, y su recepción vive hoy en el **reenvío de
Namecheap** (cinco MX `eforward1..5`). Esa cuenta de registrador **no es
accesible**, así que los destinos de ese reenvío **no se pueden acreditar** —
y la regla es que, cuando no se pueden acreditar, sus MX se conservan y el
recorrido se termina con una bandeja corporativa real. Eso es lo que se hizo.

> **El punto pendiente de la dirección de marca.** `qa@feelverse.app` y
> `soporte@feelverse.app` siguen sin existir. Cuando se decida, hay dos
> caminos: añadir una regla de reenvío en Namecheap (no cambia ningún MX) o
> añadir `feelverse.app` a Microsoft y trasladar su recepción (sí lo cambia, y
> exige antes inventariar los reenvíos existentes). El buzón compartido ya
> creado puede recibir la dirección de marca como **alias** sin migrar nada.

### El envío, en Resend

La cuenta **ya existía** (equipo `georgenton`, de hace ~5 meses, con una
credencial «Onboarding» sin usar desde hace cuatro). `feelverse.app` quedó
añadido y **verificado**, región **São Paulo (sa-east-1)**.

### Los registros DNS, y lo que no se tocó

La zona de `feelverse.app` (Cloudflare) pasó de **10 a 14** registros. Los
cuatro nuevos van todos en **subdominios**:

| Tipo  | Nombre              | Para qué                        |
| ----- | ------------------- | ------------------------------- |
| TXT   | `resend._domainkey` | DKIM — verificación del dominio |
| CNAME | `rsend`             | envío (**dns-only**, sin proxy) |
| CNAME | `send`              | envío (**dns-only**, sin proxy) |
| TXT   | `_dmarc`            | `v=DMARC1; p=none;`             |

**No se publicó** el host de «Enable receiving» de Resend: activaría una
recepción que competiría con la que mantenemos. Queda deliberadamente fuera.

**Revalidado por `dig` después de escribir**, porque es la parte que importa:
los **cinco MX del ápice**, el **SPF del ápice** y los **tres A** siguen
exactamente como estaban. El reenvío actual no se rozó.

### La guarda de destinatarios

`EMAIL_ALLOWLIST=qa@syntavera.dev` está escrita en **API y worker**, y se
escribió **antes** de que existiera ninguna credencial. Comprobada dentro de
los **dos** contenedores con `scripts/check-mail-recipient.cjs`:

| Dirección probada       | Veredicto de la guarda  |
| ----------------------- | ----------------------- |
| la autorizada exacta    | `SÍ SALE (allowlisted)` |
| con **una letra menos** | `NO SALE`               |
| un tercero cualquiera   | `NO SALE`               |

Esa tercera fila es, además, la comprobación de rechazo que pide el
procedimiento **sin invocar al proveedor**: no hace falta mandarle un mensaje a
nadie para demostrar que se habría bloqueado.

El informe de salud (`GET /api/health/integrations`, ADMIN) **cuenta** los
destinatarios y nunca los enumera, así que confirma que la guarda restringe y
**no** confirma cuál es la dirección: sale idéntico con una errata que produzca
otra dirección válida. Para eso está el guion.

---

## 4 · Qué significa cada palabra, para no darlo por hecho

Seis estados, que conviene no mezclar:

| Estado                          | Hoy | Qué lo acredita                                     |
| ------------------------------- | --- | --------------------------------------------------- |
| **Configurado**                 | ✅  | variables escritas, buzones creados, DNS publicado  |
| **Verificado por el proveedor** | ✅  | Resend marca `feelverse.app` como Verified          |
| **Integrado**                   | ✅  | el código del transporte y su guarda, en `main`     |
| **Desplegado**                  | ✅  | API y worker sirviendo `dbce7e39`, API `ready=true` |
| **Mensaje recibido**            | ❌  | una entrega real a `qa@syntavera.dev`               |
| **Recuperación completada**     | ❌  | entrar con la contraseña nueva                      |

**La aceptación es la última fila.** Una variable puesta no basta, y tampoco
basta que Resend acepte la petición: eso dice que el mensaje salió, no que
llegó.
