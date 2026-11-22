---
"@psico/api-client": minor
---

El contrato generado suma el reenvío del enlace de verificación de correo.

`generated.ts` gana `POST /api/auth/resend-verification` con sus formas de
petición y respuesta. Es **puramente aditivo** —+133 líneas, ninguna retirada—,
así que un consumidor anterior compila igual; lo nuevo es que puede tipar esa
ruta.

**Lo que el consumidor tiene que leer en la forma de la respuesta**, porque es
donde vive la garantía y no en una convención aparte: contesta **200
`{ ok: true }` para toda dirección** —desconocida, inactiva, de un proveedor
externo, ya confirmada o pasada de cupo—. Eso no es laxitud del contrato: una
respuesta que variara sería un oráculo de «¿esta dirección tiene cuenta aquí?»,
y la rama de «ya confirmada» filtraría un segundo bit encima. De modo que **no
hay nada en el cuerpo de lo que inferir si un correo está registrado**, ni se
añadirá después: es el mismo criterio de no-filtración que ya sostiene
`forgot-password`.

`authApi` **no** gana método, y es deliberado: móvil no tiene pantalla de
verificación, y ese fichero tampoco expone `forgotPassword`. La web lo consume
por `apps/web/src/lib/api.ts`, que es una aplicación y queda fuera de los
paquetes que se versionan.

Va en `minor` por ser superficie nueva sin romper ninguna firma, que es el
nivel con el que el repositorio ya trató los tres casos de esta misma forma
—`media-upload`, `chapter-media-catalog` y `content-studio-admin-api`: contrato
regenerado, cliente escrito a mano intacto—.
