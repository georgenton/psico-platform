import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * De qué se cayó Eco, dicho con suficiente precisión para arreglarlo.
 *
 * ── El problema observado ──────────────────────────────────────────────────
 *
 * El envío de un mensaje a Eco atraviesa dos dependencias externas: primero
 * pide un embedding para recuperar contexto, y sólo después llama al modelo.
 * Cuando cualquiera de las dos falla, el servicio captura la excepción, emite
 * un `error` por el stream y escribe una línea de registro.
 *
 * Esa línea decía únicamente `Eco sendMessage failed: Status code: 401`. Con
 * dos integraciones en el mismo camino, eso no basta para saber cuál respondió
 * —me costó una tarde descubrir que era el servicio de embeddings y no el
 * modelo— y quien lee la alerta no puede decidir a quién escribirle.
 *
 * ── Qué hace este archivo, y qué NO ────────────────────────────────────────
 *
 * Etiqueta el error con la etapa y la dependencia donde ocurrió, y lo clasifica
 * en una categoría segura. Nada más. No es una capa de observabilidad nueva:
 * no hay transporte propio, ni métricas, ni identificadores inventados. El
 * proyecto no tiene identificador de correlación HTTP, así que no se crea uno;
 * para correlacionar ya existe el `id` del mensaje del usuario, que el servicio
 * persiste ANTES de llamar a ningún proveedor.
 *
 * ── Qué NO puede viajar aquí ───────────────────────────────────────────────
 *
 * Ni el texto de la persona, ni la respuesta del modelo, ni cuerpos de
 * petición, ni claves. La categoría es un token cerrado y la etapa y la
 * dependencia son constantes del código. Lo único que proviene del exterior es
 * el código de estado HTTP, que es un número.
 */

/**
 * Dónde estaba el envío cuando se rompió.
 *
 * `unknown` no es relleno: es lo que corresponde cuando el error escapó de una
 * etapa sin etiquetar. Decirlo es más útil que atribuirlo a la última etapa por
 * descarte, que es como se fabrica una pista falsa.
 */
export type EcoStage =
  | "quota"
  | "persistence"
  | "embeddings"
  | "retrieval"
  | "model"
  | "finalize"
  | "unknown";

/** Quién no respondió. `internal` es «nosotros», no un tercero. */
export type EcoDependency = "anthropic" | "voyage" | "database" | "internal";

/**
 * Categoría segura del fallo.
 *
 * Deliberadamente gruesa: distingue lo que cambia la decisión de quien
 * responde a la alerta, y nada más.
 *
 * - `upstream_auth`      — el tercero nos rechazó por credencial (401/403).
 *   Es configuración nuestra, no una caída suya.
 * - `upstream_rate_limit` — 429. Esperar y reintentar tiene sentido.
 * - `upstream_unavailable` — 5xx o error de red. El tercero está caído.
 * - `upstream_rejected`  — otro 4xx: le mandamos algo que no acepta.
 * - `internal`           — nuestro código o nuestra base.
 * - `deliberate_refusal` — no es un fallo: el servicio dijo que no a
 *   propósito (cuota agotada, hilo ajeno). Se separa porque la primera
 *   versión de este archivo leía el `statusCode` de esas negativas y escribía
 *   `upstreamStatus=402` — un código NUESTRO presentado como si lo hubiera
 *   devuelto un tercero. Esa es justo la atribución falsa que esto evita.
 */
export type EcoFailureCategory =
  | "upstream_auth"
  | "upstream_rate_limit"
  | "upstream_unavailable"
  | "upstream_rejected"
  | "internal"
  | "deliberate_refusal";

export interface EcoFailureAttribution {
  readonly stage: EcoStage;
  readonly dependency: EcoDependency;
  readonly category: EcoFailureCategory;
  /** Código HTTP del tercero, cuando lo hubo. Un número, nunca un cuerpo. */
  readonly upstreamStatus: number | null;
}

/**
 * Un error que sabe dónde ocurrió.
 *
 * Conserva el original en `original` en vez de sustituirlo: la traza del SDK
 * es justo lo que hace falta para depurar, y perderla para ganar una etiqueta
 * sería un mal negocio. Se guarda como campo propio y no en `Error.cause`
 * porque el `lib` de TypeScript de este proyecto no declara esa propiedad, y
 * añadirla al `tsconfig` para esto sería mover un ajuste global por comodidad
 * de un archivo.
 */
export class EcoStageError extends Error {
  constructor(
    readonly stage: EcoStage,
    readonly dependency: EcoDependency,
    readonly original: unknown,
  ) {
    super(original instanceof Error ? original.message : String(original));
    this.name = "EcoStageError";
    // El stack que importa es el del SDK, no el de esta envoltura.
    if (original instanceof Error && original.stack)
      this.stack = original.stack;
  }
}

/**
 * Ejecuta una etapa y, si lanza, la etiqueta.
 *
 * Un `HttpException` pasa intacto: son las negativas deliberadas del propio
 * servicio —cuota agotada, hilo ajeno— y ya llevan su código y su mensaje.
 * Envolverlas las convertiría en fallos de dependencia, que es exactamente la
 * confusión que este archivo existe para evitar.
 */
export async function runStage<T>(
  stage: EcoStage,
  dependency: EcoDependency,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof EcoStageError) throw err;
    if (esHttpException(err)) throw err;
    throw new EcoStageError(stage, dependency, err);
  }
}

/** El estado de un `HttpException`, leído por su forma observable. */
function estadoDeHttpException(err: unknown): number | null {
  const fn = (err as { getStatus?: () => unknown }).getStatus;
  if (typeof fn !== "function") return null;
  try {
    const v = fn.call(err);
    return typeof v === "number" && Number.isInteger(v) ? v : null;
  } catch {
    return null;
  }
}

/** `HttpException` sin importar Nest aquí: basta su forma observable. */
function esHttpException(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { getStatus?: unknown }).getStatus === "function"
  );
}

/**
 * El estado HTTP que reporta el tercero, si lo reporta.
 *
 * Los SDK de Anthropic y de Voyage exponen `status` o `statusCode` en sus
 * errores. Se leen ambos, y se comprueba que sea un entero plausible: un campo
 * con cualquier otra cosa no se propaga.
 */
export function upstreamStatusOf(err: unknown): number | null {
  const e = err as { status?: unknown; statusCode?: unknown } | null;
  for (const v of [e?.status, e?.statusCode]) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 100 && v < 600) {
      return v;
    }
  }
  return null;
}

/** Clasifica, sin mirar nunca el cuerpo del error. */
export function classifyEcoFailure(err: unknown): EcoFailureAttribution {
  // Una negativa deliberada del servicio no es un fallo de nadie, y su código
  // es nuestro: leerlo como `upstreamStatus` inventaría un tercero.
  //
  // Pero tener `getStatus()` no basta para llamarla deliberada. Un 500 o un
  // 503 lanzados como `HttpException` son un fallo NUESTRO, y clasificarlos
  // como «dijimos que no a propósito» los sacaba del registro de errores y de
  // Sentry — exactamente los que hay que mirar. Sólo los 4xx son negativas.
  if (esHttpException(err)) {
    const estado = estadoDeHttpException(err);
    const esNegativa = estado !== null && estado >= 400 && estado < 500;
    return {
      stage: "unknown",
      dependency: "internal",
      category: esNegativa ? "deliberate_refusal" : "internal",
      upstreamStatus: null,
    };
  }

  const etiquetado = err instanceof EcoStageError;
  const stage: EcoStage = etiquetado ? err.stage : "unknown";
  const dependency: EcoDependency = etiquetado ? err.dependency : "internal";
  const original = etiquetado ? err.original : err;
  const upstreamStatus = upstreamStatusOf(original);

  let category: EcoFailureCategory;
  if (dependency === "internal" || dependency === "database") {
    category = "internal";
  } else if (upstreamStatus === 401 || upstreamStatus === 403) {
    category = "upstream_auth";
  } else if (upstreamStatus === 429) {
    category = "upstream_rate_limit";
  } else if (upstreamStatus !== null && upstreamStatus >= 500) {
    category = "upstream_unavailable";
  } else if (upstreamStatus !== null && upstreamStatus >= 400) {
    category = "upstream_rejected";
  } else {
    // Sin estado: no hubo respuesta. Un fallo de red hacia un tercero es una
    // caída suya desde nuestro punto de vista, no un error nuestro.
    category = "upstream_unavailable";
  }

  return { stage, dependency, category, upstreamStatus };
}

/**
 * La línea que se escribe en el registro.
 *
 * Sólo constantes del código y un número. Se construye aquí, y no en el
 * servicio, para que el trinquete de privacidad tenga un único sitio que
 * vigilar.
 */
export function describeEcoFailure(
  attribution: EcoFailureAttribution,
  correlation: { threadId?: string; messageId?: string } = {},
): string {
  const partes = [
    `stage=${attribution.stage}`,
    `dependency=${attribution.dependency}`,
    `category=${attribution.category}`,
  ];
  if (attribution.upstreamStatus !== null) {
    partes.push(`upstreamStatus=${attribution.upstreamStatus}`);
  }
  if (correlation.threadId) partes.push(`threadId=${correlation.threadId}`);
  if (correlation.messageId) partes.push(`messageId=${correlation.messageId}`);
  return partes.join(" ");
}

/**
 * Último filtro de forma — NO la barrera.
 *
 * Esta función comprueba que una correlación tenga forma de identificador, y
 * eso por sí solo **no demuestra nada**: una cadena alfanumérica cualquiera la
 * pasa. Es exactamente lo que la revisión señaló, y el contraejemplo está en
 * `eco.service.spec.ts`: un `threadId` inventado por el cliente, bien formado
 * y ajeno, aterrizaba en el registro y en Sentry.
 *
 * La barrera de verdad vive en quien llama: `runSendMessage` sólo pasa un
 * identificador DESPUÉS de que la consulta de pertenencia haya devuelto un
 * hilo de esa persona. Si el fallo ocurre antes, no hay correlación.
 *
 * Esto se conserva como segunda red: impide que un salto de línea o un texto
 * largo ensucien el registro aunque el primer filtro algún día falle.
 */
export function correlacionSegura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  return /^[A-Za-z0-9_-]{1,64}$/.test(valor) ? valor : null;
}

/**
 * Las trazas sin el mensaje.
 *
 * La primera línea de un `stack` ES el mensaje del error, así que entregar el
 * stack entero entrega también el texto crudo del proveedor. Los marcos son
 * rutas y números: sirven para localizar el fallo y no pueden llevar datos de
 * una persona. Se recortan además a unos pocos, porque el resto es ruido del
 * framework.
 */
export function marcosSeguros(err: unknown, maximo = 8): string[] {
  const stack =
    err instanceof Error && typeof err.stack === "string" ? err.stack : "";
  return stack
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at "))
    .map(ubicacionDelMarco)
    .filter((l): l is string => l !== null)
    .slice(0, maximo);
}

/**
 * La raíz de nuestro propio código.
 *
 * Este archivo vive en `apps/api/src/eco` y, compilado, en `apps/api/dist/eco`.
 * Dos niveles arriba es `apps/api` en los dos casos, así que sirve como la
 * frontera entre «esto lo escribimos nosotros» y todo lo demás.
 */
const RAIZ_APP = resolve(__dirname, "..", "..");

/**
 * De un marco, sólo su ubicación — y sólo si la ubicación es NUESTRA.
 *
 * Dos recortes, y cada uno lo pidió un contraejemplo.
 *
 * El primero: un marco es `at <nombre> (<ubicación>)` y ese `<nombre>` es
 * texto arbitrario —el nombre de una función generada, o lo que un SDK ponga
 * ahí—. Se descarta y queda la ubicación.
 *
 * El segundo: la ubicación tampoco es de fiar por sí sola. El stack de un
 * error ajeno puede traer la ruta de un fichero temporal, o una URL con un
 * token en la query —`at https://proveedor/v1?token=…:2:2`—, y eso acabaría
 * en el registro y en Sentry. Así que sólo sobreviven los marcos bajo
 * `RAIZ_APP`, y se emiten RELATIVOS a ella: localizan el fallo sin publicar
 * rutas de la máquina ni nada de procedencia desconocida.
 *
 * Lo que se pierde —los marcos de `node_modules` y del runtime— casi nunca
 * dice dónde está nuestro error, y su coste aquí es que podrían no ser
 * nuestros.
 */
function ubicacionDelMarco(linea: string): string | null {
  const entreParentesis = linea.match(/\(([^()]+:\d+:\d+)\)\s*$/);
  const desnudo = linea.match(/^at\s+([^\s()]+:\d+:\d+)$/);
  const bruto = entreParentesis?.[1] ?? desnudo?.[1] ?? null;
  if (bruto === null) return null;

  // `/ruta/archivo.ts:12:3` → separar la parte de fichero.
  const partido = bruto.match(/^(.*):(\d+):(\d+)$/);
  if (!partido) return null;
  const [, fichero, linea_, columna] = partido;
  if (!fichero) return null;

  // Una URL no es una ruta nuestra, por mucho que termine en `:1:1`.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(fichero)) return null;

  const absoluto = isAbsolute(fichero) ? fichero : resolve(RAIZ_APP, fichero);
  const relativo = relative(RAIZ_APP, absoluto);
  // Fuera de la raíz: `relative` empieza por `..`, o el camino es absoluto
  // porque está en otro volumen.
  if (relativo.startsWith("..") || isAbsolute(relativo)) return null;
  // `node_modules` está bajo la raíz pero no es código nuestro.
  if (relativo.split(sep).includes("node_modules")) return null;

  return `${relativo}:${linea_}:${columna}`;
}

/**
 * Lo único que sale de aquí hacia el registro y hacia Sentry.
 *
 * Deliberadamente NO lleva el error original, su `message`, su `stack`
 * completo, su `cause`, su `original`, ni ninguna propiedad que el SDK haya
 * colgado —un `response.body` de un proveedor puede traer el texto que se le
 * envió—. Lo que lleva: constantes del código, un número de estado y marcos.
 */
export interface EcoSafeFailure {
  readonly surface: "eco.sendMessage";
  readonly stage: EcoStage;
  readonly dependency: EcoDependency;
  readonly category: EcoFailureCategory;
  readonly upstreamStatus: number | null;
  readonly threadId: string | null;
  readonly frames: string[];
}

export function toSafeFailure(
  err: unknown,
  correlation: { threadId?: unknown } = {},
): EcoSafeFailure {
  const a = classifyEcoFailure(err);
  return {
    surface: "eco.sendMessage",
    stage: a.stage,
    dependency: a.dependency,
    category: a.category,
    upstreamStatus: a.upstreamStatus,
    threadId: correlacionSegura(correlation.threadId),
    frames: marcosSeguros(err),
  };
}
