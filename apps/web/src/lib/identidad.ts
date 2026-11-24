/**
 * Cómo se nombra a la persona en el armazón del panel: su nombre y sus
 * iniciales.
 *
 * El avatar de la barra superior decía «AV» para todo el mundo —un literal que
 * venía del prototipo— y el carril mostraba el correo en el sitio del nombre.
 * Las dos cosas salen ahora de `/user/me`, que el layout del panel ya pide, y
 * las iniciales son las MISMAS que pinta Perfil: las que calcula la API.
 *
 * Es una función pura porque lo difícil no es pintarlo, son los huecos: cuentas
 * sin nombre, con el correo guardado como nombre, o una respuesta que no llegó.
 */

export interface IdentidadDeCuenta {
  /** El nombre para mostrar, o `null` si no hay ninguno que sirva. */
  readonly nombre: string | null;
  /** Una o dos letras. Nunca vacío. */
  readonly iniciales: string;
}

export interface DatosDeCuenta {
  readonly nombre?: string | null;
  /** Las que calcula la API (`UserMeResponse.user.initials`). */
  readonly iniciales?: string | null;
  /** Sólo como último respaldo de la inicial. El correo no se muestra. */
  readonly correo?: string | null;
}

/** Una o dos letras, acentuadas o no. Lo demás no son iniciales. */
const INICIALES = /^\p{L}{1,2}$/u;

export function identidadDeCuenta(datos: DatosDeCuenta): IdentidadDeCuenta {
  const nombre = nombreMostrable(datos.nombre);

  if (nombre) {
    const deLaApi = (datos.iniciales ?? "").normalize("NFC").trim();
    const iniciales = INICIALES.test(deLaApi)
      ? deLaApi.toLocaleUpperCase("es")
      : inicialesDe(nombre);
    if (iniciales) return { nombre, iniciales };
  }

  return { nombre, iniciales: primeraLetra(datos.correo ?? "") || "?" };
}

/**
 * El nombre tal como se enseña, o `null`.
 *
 * Un nombre con arroba es un correo guardado en el campo equivocado —cuentas
 * importadas, o registros que repitieron el correo—. Mostrarlo sería volver al
 * defecto por la otra puerta.
 */
function nombreMostrable(crudo: string | null | undefined): string | null {
  const limpio = (crudo ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!limpio || limpio.includes("@")) return null;
  return limpio;
}

/**
 * La misma regla que la API: con una palabra, sus dos primeras letras; con
 * varias, la primera de la primera y la primera de la última.
 *
 * Trabaja sobre letras, no sobre unidades de código: partir por índice rompía
 * un nombre que empezara por un emoji y dejaba medio carácter en el avatar.
 */
function inicialesDe(nombre: string): string {
  const palabras = nombre
    .split(" ")
    .map((p) => p.match(/\p{L}/gu) ?? [])
    .filter((letras) => letras.length > 0);
  if (palabras.length === 0) return "";
  const primera = palabras[0]!;
  const letras =
    palabras.length === 1
      ? primera.slice(0, 2)
      : [primera[0]!, palabras[palabras.length - 1]![0]!];
  return letras.join("").toLocaleUpperCase("es");
}

function primeraLetra(texto: string): string {
  const letra = texto.normalize("NFC").match(/[\p{L}\p{N}]/u)?.[0] ?? "";
  return letra.toLocaleUpperCase("es");
}
