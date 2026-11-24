/**
 * Lo que puede salir de un proceso hacia un colector de errores. Nada más.
 *
 * ── Por qué una lista blanca ───────────────────────────────────────────────
 *
 * Esto sustituye a un redactor que borraba lo conocido: unas cabeceras, la
 * query, el cuerpo. Una lista de lo prohibido protege sólo de lo que alguien
 * recordó, y en una plataforma donde el cuerpo de una petición es lo que una
 * persona le escribe a Eco, lo que nadie recordó es justamente lo que duele:
 * las transacciones no pasaban por el redactor, la IP viajaba en una cabecera
 * que no estaba en la lista, y el mensaje de un error de base de datos lleva
 * dentro los argumentos de la consulta.
 *
 * Aquí no se borra nada: el evento se RECONSTRUYE desde cero con campos que
 * se pueden enumerar, y cada valor se contrasta con un conjunto cerrado. Lo que
 * no encaja no se recorta ni se disfraza: no sale.
 *
 * ── Qué es «cerrado» ───────────────────────────────────────────────────────
 *
 *   · el tipo de error, el código y las etiquetas: listas escritas en el código;
 *   · el mensaje: se traduce a una frase CONSTANTE que escribimos nosotros. Lo
 *     que decía el original no se copia, ni siquiera cuando parece técnico. Lo
 *     único que se conserva del original son números de tres cifras y nombres
 *     que están en una lista;
 *   · el fichero de un marco: tiene que ser un fichero real del despliegue. La
 *     pila de un error es una CADENA que cualquiera puede escribir, así que
 *     tener forma de ruta no demuestra nada;
 *   · el nombre de función: tiene que constar en ese fichero.
 *
 * ── Dos puertas ────────────────────────────────────────────────────────────
 *
 * `beforeSend` no cubre todo lo que un SDK envía: las transacciones tienen su
 * propio gancho, y las sesiones, los informes, los adjuntos, los comentarios y
 * el error que ocurre DENTRO de `beforeSend` no pasan por ninguno. Por eso la
 * puerta de verdad es `guardTransport`, que es por donde sale todo: sólo deja
 * pasar elementos `event`, y los reconstruye otra vez, cabeceras incluidas.
 *
 * No depende de nada y no importa ningún SDK: lo usan la API, el worker y los
 * tres entornos de Web con el cliente que corresponda a cada uno.
 */

// ── Identidad ───────────────────────────────────────────────────────────────

export const OBSERVABILITY_SERVICES = [
  "feelverse-api",
  "feelverse-worker",
  "feelverse-web-server",
  "feelverse-web-edge",
  "feelverse-web-browser",
  "feelverse-mobile",
] as const;
export type ObservabilityService = (typeof OBSERVABILITY_SERVICES)[number];

export type ObservabilityEnvironment =
  | "production"
  | "staging"
  | "development"
  | "test"
  | "undeclared";

/**
 * El entorno, tal como se declaró en `PSICO_ENV`.
 *
 * `undeclared` es deliberado: cuando nadie lo dijo, decirlo es más útil que
 * adivinarlo. Y no se mira `NODE_ENV`, que vale `production` en cualquier
 * construcción y por eso staging aparecía como producción.
 */
export function closedEnvironment(
  raw: string | null | undefined,
): ObservabilityEnvironment {
  const value = raw?.trim().toLowerCase();
  return value === "production" ||
    value === "staging" ||
    value === "development" ||
    value === "test"
    ? value
    : "undeclared";
}

/**
 * La versión: un SHA de commit, recortado a doce como en el resto del sistema.
 *
 * Cualquier otra cosa —`HEAD`, `unknown`, una cadena vacía— es `null`, y el
 * evento sale SIN versión. Es preferible a inventar una.
 */
export function closedRelease(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  return value && /^[0-9a-f]{7,40}$/.test(value) ? value.slice(0, 12) : null;
}

// ── Política de cada proceso ────────────────────────────────────────────────

export interface PublishableFile {
  /** Nombre publicable: relativo, sin origen, sin query. */
  readonly name: string;
  readonly inApp: boolean;
}

export interface ObservabilityPolicy {
  readonly service: ObservabilityService;
  readonly environment: ObservabilityEnvironment;
  readonly release: string | null;
  readonly platform: "node" | "javascript";
  /**
   * Traduce el fichero de un marco a su nombre publicable, o `null` si no es
   * un fichero del despliegue. Tiene que aceptar también su propia salida: la
   * segunda puerta vuelve a preguntar.
   */
  readonly file: (raw: string) => PublishableFile | null;
  /** Si ese nombre de función consta en ese fichero. */
  readonly fn: (name: string, rawFile: string) => boolean;
  /** Etiquetas propias de este proceso, cada una con su conjunto cerrado. */
  readonly tags?: Readonly<Record<string, (value: string) => boolean>>;
  /** Clases de error propias, además de las comunes. */
  readonly types?: ReadonlySet<string>;
  /** Códigos máquina propios, además de los comunes. */
  readonly codes?: ReadonlySet<string>;
}

// ── Forma de lo que sale ────────────────────────────────────────────────────

export interface SafeFrame {
  filename: string;
  function?: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

export interface SafeMechanism {
  type: string;
  handled?: boolean;
  synthetic?: boolean;
  source?: string;
  exception_id?: number;
  parent_id?: number;
  is_exception_group?: boolean;
}

export interface SafeException {
  type: string;
  value: string;
  mechanism?: SafeMechanism;
  stacktrace?: { frames: SafeFrame[] };
}

export type SafeLevel =
  | "fatal"
  | "error"
  | "warning"
  | "log"
  | "info"
  | "debug";

export interface SafeEvent {
  event_id?: string;
  timestamp?: number;
  platform: "node" | "javascript";
  level: SafeLevel;
  environment: ObservabilityEnvironment;
  release?: string;
  tags: Record<string, string>;
  exception?: { values: SafeException[] };
  message?: string;
  contexts?: { runtime: { name: string; version: string } };
  sdk: {
    name?: string;
    version?: string;
    settings: { infer_ip: "never" };
  };
}

// ── Vocabularios ────────────────────────────────────────────────────────────

/** Clase de error que no está en ninguna lista. */
export const UNLISTED_ERROR = "UnlistedError";
/** Fichero que no pertenece al despliegue. */
export const EXTERNAL_FILE = "[externo]";
/** Mensaje que no es una frase técnica conocida. */
export const OMITTED_MESSAGE = "[mensaje omitido]";

/**
 * Clases de error del lenguaje, del navegador y de las librerías que usamos.
 *
 * Es una lista y no un patrón porque `error.name` es una propiedad que
 * cualquiera puede escribir, y «termina en Error» lo cumple también una frase
 * pegada. Lo que falte aquí llega como `UnlistedError`, con su pila intacta:
 * se pierde una palabra, no el error.
 */
const KNOWN_TYPES: ReadonlySet<string> = /* @__PURE__ */ new Set([
  UNLISTED_ERROR,
  // Lenguaje
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "SuppressedError",
  "AssertionError",
  "SystemError",
  // Navegador
  "AbortError",
  "ChunkLoadError",
  "DataCloneError",
  "DOMException",
  "EncodingError",
  "InvalidAccessError",
  "InvalidCharacterError",
  "InvalidStateError",
  "NetworkError",
  "NotAllowedError",
  "NotFoundError",
  "NotReadableError",
  "NotSupportedError",
  "OperationError",
  "QuotaExceededError",
  "SecurityError",
  "TimeoutError",
  "UnknownError",
  "NonErrorRejection",
  // Nest
  "HttpException",
  "BadGatewayException",
  "BadRequestException",
  "ConflictException",
  "ForbiddenException",
  "GatewayTimeoutException",
  "GoneException",
  "InternalServerErrorException",
  "NotFoundException",
  "NotImplementedException",
  "PayloadTooLargeException",
  "ServiceUnavailableException",
  "ThrottlerException",
  "UnauthorizedException",
  "UnprocessableEntityException",
  "UnsupportedMediaTypeException",
  "RuntimeException",
  "UnknownDependenciesException",
  // Datos
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "PrismaClientRustPanicError",
  "PrismaClientUnknownRequestError",
  "PrismaClientValidationError",
  "DriverAdapterError",
  "DatabaseError",
  "ReplyError",
  "RedisError",
  "ParserError",
  "MaxRetriesPerRequestError",
  "ClusterAllFailedError",
  // Colas
  "DelayedError",
  "RateLimitError",
  "UnrecoverableError",
  "WaitingChildrenError",
  "WaitingError",
  // Proveedores
  "AnthropicError",
  "APIConnectionError",
  "APIConnectionTimeoutError",
  "APIError",
  "APIUserAbortError",
  "AuthenticationError",
  "BadRequestError",
  "ConflictError",
  "InternalServerError",
  "PermissionDeniedError",
  "UnprocessableEntityError",
  "VoyageAIError",
  "VoyageAITimeoutError",
  "StripeAPIError",
  "StripeAuthenticationError",
  "StripeCardError",
  "StripeConnectionError",
  "StripeError",
  "StripeIdempotencyError",
  "StripeInvalidRequestError",
  "StripePermissionError",
  "StripeRateLimitError",
  "StripeSignatureVerificationError",
  "AccessDenied",
  "CredentialsProviderError",
  "InvalidAccessKeyId",
  "NoSuchBucket",
  "NoSuchKey",
  "S3ServiceException",
  "SignatureDoesNotMatch",
  "WebPushError",
  "JsonWebTokenError",
  "NotBeforeError",
  "TokenExpiredError",
  "AxiosError",
  "GaxiosError",
  "ZodError",
  "ApiError",
]);

/** Códigos de Node, de red y de PostgreSQL. Los de Prisma tienen su patrón. */
const KNOWN_CODES: ReadonlySet<string> = /* @__PURE__ */ new Set([
  "ABORT_ERR",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "EACCES",
  "EADDRINUSE",
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EEXIST",
  "EHOSTUNREACH",
  "EMFILE",
  "ENETUNREACH",
  "ENOENT",
  "ENOMEM",
  "ENOSPC",
  "ENOTFOUND",
  "EPERM",
  "EPIPE",
  "EPROTO",
  "EROFS",
  "ETIMEDOUT",
  "ERR_HTTP_HEADERS_SENT",
  "ERR_INVALID_ARG_TYPE",
  "ERR_INVALID_ARG_VALUE",
  "ERR_INVALID_URL",
  "ERR_MODULE_NOT_FOUND",
  "ERR_OUT_OF_RANGE",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "ERR_STREAM_DESTROYED",
  "ERR_STREAM_PREMATURE_CLOSE",
  "ERR_STREAM_WRITE_AFTER_END",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_UNHANDLED_REJECTION",
  "ERR_UNHANDLED_ERROR",
  "MODULE_NOT_FOUND",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UND_ERR_ABORTED",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  // SQLSTATE que se ven de verdad
  "08001",
  "08003",
  "08006",
  "22001",
  "22P02",
  "23502",
  "23503",
  "23505",
  "23514",
  "25P02",
  "40001",
  "40P01",
  "42501",
  "42703",
  "42P01",
  "53100",
  "53200",
  "53300",
  "55P03",
  "57014",
  "57P01",
]);

const PRISMA_CODE = /^P[1-6]\d{3}$/;

/** Propiedades que se pueden nombrar en «Cannot read properties of …». */
const KNOWN_PROPS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  "body",
  "catch",
  "children",
  "code",
  "content",
  "createdAt",
  "current",
  "data",
  "entries",
  "filter",
  "find",
  "forEach",
  "get",
  "headers",
  "id",
  "includes",
  "items",
  "join",
  "json",
  "key",
  "length",
  "map",
  "message",
  "name",
  "ok",
  "path",
  "plan",
  "push",
  "reduce",
  "replace",
  "set",
  "slice",
  "some",
  "sort",
  "split",
  "startsWith",
  "status",
  "text",
  "then",
  "title",
  "toFixed",
  "toISOString",
  "toLowerCase",
  "toString",
  "trim",
  "type",
  "url",
  "userId",
  "value",
  "version",
]);

const MECHANISMS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  "generic",
  "chained",
  "instrument",
  "middleware",
  "onerror",
  "onuncaughtexception",
  "onunhandledrejection",
]);

const LEVELS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  "fatal",
  "error",
  "warning",
  "log",
  "info",
  "debug",
]);

const METHODS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Frases técnicas reconocidas, y la frase CONSTANTE por la que se sustituyen.
 *
 * Ninguna copia texto del original. Donde el original lleva algo útil —un
 * código de sistema, una propiedad, un estado HTTP, el número de un error
 * minificado—, la función lo contrasta con un conjunto cerrado antes de
 * escribirlo, y si no está, escribe la frase sin ello.
 */
type Rule = readonly [
  RegExp,
  string | ((m: RegExpMatchArray, policy: ObservabilityPolicy) => string),
];

const MESSAGE_RULES: readonly Rule[] = [
  // ── JavaScript ──
  [
    /^Cannot (read|set) properties of (undefined|null)(?: \((reading|setting) '([^']{1,40})'\))?/,
    (m) => {
      const prop =
        m[4] && KNOWN_PROPS.has(m[4])
          ? ` (${m[3] ?? "reading"} '${m[4]}')`
          : "";
      return `Cannot ${m[1]} properties of ${m[2]}${prop}`;
    },
  ],
  [/^Cannot destructure property/, "Cannot destructure property"],
  [/^[^\n]{0,300} is not a function/, "(…) is not a function"],
  [/^[^\n]{0,300} is not a constructor/, "(…) is not a constructor"],
  [/^[^\n]{0,300} is not iterable/, "(…) is not iterable"],
  [/^[^\n]{0,300} is not defined$/, "(…) is not defined"],
  [/^Can't find variable:/, "(…) is not defined"],
  [/^(?:undefined|null) is not an object/, "undefined is not an object"],
  [/ is not valid JSON/, "JSON inválido"],
  [
    /^Unexpected (?:token|non-whitespace character|end of JSON|string in JSON|number in JSON)/,
    "JSON inválido",
  ],
  [
    /^(?:Expected .{0,80} in JSON|Bad control character in|JSON\.parse:|JSON Parse error)/,
    "JSON inválido",
  ],
  [
    /^Converting circular structure to JSON/,
    "Converting circular structure to JSON",
  ],
  [/^Maximum call stack size exceeded/, "Maximum call stack size exceeded"],
  [/^Invalid array length/, "Invalid array length"],
  [/^Invalid string length/, "Invalid string length"],
  [/^Invalid time value/, "Invalid time value"],
  [/^Invalid URL/, "Invalid URL"],
  [/^Assignment to constant variable/, "Assignment to constant variable"],
  [/^Reduce of empty array/, "Reduce of empty array"],
  [/^Cannot find module/, "Cannot find module"],
  // ── Red ──
  [
    /^(connect|read|write|getaddrinfo|listen|bind|open|spawn) (E[A-Z0-9_]{2,24})\b/,
    (m) =>
      m[2] && KNOWN_CODES.has(m[2]) ? `${m[1]} ${m[2]}` : "error de sistema",
  ],
  [
    /^(E[A-Z]{3,16}): /,
    (m) => (m[1] && KNOWN_CODES.has(m[1]) ? m[1] : "error de sistema"),
  ],
  [/^error de sistema$/, "error de sistema"],
  [/^socket hang up/, "socket hang up"],
  [/^Client network socket disconnected/, "TLS: conexión cerrada"],
  [/^fetch failed/, "fetch failed"],
  [
    /^(?:Failed to fetch|Load failed|NetworkError when attempting)/,
    "Failed to fetch",
  ],
  [
    /^(?:The operation was aborted|This operation was aborted|The user aborted a request|signal is aborted)/,
    "operación abortada",
  ],
  [
    /^(?:timeout of \d+ms exceeded|timeout exceeded|Timeout exceeded|The operation timed out)/,
    "timeout exceeded",
  ],
  [
    /^(?:Request failed with status code|Status code:|Received status code|HTTP) ?([1-5]\d\d)\b/,
    (m) => `HTTP ${m[1]}`,
  ],
  // ── Datos ──
  [/^\s*Invalid `[^`]{1,80}` invocation/, "Prisma: consulta rechazada"],
  [
    /^(?:Unique constraint failed|duplicate key value violates unique constraint)/,
    "restricción única",
  ],
  [
    /^(?:Foreign key constraint|insert or update on table .{1,80} violates foreign key)/,
    "clave ajena",
  ],
  [/^deadlock detected/, "deadlock detected"],
  [/^could not serialize access/, "could not serialize access"],
  [/^canceling statement due to statement timeout/, "statement timeout"],
  [/^(?:relation|column) .{1,120} does not exist/, "esquema: no existe"],
  [/^Connection terminated/, "Connection terminated"],
  [/^Connection is closed/, "Connection is closed"],
  [
    /^(?:timeout exceeded when trying to connect|Query read timeout)/,
    "timeout exceeded",
  ],
  [/^Reached the max retries per request limit/, "Redis: reintentos agotados"],
  [/^Stream isn't writeable/, "Redis: sin conexión"],
  [
    /^(?:job stalled more than|Missing lock for job|could not renew lock)/i,
    "BullMQ: trabajo sin bloqueo",
  ],
  // ── HTTP ──
  [
    /^Cannot (?:set|append|remove|write) headers after they are sent/,
    "Cannot set headers after they are sent",
  ],
  [
    /^(?:Internal Server Error|Service Unavailable|Bad Gateway|Gateway Timeout|Not Implemented)(?: Exception)?$/,
    (m) => m[0],
  ],
  [/^(DEEPGRAM|WHISPER)_HTTP_([1-5]\d\d)$/, (m) => m[0]],
  // ── JWT ──
  [/^jwt (expired|malformed|signature is required|not active)$/, (m) => m[0]],
  [/^invalid (signature|token)$/, (m) => m[0]],
  // ── Eco: el servicio manda un error sintético; el detalle va en etiquetas ──
  [/^eco\.sendMessage\b/, "eco.sendMessage"],
  // ── React y Next ──
  [
    /^(?:Error: )?Minified React error #(\d{1,4})\b/,
    (m) => `Minified React error #${m[1]}`,
  ],
  [/^Hydration failed/, "Hydration failed"],
  [/^Text content does not match server-rendered HTML/, "Hydration failed"],
  [/^There was an error while hydrating/, "Hydration failed"],
  [
    /^Objects are not valid as a React child/,
    "Objects are not valid as a React child",
  ],
  [/^Loading (?:CSS )?chunk /, "Loading chunk failed"],
  [
    /^An error occurred in the Server Components render/,
    "error en un componente de servidor",
  ],
  [/^Failed to find Server Action/, "Failed to find Server Action"],
  [/^ResizeObserver loop/, "ResizeObserver loop"],
  [/^Script error\.?$/, "Script error"],
  [/^Failed to execute '/, "Failed to execute DOM method"],
  [/^Maximum update depth exceeded/, "Maximum update depth exceeded"],
];

const MARKER = /^\[mensaje omitido\](?: #[0-9a-f]{8})?$/;

/**
 * Las frases constantes, para que la segunda pasada las reconozca. Se calcula
 * al primer uso: evaluarla al cargar el módulo lo metería entero en cualquier
 * paquete de navegador que importe algo de `@psico/types`.
 */
let constantPhrases: ReadonlySet<string> | null = null;
function isConstantPhrase(value: string): boolean {
  constantPhrases ??= new Set(
    MESSAGE_RULES.map((r) => r[1]).filter(
      (v): v is string => typeof v === "string",
    ),
  );
  return constantPhrases.has(value);
}

/**
 * El mensaje que sale, o `null` si no es una frase técnica conocida.
 *
 * Es idempotente: lo que devuelve, al volver a pasar, se devuelve igual.
 */
export function safeMessage(
  raw: unknown,
  policy: ObservabilityPolicy,
): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (MARKER.test(raw)) return raw;
  if (isConstantPhrase(raw)) return raw;
  if (hasCode(raw, policy)) return raw;
  // Los patrones miran sólo el principio; un mensaje larguísimo no aporta nada
  // y sí puede costar.
  const head = raw.slice(0, 600);
  for (const [pattern, out] of MESSAGE_RULES) {
    const m = head.match(pattern);
    if (m) return typeof out === "string" ? out : out(m, policy);
  }
  return null;
}

function hasCode(
  value: string,
  policy: Pick<ObservabilityPolicy, "codes">,
): boolean {
  return (
    KNOWN_CODES.has(value) ||
    PRISMA_CODE.test(value) ||
    (policy.codes?.has(value) ?? false)
  );
}

export function isKnownCode(
  value: unknown,
  policy: Pick<ObservabilityPolicy, "codes">,
): value is string {
  return typeof value === "string" && hasCode(value, policy);
}

/** FNV-1a de 32 bits. Agrupa; no protege nada ni lo pretende. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ── Reconstrucción ──────────────────────────────────────────────────────────

type Loose = Record<string, unknown>;

function asObject(value: unknown): Loose | null {
  return typeof value === "object" && value !== null ? (value as Loose) : null;
}

function int(value: unknown, max: number): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
    ? value
    : undefined;
}

const MAX_FRAMES = 40;
const MAX_VALUES = 5;

function safeFrame(
  raw: unknown,
  policy: ObservabilityPolicy,
): SafeFrame | null {
  const f = asObject(raw);
  if (!f) return null;
  const rawFile = typeof f.filename === "string" ? f.filename : "";
  const file =
    rawFile && rawFile !== EXTERNAL_FILE ? policy.file(rawFile) : null;
  if (!file) return { filename: EXTERNAL_FILE, in_app: false };

  const out: SafeFrame = { filename: file.name, in_app: file.inApp };
  if (
    typeof f.function === "string" &&
    f.function !== "?" &&
    policy.fn(f.function, rawFile)
  ) {
    out.function = f.function;
  }
  const line = int(f.lineno, 300_000);
  const col = int(f.colno, 5_000_000);
  if (line !== undefined) out.lineno = line;
  if (col !== undefined) out.colno = col;
  return out;
}

function safeMechanism(raw: unknown): SafeMechanism | undefined {
  const m = asObject(raw);
  if (!m) return undefined;
  const out: SafeMechanism = {
    type:
      typeof m.type === "string" && MECHANISMS.has(m.type) ? m.type : "generic",
  };
  if (typeof m.handled === "boolean") out.handled = m.handled;
  if (typeof m.synthetic === "boolean") out.synthetic = m.synthetic;
  // `data`, `help_link`, `description` y lo que cuelgue un integrador, fuera.
  if (
    typeof m.source === "string" &&
    /^(?:cause|errors\[\d{1,3}\])$/.test(m.source)
  ) {
    out.source = m.source;
  }
  const id = int(m.exception_id, 1000);
  const parent = int(m.parent_id, 1000);
  if (id !== undefined) out.exception_id = id;
  if (parent !== undefined) out.parent_id = parent;
  if (typeof m.is_exception_group === "boolean") {
    out.is_exception_group = m.is_exception_group;
  }
  return out;
}

function safeType(raw: unknown, policy: ObservabilityPolicy): string {
  return typeof raw === "string" &&
    (KNOWN_TYPES.has(raw) || (policy.types?.has(raw) ?? false))
    ? raw
    : UNLISTED_ERROR;
}

function safeException(
  raw: unknown,
  policy: ObservabilityPolicy,
): SafeException | null {
  const e = asObject(raw);
  if (!e) return null;
  const type = safeType(e.type, policy);

  const rawFrames = asObject(e.stacktrace)?.frames;
  const frames = Array.isArray(rawFrames)
    ? rawFrames
        .slice(-MAX_FRAMES)
        .map((f) => safeFrame(f, policy))
        .filter((f): f is SafeFrame => f !== null)
    : [];

  // La huella sale de DÓNDE ocurrió, nunca de lo que decía: un resumen del
  // texto permitiría comprobar una sospecha sobre ese texto.
  const where = frames
    .filter((f) => f.in_app)
    .slice(-3)
    .map((f) => `${f.filename}:${f.function ?? ""}:${f.lineno ?? ""}`)
    .join("|");
  const value =
    safeMessage(e.value, policy) ??
    `${OMITTED_MESSAGE} #${fingerprint(`${type}|${where}`)}`;

  const out: SafeException = { type, value };
  const mechanism = safeMechanism(e.mechanism);
  if (mechanism) out.mechanism = mechanism;
  if (frames.length > 0) out.stacktrace = { frames };
  return out;
}

function safeTags(raw: unknown, policy: ObservabilityPolicy) {
  // La identidad la pone la política, no el evento: un `setTag("service", …)`
  // ajeno no la cambia.
  const out: Record<string, string> = {
    service: policy.service,
    runtime:
      policy.service === "feelverse-web-edge"
        ? "edge"
        : policy.platform === "node"
          ? "node"
          : "browser",
  };
  const tags = asObject(raw);
  if (!tags) return out;
  const { method, status, code, error_code: errorCode } = tags;
  if (typeof method === "string" && METHODS.has(method)) out.method = method;
  if (
    (typeof status === "string" || typeof status === "number") &&
    /^[45]\d\d$/.test(String(status))
  ) {
    out.status = String(status);
  }
  // `code` es el nuestro, el de la respuesta; `error_code`, el de la librería
  // que falló. Son dos preguntas distintas y las dos hacen falta.
  if (isKnownCode(code, policy)) out.code = code;
  if (isKnownCode(errorCode, policy)) out.error_code = errorCode;
  for (const [key, accepts] of Object.entries(policy.tags ?? {})) {
    const value = tags[key];
    if (
      (typeof value === "string" || typeof value === "number") &&
      accepts(String(value))
    ) {
      out[key] = String(value);
    }
  }
  return out;
}

/** El código del error original, o el de su causa. */
function codeOf(
  error: unknown,
  policy: ObservabilityPolicy,
): string | undefined {
  try {
    const own = asObject(error);
    const cause = asObject(own?.cause);
    return [own?.code, cause?.code].find((c): c is string =>
      isKnownCode(c, policy),
    );
  } catch {
    // Un getter que lanza no puede tumbar el informe del error.
    return undefined;
  }
}

/**
 * El evento reconstruido, o `null` si no es un error.
 *
 * Nunca lanza: si algo del original no se puede leer, el evento no sale. Que
 * lanzara sería peor que perderlo, porque el SDK informa del fallo de
 * `beforeSend` con otro evento que no vuelve a pasar por `beforeSend`.
 */
export function safeEvent(
  raw: unknown,
  policy: ObservabilityPolicy,
  hint?: { originalException?: unknown },
): SafeEvent | null {
  try {
    return rebuild(raw, policy, hint);
  } catch {
    return null;
  }
}

function rebuild(
  raw: unknown,
  policy: ObservabilityPolicy,
  hint?: { originalException?: unknown },
): SafeEvent | null {
  const event = asObject(raw);
  // Transacciones, comentarios, repeticiones y perfiles llevan `type`.
  if (!event || event.type !== undefined) return null;

  const sdk = asObject(event.sdk);
  const out: SafeEvent = {
    platform: policy.platform,
    level:
      typeof event.level === "string" && LEVELS.has(event.level)
        ? (event.level as SafeLevel)
        : "error",
    environment: policy.environment,
    tags: safeTags(event.tags, policy),
    sdk: {
      ...(typeof sdk?.name === "string" &&
      /^sentry\.javascript\.[a-z-]{1,24}$/.test(sdk.name)
        ? { name: sdk.name }
        : {}),
      ...(typeof sdk?.version === "string" &&
      /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(sdk.version)
        ? { version: sdk.version }
        : {}),
      // Le pide al receptor que no deduzca la IP de la conexión.
      settings: { infer_ip: "never" },
    },
  };
  if (policy.release) out.release = policy.release;
  if (
    typeof event.event_id === "string" &&
    /^[0-9a-f]{32}$/.test(event.event_id)
  ) {
    out.event_id = event.event_id;
  }
  if (typeof event.timestamp === "number" && Number.isFinite(event.timestamp)) {
    out.timestamp = event.timestamp;
  }
  const technical = codeOf(hint?.originalException, policy);
  if (technical) out.tags.error_code = technical;

  const runtime = asObject(asObject(event.contexts)?.runtime);
  if (
    runtime &&
    runtime.name === "node" &&
    typeof runtime.version === "string" &&
    /^v?\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(runtime.version)
  ) {
    out.contexts = { runtime: { name: "node", version: runtime.version } };
  }

  const values = asObject(event.exception)?.values;
  if (Array.isArray(values)) {
    // Sentry ordena de la causa más profunda al error que se lanzó: los
    // últimos son los que importan.
    const safe = values
      .slice(-MAX_VALUES)
      .map((v) => safeException(v, policy))
      .filter((v): v is SafeException => v !== null);
    if (safe.length > 0) out.exception = { values: safe };
  }
  if (!out.exception) {
    // Un `captureMessage`: el texto no sale, el hecho de que ocurrió sí.
    out.message = safeMessage(event.message, policy) ?? OMITTED_MESSAGE;
  }
  return out;
}

// ── La puerta del transporte ────────────────────────────────────────────────

export type SafeEnvelope = [
  {
    event_id?: string;
    sent_at: string;
    sdk?: { name?: string; version?: string };
  },
  [[{ type: "event" }, SafeEvent]],
];

/**
 * El sobre, reconstruido con lo único que puede llevar: un evento de error.
 *
 * Las cabeceras también se rehacen. La que trae el SDK incluye `trace`, el
 * contexto de muestreo, que transporta el nombre de la transacción y lo que
 * hubiera llegado en el `baggage` de quien llama.
 */
export function safeEnvelope(
  raw: unknown,
  policy: ObservabilityPolicy,
): SafeEnvelope | null {
  if (!Array.isArray(raw) || !Array.isArray(raw[1])) return null;
  for (const item of raw[1] as unknown[]) {
    if (!Array.isArray(item)) continue;
    if (asObject(item[0])?.type !== "event") continue;
    const event = safeEvent(item[1], policy);
    if (!event) continue;
    const { name, version } = event.sdk;
    return [
      {
        ...(event.event_id ? { event_id: event.event_id } : {}),
        sent_at: new Date().toISOString(),
        ...(name && version ? { sdk: { name, version } } : {}),
      },
      [[{ type: "event" }, event]],
    ];
  }
  return null;
}

interface AnyTransport {
  send(envelope: never): PromiseLike<unknown>;
  flush(timeout?: number): PromiseLike<boolean>;
}

/**
 * Envuelve la fábrica de transporte de un SDK para que sólo salgan errores
 * reconstruidos. Todo lo demás se descarta en silencio: no es un fallo del que
 * avisar, es la política.
 */
export function guardTransport<O, T extends AnyTransport>(
  make: (options: O) => T,
  policy: ObservabilityPolicy,
): (options: O) => T {
  return (options: O) => {
    const inner = make(options);
    return {
      send: (envelope: unknown) => {
        let safe: SafeEnvelope | null = null;
        try {
          safe = safeEnvelope(envelope, policy);
        } catch {
          safe = null;
        }
        return safe ? inner.send(safe as never) : Promise.resolve({});
      },
      flush: (timeout?: number) => inner.flush(timeout),
    } as unknown as T;
  };
}

/**
 * Las opciones comunes a todos los clientes.
 *
 * No aparecen `tracesSampleRate` ni `tracesSampler`, y no es un olvido: en la
 * 8.x basta con que la clave EXISTA para que el trazado se considere activo, y
 * un `0` no impide que prevalezca la decisión que traiga la petición en
 * `sentry-trace`. Sin la clave, el trazado está apagado.
 */
export function guardedOptions(policy: ObservabilityPolicy) {
  return {
    environment: policy.environment as string,
    ...(policy.release ? { release: policy.release } : {}),
    sendDefaultPii: false,
    sendClientReports: false,
    attachStacktrace: false,
    maxBreadcrumbs: 0,
    tracePropagationTargets: [] as string[],
    beforeBreadcrumb: () => null,
    beforeSend: (event: unknown, hint?: { originalException?: unknown }) =>
      safeEvent(event, policy, hint),
    beforeSendTransaction: () => null,
  };
}

// ── Marcos de pila en un proceso de Node ────────────────────────────────────

/** Lo que esto necesita del sistema de ficheros, inyectado. */
export interface NodeFrameIo {
  /** Raíz del despliegue, ya resuelta (sin enlaces simbólicos). */
  readonly root: string;
  /** Si es un fichero que existe. */
  readonly exists: (absolute: string) => boolean;
  readonly read: (absolute: string) => string | null;
  /** Si es un módulo público de Node (`http`, `fs/promises`). */
  readonly isBuiltin: (name: string) => boolean;
}

const FUNCTION_WORDS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  "Array",
  "ClientRequest",
  "EventEmitter",
  "Function",
  "Immediate",
  "IncomingMessage",
  "JSON",
  "Map",
  "Module",
  "Object",
  "Promise",
  "Server",
  "Set",
  "Socket",
  "String",
  "Timeout",
  "anonymous",
  "apply",
  "as",
  "async",
  "call",
  "emit",
  "forEach",
  "get",
  "index",
  "map",
  "new",
  "next",
  "parse",
  "process",
  "processTicksAndRejections",
  "runMicrotasks",
  "set",
  "then",
]);

const FUNCTION_SHAPE = /^[\w$.<>[\] ()]{1,120}$/;

function functionTokens(name: string): string[] | null {
  if (!FUNCTION_SHAPE.test(name)) return null;
  if (/\d{4,}/.test(name)) return null;
  return name.match(/[A-Za-z_$][\w$]*/g);
}

const CACHE_MAX = 2000;

/**
 * Verificación de marcos contra los ficheros del despliegue.
 *
 * Un marco sólo conserva su fichero si ese fichero EXISTE bajo la raíz, y su
 * función si cada palabra del nombre aparece en ese fichero. Es lo que separa
 * una pila de verdad de una cadena escrita en `error.stack`.
 */
export function nodeFrames(
  io: NodeFrameIo,
): Pick<ObservabilityPolicy, "file" | "fn"> {
  const files = new Map<string, { abs: string; out: PublishableFile } | null>();
  const functions = new Map<string, boolean>();

  const lookup = (raw: string) => {
    const hit = files.get(raw);
    if (hit !== undefined) return hit;
    if (files.size > CACHE_MAX) files.clear();

    const path = raw.startsWith("file://") ? raw.slice(7) : raw;
    const abs = path.startsWith("/") ? path : `${io.root}/${path}`;
    let entry: { abs: string; out: PublishableFile } | null = null;
    if (
      abs.startsWith(`${io.root}/`) &&
      !abs.split("/").includes("..") &&
      io.exists(abs)
    ) {
      const rel = abs.slice(io.root.length + 1);
      const dep = rel.lastIndexOf("node_modules/");
      entry = {
        abs,
        out: {
          name: dep >= 0 ? rel.slice(dep) : rel,
          inApp: dep < 0,
        },
      };
      // La segunda puerta pregunta por el nombre ya publicado.
      files.set(entry.out.name, entry);
    }
    files.set(raw, entry);
    return entry;
  };

  return {
    file(raw) {
      if (raw.startsWith("node:")) {
        return {
          name: io.isBuiltin(raw.slice(5)) ? raw : "node:internal",
          inApp: false,
        };
      }
      return lookup(raw)?.out ?? null;
    },
    fn(name, rawFile) {
      const tokens = functionTokens(name);
      if (!tokens || tokens.length === 0) return false;
      if (tokens.every((t) => FUNCTION_WORDS.has(t))) return true;
      if (rawFile.startsWith("node:")) return false;
      const entry = lookup(rawFile);
      if (!entry) return false;
      const key = `${entry.out.name}\0${name}`;
      const known = functions.get(key);
      if (known !== undefined) return known;
      if (functions.size > CACHE_MAX) functions.clear();
      const text = io.read(entry.abs);
      const ok =
        text !== null &&
        tokens.every((t) => FUNCTION_WORDS.has(t) || text.includes(t));
      functions.set(key, ok);
      return ok;
    },
  };
}

/**
 * Función publicable cuando no se puede abrir el fichero (Edge, navegador).
 *
 * El código va minificado, así que un nombre legítimo mide una, dos o tres
 * letras. Lo que mida más no se puede comprobar, y no sale.
 */
export function isMinifiedFunction(name: string): boolean {
  const tokens = functionTokens(name);
  return (
    tokens !== null &&
    tokens.length > 0 &&
    tokens.every((t) => FUNCTION_WORDS.has(t) || t.length <= 3)
  );
}
