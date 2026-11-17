import type { PsicoEnvironment } from "../shared/psico-environment";

/**
 * Quién puede recibir un correo REAL desde esta caja.
 *
 * ── El riesgo que cierra ───────────────────────────────────────────────────
 *
 * Hasta hoy, `RESEND_API_KEY` era el único interruptor: sin clave,
 * `ResendService` escribe el correo en el registro y no sale nada; con clave,
 * sale TODO. Y "todo" en staging no es sólo el correo que alguien está
 * probando. Las cinco superficies que mandan correo, y quién las dispara:
 *
 *   - verificación de cuenta y restablecimiento de contraseña (`AuthService`)
 *     y cambio de correo (cola `email`) → los pide la propia persona;
 *   - exportación lista (`DataExportProcessor`) → lo pidió ella, llega después;
 *   - revisión de autoría aprobada o rechazada (`author-review` → cola `email`)
 *     → la dispara un **ADMIN** y el correo va a un **tercero**, el autor;
 *   - el **digest semanal** (`WeeklyDigestProcessor`) → lo dispara un **cron**,
 *     y va a CADA cuenta con `weeklyReport=true`.
 *
 * Esa última es la peligrosa, y basta ella sola: el día que llegue una
 * credencial, teclearla haría que el siguiente lunes saliera un digest a cada
 * cuenta que la base de staging tenga con el digest activo — cuentas de prueba
 * de meses pasados y cualquier dirección real que haya quedado ahí. Eso no es
 * una prueba de correo: es una comunicación no autorizada, y no se deshace.
 *
 * (El aviso de inactividad **no** manda correo: es push, y su propio código lo
 * dice. Una versión anterior de este comentario lo contaba entre los caminos de
 * correo, y era falso.)
 *
 * ── Por qué aquí y no en cada camino ──────────────────────────────────────
 *
 * Las cinco superficies pasan por `ResendService.send` — comprobado, y con
 * trinquete: `mail-gate.spec.ts` falla si alguien vuelve a instanciar el SDK
 * fuera de ese servicio. Un único punto de paso se puede razonar; cinco guardas
 * repartidas se desincronizan en el primer camino que alguien añada.
 *
 * ── El criterio ───────────────────────────────────────────────────────────
 *
 *   producción, sin lista      → sale (producción habla con sus usuarios)
 *   producción, con lista      → sólo a la lista (canario deliberado)
 *   cualquier otro, sin lista  → NO sale nada, y se dice en el arranque
 *   cualquier otro, con lista  → sólo a la lista
 *
 * La tercera línea es la que importa: **falla cerrado**. Incorporar la clave
 * sin decir a quién se puede escribir no envía nada, en vez de enviarlo a
 * todos. Y acopla las dos cosas que de verdad van juntas: la credencial y la
 * bandeja autorizada se incorporan en el mismo paso, y sólo esa bandeja recibe.
 *
 * `production` se reconoce por `PSICO_ENV`, que es obligatoria en cualquier
 * caja desplegada (`resolveEnvironment()` se niega a arrancar sin ella), así
 * que esta decisión no depende de adivinar dónde corre el proceso.
 */

export type MailGateVerdict =
  | { send: true; reason: "allowlisted" | "production-open" }
  | {
      send: false;
      reason: "not-allowlisted" | "no-allowlist-outside-production";
    };

export interface MailAllowlist {
  /** Entradas utilizables: direcciones completas o sufijos `@dominio`. */
  entries: string[];
  /**
   * Entradas que no se pueden interpretar. **No amplían nada** —nunca
   * coinciden— y se nombran en el arranque y en `/api/health/integrations`,
   * porque una lista mal escrita que calla se lee como una lista que funciona.
   */
  malformed: string[];
}

/**
 * Separa por comas, normaliza y clasifica.
 *
 * Una entrada vale si es una dirección completa (`alguien@dominio`) o un
 * sufijo de dominio escrito con la arroba (`@dominio`). Un dominio suelto
 * (`dominio.com`) se rechaza a propósito: `endsWith("dominio.com")` también
 * acepta `x@notdominio.com`, y una regla de seguridad que a veces abre de más
 * no es una regla.
 */
export function parseMailAllowlist(raw: string | undefined): MailAllowlist {
  const entries: string[] = [];
  const malformed: string[] = [];

  for (const piece of (raw ?? "").split(",")) {
    const value = piece.trim().toLowerCase();
    if (value.length === 0) continue;

    if (value.startsWith("@")) {
      // `@dominio` — tiene que haber dominio, y un punto dentro.
      if (value.length > 1 && value.includes(".")) entries.push(value);
      else malformed.push(value);
      continue;
    }

    const at = value.indexOf("@");
    // Dirección completa: parte local, una sola arroba, dominio con punto.
    if (
      at > 0 &&
      at === value.lastIndexOf("@") &&
      value.slice(at + 1).includes(".")
    ) {
      entries.push(value);
      continue;
    }

    malformed.push(value);
  }

  return { entries, malformed };
}

/** Una dirección contra la lista: exacta, o por sufijo `@dominio`. */
function matches(address: string, entries: string[]): boolean {
  const a = address.trim().toLowerCase();
  if (a.length === 0) return false;
  return entries.some((e) => (e.startsWith("@") ? a.endsWith(e) : a === e));
}

/**
 * ¿Sale este correo?
 *
 * `to` se parte por comas y **todas** las direcciones tienen que pasar. Sin
 * eso había un hueco real: `SendEmailInput.to` es una cadena, así que
 * `"ajeno@otro.com, qa@autorizado.com"` con la lista `@autorizado.com` habría
 * pasado una comparación por sufijo sobre la cadena completa, y el correo
 * habría salido a las dos.
 */
export function mailGate(
  to: string,
  allowlist: MailAllowlist,
  environment: PsicoEnvironment,
): MailGateVerdict {
  const open = allowlist.entries.length === 0;

  if (open) {
    return environment === "production"
      ? { send: true, reason: "production-open" }
      : { send: false, reason: "no-allowlist-outside-production" };
  }

  const recipients = to
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  if (recipients.length === 0)
    return { send: false, reason: "not-allowlisted" };

  return recipients.every((r) => matches(r, allowlist.entries))
    ? { send: true, reason: "allowlisted" }
    : { send: false, reason: "not-allowlisted" };
}

/**
 * La frase del arranque y del informe de salud. Describe el estado, no lo
 * recomienda: quien la lee tiene que poder distinguir «no sale nada» de «sale
 * a todos» sin abrir el código.
 */
export function describeMailGate(
  allowlist: MailAllowlist,
  environment: PsicoEnvironment,
  hasKey: boolean,
): string {
  const mal =
    allowlist.malformed.length > 0
      ? ` · ${allowlist.malformed.length} entrada(s) ilegible(s): ${allowlist.malformed.join(", ")}`
      : "";

  if (!hasKey) {
    return `sin RESEND_API_KEY: ningún correo sale de esta caja (se registra en consola)${mal}`;
  }
  if (allowlist.entries.length > 0) {
    return `restringido a ${allowlist.entries.length} destinatario(s) autorizado(s)${mal}`;
  }
  return environment === "production"
    ? `abierto: producción escribe a cualquier usuario${mal}`
    : `RETENIDO: hay clave pero EMAIL_ALLOWLIST está vacía, así que NADA sale (${environment})${mal}`;
}
