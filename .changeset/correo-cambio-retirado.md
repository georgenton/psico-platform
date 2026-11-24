---
"@psico/types": minor
"@psico/api-client": patch
---

El cambio de correo se retira hasta que el recorrido pueda terminar.

- **`EMAIL_CHANGE_UNAVAILABLE_CODE` y `EMAIL_CHANGE_UNAVAILABLE_NOTICE`** — el
  código del rechazo y la frase que dicen el servidor, la web y el móvil.
- El contrato generado documenta la respuesta real de
  `POST /user/email-change-request`: `503` para cualquier cuerpo válido, en lugar
  del `409` que distinguía una dirección con cuenta. La ruta y su cuerpo no
  cambian.
