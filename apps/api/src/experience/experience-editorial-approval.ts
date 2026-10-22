import { createPublicKey, verify as verifySignature } from "node:crypto";

/**
 * B4 — qué convierte una decisión autoral en algo que el sistema puede
 * comprobar.
 *
 * B3 cerró el agujero de publicar sin aprobación: la fila lleva su
 * procedencia y `publish` la comprueba. Pero la aprobación misma seguía siendo
 * un campo en un fichero —`publishAllowed`— y un campo en un fichero no
 * distingue entre «la autora decidió» y «alguien con acceso al repositorio
 * escribió `true`». Eso no es una aprobación: es una nota.
 *
 * ── Por qué una firma y no una bandera ─────────────────────────────────────
 *
 * El encargo pide una decisión **verificable** y pide expresamente que tener
 * acceso no convierta a nadie en aprobador. Esas dos cosas juntas descartan
 * cualquier marca que pueda escribir quien ya puede escribir: una bandera en
 * el manifiesto hace aprobador a quien pueda hacer un commit; una columna en
 * la base, a quien pueda hacer un UPDATE; un endpoint, al ADMIN.
 *
 * Una firma mueve la autoridad fuera del sistema. Quien aprueba es quien tiene
 * la clave privada, y nadie dentro de la plataforma la tiene. Lo que vive aquí
 * es sólo la comprobación, que es pública por naturaleza.
 *
 * ── Qué cubre la firma ─────────────────────────────────────────────────────
 *
 * Todo lo que haría que la aprobación dejara de corresponder:
 *
 *   - **identidad** — `experienceKey@version` y el pin de guía. Una firma no
 *     vale para otra experiencia ni para otra versión;
 *   - **revisión** — `canonicalVersion` y `canonicalSha256`: de qué estado del
 *     manuscrito salió el texto;
 *   - **empaquetado** — `manifestSha256`, por si el manifiesto cambia sin que
 *     cambie el texto aprobado;
 *   - **contenido** — `definitionSha256`, el resumen de lo que de verdad se
 *     va a servir.
 *
 * Cambiar cualquiera de ellos invalida la firma. No hay forma de reaprovechar
 * una aprobación después de tocar el contenido o subir la versión, que es
 * justo lo que se pedía.
 *
 * ── Lo que este módulo NO decide ───────────────────────────────────────────
 *
 * De quién es la clave, dónde se guarda y quién puede usarla. Eso es política
 * del propietario del producto, no ingeniería, y se propone en el ADR 0028 sin
 * resolverse aquí. Sin claves configuradas, nada verifica y nada se aprueba —
 * que es exactamente el estado de hoy.
 */

/** El acta: lo firmado, más quién lo firmó y con qué clave. */
export interface EditorialApproval {
  /** Siempre 1 por ahora. Un formato sin versión no se puede hacer evolucionar. */
  schemaVersion: 1;
  manifestId: string;
  experienceKey: string;
  experienceVersion: number;
  guideKey: string;
  guideVersion: number;
  canonicalVersion: string;
  canonicalSha256: string;
  manifestSha256: string;
  /** El resumen del contenido aprobado, igual que el del sello. */
  definitionSha256: string;
  /** Quién decide. Legible; no es la autoridad, lo es la clave. */
  approvedBy: string;
  approvedAt: string;
  /** Qué clave firmó, para poder rotar sin invalidar lo anterior. */
  keyId: string;
  /** Ed25519 sobre `approvalPayload`, en base64. */
  signature: string;
}

export type ApprovalVerdictCode =
  | "APPROVAL_MALFORMED"
  | "APPROVAL_UNKNOWN_KEY"
  | "APPROVAL_BAD_SIGNATURE"
  | "APPROVAL_IDENTITY_MISMATCH"
  | "APPROVAL_REVISION_MISMATCH"
  | "APPROVAL_CONTENT_MISMATCH";

export type ApprovalVerdict =
  | { valid: true }
  | { valid: false; code: ApprovalVerdictCode; detail: string };

/** Las claves públicas que esta instalación reconoce, por `keyId`. */
export type ApprovalKeyring = ReadonlyMap<string, string>;

/**
 * Exactamente lo que se firma, y en un orden que no depende de nadie.
 *
 * Una línea por campo, en orden fijo, con un prefijo de dominio. El prefijo
 * evita que una firma hecha para otra cosa valga aquí; el orden fijo evita que
 * dos serializaciones del mismo contenido produzcan firmas distintas.
 */
export function approvalPayload(
  a: Omit<EditorialApproval, "signature">,
): string {
  return [
    "feelverse.editorial-approval.v1",
    a.manifestId,
    a.experienceKey,
    String(a.experienceVersion),
    a.guideKey,
    String(a.guideVersion),
    a.canonicalVersion,
    a.canonicalSha256,
    a.manifestSha256,
    a.definitionSha256,
    a.approvedBy,
    a.approvedAt,
    a.keyId,
  ].join("\n");
}

const CAMPOS_TEXTO = [
  "manifestId",
  "experienceKey",
  "guideKey",
  "canonicalVersion",
  "canonicalSha256",
  "manifestSha256",
  "definitionSha256",
  "approvedBy",
  "approvedAt",
  "keyId",
  "signature",
] as const;

/** Lee un acta. Falla cerrado: cualquier forma que no sea la esperada es null. */
export function parseEditorialApproval(
  value: unknown,
): EditorialApproval | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return null;
  for (const campo of CAMPOS_TEXTO) {
    if (typeof raw[campo] !== "string" || raw[campo] === "") return null;
  }
  for (const campo of ["experienceVersion", "guideVersion"] as const) {
    const v = raw[campo];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return null;
  }
  return raw as unknown as EditorialApproval;
}

/**
 * ¿Autoriza esta acta a esta experiencia, con este contenido?
 *
 * El orden de las comprobaciones es deliberado. Primero la forma, después la
 * clave, después la firma, y sólo entonces lo que la firma dice: una firma que
 * no verifica no merece que se razone sobre su contenido, porque su contenido
 * no es de nadie.
 */
export function verifyApproval(input: {
  approval: unknown;
  keyring: ApprovalKeyring;
  expect: {
    manifestId: string;
    experienceKey: string;
    experienceVersion: number;
    guideKey: string;
    guideVersion: number;
    canonicalVersion: string;
    canonicalSha256: string;
    manifestSha256: string;
    definitionSha256: string;
  };
}): ApprovalVerdict {
  const acta = parseEditorialApproval(input.approval);
  if (acta === null) {
    return {
      valid: false,
      code: "APPROVAL_MALFORMED",
      detail: "el acta no tiene la forma esperada",
    };
  }

  const clave = input.keyring.get(acta.keyId);
  if (clave === undefined) {
    return {
      valid: false,
      code: "APPROVAL_UNKNOWN_KEY",
      detail: `esta instalación no reconoce la clave ${acta.keyId}`,
    };
  }

  const { signature: _firma, ...firmado } = acta;
  let verifica = false;
  try {
    verifica = verifySignature(
      null,
      Buffer.from(approvalPayload(firmado), "utf8"),
      createPublicKey({
        key: Buffer.from(clave, "base64"),
        format: "der",
        type: "spki",
      }),
      Buffer.from(acta.signature, "base64"),
    );
  } catch {
    // Una clave ilegible o una firma que no es base64 son lo mismo desde
    // aquí: no se pudo comprobar, así que no autoriza.
    verifica = false;
  }
  if (!verifica) {
    return {
      valid: false,
      code: "APPROVAL_BAD_SIGNATURE",
      detail: "la firma no corresponde a lo que el acta dice",
    };
  }

  const e = input.expect;
  if (
    acta.manifestId !== e.manifestId ||
    acta.experienceKey !== e.experienceKey ||
    acta.experienceVersion !== e.experienceVersion ||
    acta.guideKey !== e.guideKey ||
    acta.guideVersion !== e.guideVersion
  ) {
    return {
      valid: false,
      code: "APPROVAL_IDENTITY_MISMATCH",
      detail: "el acta aprueba otra experiencia, otra versión u otra guía",
    };
  }
  if (
    acta.canonicalVersion !== e.canonicalVersion ||
    acta.canonicalSha256 !== e.canonicalSha256 ||
    acta.manifestSha256 !== e.manifestSha256
  ) {
    return {
      valid: false,
      code: "APPROVAL_REVISION_MISMATCH",
      detail: "el acta aprueba otra revisión del manuscrito o del manifiesto",
    };
  }
  if (acta.definitionSha256 !== e.definitionSha256) {
    return {
      valid: false,
      code: "APPROVAL_CONTENT_MISMATCH",
      detail: "el contenido cambió después de aprobarse",
    };
  }

  return { valid: true };
}

/**
 * El llavero que esta instalación reconoce, leído del entorno.
 *
 * `EDITORIAL_APPROVAL_KEYS` con la forma `keyId:base64spki` separada por comas.
 * Fuera del repositorio a propósito: una clave pública guardada junto al
 * artefacto que autoriza no es una autoridad, es una decoración — quien pueda
 * cambiar uno puede cambiar la otra.
 *
 * Vacío significa que esta instalación no reconoce ninguna firma, y por tanto
 * no puede aprobarse nada en ella. Es el estado de hoy, y es seguro.
 */
export function approvalKeyringFromEnv(
  env: Record<string, string | undefined> = process.env,
): ApprovalKeyring {
  const crudo = env.EDITORIAL_APPROVAL_KEYS?.trim();
  const llavero = new Map<string, string>();
  if (!crudo) return llavero;
  for (const entrada of crudo.split(",")) {
    const i = entrada.indexOf(":");
    if (i <= 0) continue;
    const keyId = entrada.slice(0, i).trim();
    const clave = entrada.slice(i + 1).trim();
    if (keyId && clave) llavero.set(keyId, clave);
  }
  return llavero;
}
