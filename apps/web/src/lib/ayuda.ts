import type { CrisisCountry } from "@psico/types";

/**
 * La ayuda inmediata: a dónde apunta un enlace hacia ella y a dónde vuelve.
 *
 * ── Por qué estas reglas viven aparte de la página ────────────────────────
 *
 * La enlazan cuatro sitios que no se conocen —el pie de la portada, las
 * pantallas de acceso, la bienvenida y el panel— y dos rutas antiguas
 * redirigen a ella. Si cada uno escribiera la URL a mano, la primera errata
 * dejaría a alguien sin líneas de ayuda y nada lo diría.
 *
 * ── Por qué «volver» no lee una dirección ─────────────────────────────────
 *
 * El parámetro `desde` es una PALABRA de una lista cerrada, no una URL. Un
 * «volver» que obedeciera una dirección escrita en la barra sería una
 * redirección abierta: cualquiera podría repartir un enlace a esta página que
 * devolviera a otra parte, y justo aquí quien lo pulsa no está para mirar.
 *
 * ── Por qué no importa nada en ejecución ──────────────────────────────────
 *
 * La usa el pie de la portada, que es código de cliente. Traer aquí el catálogo
 * metería el paquete entero de tipos en el JavaScript de la portada para
 * pintar un enlace; por eso el país se resuelve aparte, en `ayuda-pais.ts`.
 */

export const RUTA_AYUDA = "/ayuda";

/** Ancla de la sección de líneas: al cambiar de país se vuelve a ella. */
export const ANCLA_LINEAS = "lineas";

interface Vuelta {
  readonly href: string;
  readonly texto: string;
}

const PORTADA: Vuelta = { href: "/", texto: "Volver a la portada" };
const INICIO: Vuelta = { href: "/dashboard", texto: "Volver a Inicio" };

/** Los orígenes admitidos. Todo lo que no esté aquí no es un origen. */
const ORIGENES = {
  eco: { href: "/dashboard/eco", texto: "Volver a Eco" },
  terapia: { href: "/dashboard/terapia", texto: "Volver a Terapia" },
} as const satisfies Record<string, Vuelta>;

export type OrigenAyuda = keyof typeof ORIGENES;

/** Un parámetro de la URL: puede faltar o venir repetido. */
export type Parametro = string | string[] | undefined;

export const primero = (valor: Parametro): string | undefined =>
  Array.isArray(valor) ? valor[0] : valor;

/**
 * El origen que declara la URL, o `null`. Propiedad propia y no `in`: el valor
 * sale de la barra de direcciones, e `in` diría que sí a `constructor`.
 */
export function origenAyuda(valor: Parametro): OrigenAyuda | null {
  const v = primero(valor);
  return v !== undefined && Object.prototype.hasOwnProperty.call(ORIGENES, v)
    ? (v as OrigenAyuda)
    : null;
}

/** La dirección de la ayuda, con su país y su origen si los hay. */
export function hrefAyuda({
  pais,
  desde,
}: {
  pais?: CrisisCountry;
  desde?: OrigenAyuda | null;
} = {}): string {
  const query = new URLSearchParams();
  if (pais) query.set("pais", pais);
  if (desde) query.set("desde", desde);
  const q = query.toString();
  return q ? `${RUTA_AYUDA}?${q}` : RUTA_AYUDA;
}

/** El origen que corresponde a una ruta del panel, o `null` si no es ninguno. */
export function origenSegunRuta(pathname: string): OrigenAyuda | null {
  for (const origen of Object.keys(ORIGENES) as OrigenAyuda[]) {
    const { href } = ORIGENES[origen];
    if (pathname === href || pathname.startsWith(`${href}/`)) return origen;
  }
  return null;
}

/**
 * A dónde lleva «volver».
 *
 * Sin sesión, siempre a la portada: los demás destinos están detrás de la
 * puerta y devolver a alguien a un formulario de acceso no es volver. Con
 * sesión, a donde estaba; y si no consta, al inicio del panel. La sesión no
 * se valida aquí —esta página no depende de ella—: si resulta estar muerta,
 * lo resuelve el destino como en cualquier otra navegación.
 */
export function volverDesdeAyuda({
  desde,
  haySesion,
}: {
  desde: OrigenAyuda | null;
  haySesion: boolean;
}): Vuelta {
  if (!haySesion) return PORTADA;
  return desde ? ORIGENES[desde] : INICIO;
}
