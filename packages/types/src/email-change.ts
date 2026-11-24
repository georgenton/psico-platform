/**
 * El cambio de correo está retirado, y esto es lo que se dice mientras tanto.
 *
 * La ruta creaba una solicitud y encolaba un correo con un enlace a una página
 * que no existe, así que el recorrido no terminaba nunca. Hasta que se complete
 * —el alcance está en `docs/product/tarea-cambio-de-correo.md`— las pantallas
 * no lo ofrecen y el servidor lo rechaza antes de escribir o enviar nada.
 *
 * La frase es una sola porque la dicen tres sitios: la tarjeta de web, la de
 * móvil y el rechazo del servidor, que los clientes ya instalados pueden pintar
 * tal cual. No promete fecha ni otro camino, porque hoy no hay ninguno de los
 * dos.
 */

/** Código máquina del rechazo. El envelope de error lo lleva en `code`. */
export const EMAIL_CHANGE_UNAVAILABLE_CODE = "EMAIL_CHANGE_UNAVAILABLE";

export const EMAIL_CHANGE_UNAVAILABLE_NOTICE =
  "Por ahora no se puede cambiar el correo desde la app.";
