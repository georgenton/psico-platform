/**
 * La política de contraseñas NUEVAS del flujo local de factor único.
 *
 * ── Por qué vive aquí ───────────────────────────────────────────────────────
 *
 * Antes había cuatro valores distintos para la misma pregunta: 8 en el
 * registro y en el restablecimiento del servidor, 10 en el formulario web de
 * restablecimiento, y 10 en el cambio con recifrado. Quien se registraba con
 * ocho caracteres y luego intentaba cambiar a otros ocho recibía un rechazo
 * con una regla que nadie le había contado. No era un fallo de
 * implementación —cliente y servidor coincidían en cada pantalla— sino un
 * producto contando varias reglas.
 *
 * Una sola fuente, consumida por la API, la web y el móvil, hace imposible
 * que vuelvan a separarse.
 *
 * ── Qué NO es ───────────────────────────────────────────────────────────────
 *
 * No es «cumplimiento de NIST». Unificar una longitud es una cosa; la guía
 * completa pide además comprobar contra listas de contraseñas comprometidas,
 * no imponer composición ni caducidad arbitraria, y permitir pegar desde un
 * gestor. De eso, aquí sólo está la longitud y la ausencia de reglas de
 * composición. Lo demás sigue pendiente y conviene no darlo por hecho.
 */

/**
 * Mínimo de caracteres para una contraseña nueva.
 *
 * Quince, no ocho. Una frase corta de tres o cuatro palabras llega sin
 * esfuerzo, y a cambio el espacio de búsqueda deja de estar al alcance de un
 * ataque por diccionario con hardware corriente. No se exigen mayúsculas,
 * dígitos ni símbolos: esas reglas empujan a la gente hacia `Password1!` y
 * miden menos de lo que parecen.
 */
export const PASSWORD_MIN_LENGTH = 15;

/**
 * Tope en BYTES, no en caracteres — y la diferencia importa.
 *
 * El verificador es bcrypt, que **ignora todo lo que pase de 72 bytes**. No
 * falla: trunca en silencio. Con ASCII, 72 bytes son 72 caracteres y nadie lo
 * nota; con acentos o emoji, no. «ñ» ocupa dos bytes y un emoji hasta cuatro,
 * así que una contraseña de 40 caracteres puede superar el tope sin que su
 * dueño lo sospeche, y dos contraseñas distintas que compartan los primeros
 * 72 bytes acaban con el mismo hash.
 *
 * Por eso se valida en bytes y se RECHAZA en vez de truncar. Una contraseña
 * que el sistema acorta a tus espaldas es peor que una que no acepta.
 */
export const PASSWORD_MAX_BYTES = 72;

/** Qué le pasa a una contraseña nueva, si es que le pasa algo. */
export type PasswordPolicyProblem = "TOO_SHORT" | "TOO_MANY_BYTES";

/** Longitud en bytes UTF-8, que es la unidad en la que piensa bcrypt. */
export function passwordByteLength(password: string): number {
  // `TextEncoder` existe en Node 18+, en los navegadores y en Hermes.
  return new TextEncoder().encode(password).length;
}

/**
 * Comprueba una contraseña NUEVA. Devuelve `null` cuando es aceptable.
 *
 * Deliberadamente no se usa para verificar una contraseña YA existente: las
 * cuentas creadas bajo la regla anterior siguen entrando con la suya, y
 * aplicarles esto al iniciar sesión las dejaría fuera de su propia cuenta.
 */
export function passwordPolicyProblem(
  password: string,
): PasswordPolicyProblem | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return "TOO_SHORT";
  if (passwordByteLength(password) > PASSWORD_MAX_BYTES) return "TOO_MANY_BYTES";
  return null;
}

/** El mensaje que ve la persona. Uno por problema, en su idioma. */
export function passwordPolicyMessage(problem: PasswordPolicyProblem): string {
  return problem === "TOO_SHORT"
    ? `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
    : "La contraseña es demasiado larga. Prueba con uno o dos caracteres menos.";
}

/** La ayuda que acompaña al campo, antes de que haya ningún error. */
export const PASSWORD_HINT = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Una frase corta funciona bien.`;
