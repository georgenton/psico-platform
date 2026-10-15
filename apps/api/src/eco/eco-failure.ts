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
  if (esHttpException(err)) {
    return {
      stage: "unknown",
      dependency: "internal",
      category: "deliberate_refusal",
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
