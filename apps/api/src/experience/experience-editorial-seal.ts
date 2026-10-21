import { createHash } from "node:crypto";
import type { ChapterExperienceDefinition } from "@psico/types";

/**
 * B3 — qué autoriza publicar una experiencia.
 *
 * El ADR 0027 midió que no había control: los manifiestos declaran
 * `publishAllowed: false`, `canonicalSha256` y `approvalReferences`, pero esos
 * campos los leía una sola herramienta —la que CREA los borradores— y después
 * nadie volvía a mirarlos. No llegaban a la base, y `publish` validaba
 * estructura, pin y reserva sin preguntar nada editorial. El rol ADMIN era el
 * único filtro: una respuesta a «quién entra», no a «qué está aprobado».
 *
 * Este módulo es la parte que decide, y es pura a propósito: una función sobre
 * un sello y una definición, sin Prisma, sin Nest y sin red. El servicio lee la
 * fila y aplica el veredicto; nada más.
 *
 * ── Por qué un sello y no una columna booleana ─────────────────────────────
 *
 * Una aprobación no es «sí» a secas. Es «sí, a ESTE contenido, de ESTA
 * identidad, salido de ESTA revisión del manuscrito». Un booleano sobrevive a
 * una edición posterior y sigue diciendo que sí sobre un texto que nadie
 * aprobó. Por eso el sello guarda las tres cosas y la publicación las vuelve a
 * comprobar:
 *
 *   - **identidad** — `experienceKey@version` y el pin de guía;
 *   - **revisión**  — `canonicalVersion` y `canonicalSha256` del manuscrito;
 *   - **contenido** — `definitionSha256`, el resumen de lo que se aprobó.
 *
 * Editar el borrador después no borra el sello: lo deja **obsoleto**, y el
 * veredicto lo dice con esas palabras. Conservar el sello es lo que permite
 * contar qué pasó; perderlo sería borrar la huella de la aprobación anterior.
 *
 * ── Y por qué «sin sello» no pasa ──────────────────────────────────────────
 *
 * El ADR 0027 proponía dejar pasar las filas sin sello y anotarlo en el log,
 * para no convertir una mejora en una interrupción. Eso deja abierta
 * exactamente la puerta que esto viene a cerrar: basta con crear la fila por
 * un camino sin manifiesto para publicar sin aprobación. Aquí **no pasa
 * ninguna**, y las dos razones por las que una fila puede no tener sello se
 * distinguen en el veredicto porque piden cosas distintas a quien las lee:
 *
 *   - `legacy_unsealed` — existía antes de que este control existiera. No es
 *     una irregularidad: es historia. Necesita que la herramienta la vuelva a
 *     sellar contra su manifiesto.
 *   - `unsealed` — se creó por un camino que no tiene manifiesto (el editor,
 *     o una versión clonada hacia adelante). Necesita una decisión editorial
 *     que todavía no existe.
 *
 * Las dos se niegan. Confundirlas haría que un vacío de migración y un intento
 * de saltarse el circuito se leyeran igual.
 */

/** El sello que escribe la herramienta que conoce el manifiesto. */
export interface ManifestSeal {
  kind: "manifest";
  manifestId: string;
  canonicalVersion: string;
  canonicalSha256: string;
  manifestSha256: string;
  /** Lo que el manifiesto declara sobre publicar. Hoy, siempre `false`. */
  publishAllowed: boolean;
  /** Cuántas referencias de aprobación trae. No se copian sus contenidos. */
  approvalCount: number;
  /** Identidad aprobada, para que un sello no valga para otra fila. */
  experienceKey: string;
  experienceVersion: number;
  guideKey: string;
  guideVersion: number;
  /** El resumen del contenido aprobado. Una edición posterior lo invalida. */
  definitionSha256: string;
  sealedAt: string;
}

/** Nació por un camino sin manifiesto: el editor, o un clon hacia adelante. */
export interface UnsealedMarker {
  kind: "unsealed";
  reason: "created_without_manifest" | "cloned_forward";
  at: string;
}

/** Existía antes de este control. La migración la marca así, no la inventa. */
export interface LegacyUnsealedMarker {
  kind: "legacy_unsealed";
  at: string;
}

export type EditorialSeal =
  | ManifestSeal
  | UnsealedMarker
  | LegacyUnsealedMarker;

export type PublicationVerdictCode =
  | "EXPERIENCE_APPROVAL_UNREADABLE"
  | "EXPERIENCE_APPROVAL_ABSENT_LEGACY"
  | "EXPERIENCE_APPROVAL_ABSENT"
  | "EXPERIENCE_NOT_APPROVED"
  | "EXPERIENCE_APPROVAL_STALE"
  | "EXPERIENCE_APPROVAL_IDENTITY_MISMATCH";

export type PublicationVerdict =
  | { approved: true }
  | { approved: false; code: PublicationVerdictCode; message: string };

/**
 * El resumen del contenido aprobado.
 *
 * Serialización canónica —claves ordenadas, en profundidad— para que dos
 * objetos iguales den el mismo resumen aunque el orden de sus claves difiera.
 * Sin esto, guardar la misma definición con otro orden de campos leería como
 * una edición y dejaría la aprobación obsoleta sin que nadie hubiera tocado el
 * texto.
 *
 * `status` se excluye del resumen a propósito: la definición viaja como DRAFT
 * y se guarda como PUBLISHED en el mismo acto de publicar, así que incluirlo
 * haría que toda aprobación se invalidara justo al usarse.
 */
export function definitionDigest(
  definition: ChapterExperienceDefinition,
): string {
  const { status: _status, ...resto } = definition as Record<string, unknown> &
    ChapterExperienceDefinition;
  return createHash("sha256").update(canonicalJson(resto)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entradas = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entradas
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}

/** Lo mínimo del manifiesto que el sello necesita. */
export interface SealableManifest {
  manifestId: string;
  canonicalVersion: string;
  canonicalSha256: string;
  manifestSha256: string;
  publishAllowed: boolean;
  approvalReferences: readonly unknown[];
  experienceKey: string;
  experienceVersion: number;
  guideKey: string;
  guideVersion: number;
}

export function sealForManifest(
  manifest: SealableManifest,
  definition: ChapterExperienceDefinition,
  now: Date = new Date(),
): ManifestSeal {
  return {
    kind: "manifest",
    manifestId: manifest.manifestId,
    canonicalVersion: manifest.canonicalVersion,
    canonicalSha256: manifest.canonicalSha256,
    manifestSha256: manifest.manifestSha256,
    publishAllowed: manifest.publishAllowed,
    approvalCount: manifest.approvalReferences.length,
    experienceKey: manifest.experienceKey,
    experienceVersion: manifest.experienceVersion,
    guideKey: manifest.guideKey,
    guideVersion: manifest.guideVersion,
    definitionSha256: definitionDigest(definition),
    sealedAt: now.toISOString(),
  };
}

export function unsealed(
  reason: UnsealedMarker["reason"],
  now: Date = new Date(),
): UnsealedMarker {
  return { kind: "unsealed", reason, at: now.toISOString() };
}

/**
 * Lee lo que hay en la columna. Falla cerrado: cualquier cosa que no sea uno
 * de los tres sellos conocidos es `null`, y `null` se niega.
 */
export function parseEditorialSeal(value: unknown): EditorialSeal | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.kind === "legacy_unsealed" && typeof raw.at === "string") {
    return { kind: "legacy_unsealed", at: raw.at };
  }
  if (
    raw.kind === "unsealed" &&
    typeof raw.at === "string" &&
    (raw.reason === "created_without_manifest" ||
      raw.reason === "cloned_forward")
  ) {
    return { kind: "unsealed", reason: raw.reason, at: raw.at };
  }
  if (raw.kind !== "manifest") return null;
  const cadenas = [
    "manifestId",
    "canonicalVersion",
    "canonicalSha256",
    "manifestSha256",
    "experienceKey",
    "guideKey",
    "definitionSha256",
    "sealedAt",
  ] as const;
  for (const campo of cadenas) {
    if (typeof raw[campo] !== "string" || raw[campo] === "") return null;
  }
  if (typeof raw.publishAllowed !== "boolean") return null;
  for (const numero of [
    "approvalCount",
    "experienceVersion",
    "guideVersion",
  ] as const) {
    if (typeof raw[numero] !== "number" || !Number.isInteger(raw[numero])) {
      return null;
    }
  }
  return raw as unknown as ManifestSeal;
}

/**
 * ¿Puede publicarse esta fila?
 *
 * Orden deliberado. Primero la ausencia —porque es el caso que el ADR 0027
 * dejaba pasar—, después la identidad, después la autorización del manifiesto
 * y por último la frescura. Así, un sello de otra experiencia se reporta como
 * lo que es y no como «no aprobada», que sería cierto pero inútil.
 */
export function evaluatePublicationGate(input: {
  seal: EditorialSeal | null;
  definition: ChapterExperienceDefinition;
}): PublicationVerdict {
  const { seal, definition } = input;

  if (seal === null) {
    return {
      approved: false,
      code: "EXPERIENCE_APPROVAL_UNREADABLE",
      message:
        "Este borrador no tiene una procedencia editorial que se pueda leer, " +
        "así que no puede publicarse.",
    };
  }

  if (seal.kind === "legacy_unsealed") {
    return {
      approved: false,
      code: "EXPERIENCE_APPROVAL_ABSENT_LEGACY",
      message:
        "Este borrador es anterior al control de publicación: existe, pero " +
        "nunca registró de qué manifiesto viene. Vuelve a prepararlo con la " +
        "herramienta para que quede sellado.",
    };
  }

  if (seal.kind === "unsealed") {
    return {
      approved: false,
      code: "EXPERIENCE_APPROVAL_ABSENT",
      message:
        seal.reason === "cloned_forward"
          ? "Esta versión se clonó de otra publicada. La aprobación de la " +
            "anterior no la cubre: necesita la suya."
          : "Este borrador se creó sin manifiesto, así que no hay aprobación " +
            "editorial que lo respalde.",
    };
  }

  const mismaIdentidad =
    seal.experienceKey === definition.experienceKey &&
    seal.experienceVersion === definition.experienceVersion &&
    seal.guideKey === definition.guidePin.guideKey &&
    seal.guideVersion === definition.guidePin.guideVersion;
  if (!mismaIdentidad) {
    return {
      approved: false,
      code: "EXPERIENCE_APPROVAL_IDENTITY_MISMATCH",
      message:
        "La aprobación guardada es de otra experiencia o de otra guía, así " +
        "que no autoriza a publicar esta.",
    };
  }

  if (!seal.publishAllowed) {
    return {
      approved: false,
      code: "EXPERIENCE_NOT_APPROVED",
      message:
        `El manifiesto ${seal.manifestId} declara que esta experiencia no ` +
        "puede publicarse todavía. La decisión es editorial y se toma ahí, " +
        "no aquí.",
    };
  }

  if (seal.definitionSha256 !== definitionDigest(definition)) {
    return {
      approved: false,
      code: "EXPERIENCE_APPROVAL_STALE",
      message:
        "El borrador cambió después de aprobarse, así que la aprobación ya " +
        "no corresponde a este contenido.",
    };
  }

  return { approved: true };
}
