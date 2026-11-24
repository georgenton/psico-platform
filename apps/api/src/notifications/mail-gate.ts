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
 *     → los pide la propia persona. El cambio de correo también enviaba, y
 *     está retirado: `docs/product/tarea-cambio-de-correo.md`;
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
 *
 * ── Y una tercera situación que la primera versión no distinguía ───────────
 *
 * «Sin lista» tenía un solo significado —`entries.length === 0`— y eso juntaba
 * dos cosas opuestas: **que nadie la configurara** y **que alguien la
 * configurara mal**. Con `EMAIL_ALLOWLIST=dominio.com` —un dominio suelto, que
 * se rechaza a propósito— la lista utilizable quedaba vacía, y en producción
 * eso caía en `production-open`: **un error al escribir una restricción
 * terminaba permitiendo cualquier destinatario**. Reproducido el 2026-11-17
 * contra el fichero de `main`.
 *
 * Son tres estados, no dos:
 *
 *   - `absent`   — nadie la configuró. Es la ausencia deliberada, y conserva
 *                  el comportamiento de producción: escribe a tus usuarios.
 *                  Un valor vacío cuenta como ausencia porque así es como se
 *                  guarda una variable borrada en Coolify.
 *   - `unusable` — hay valor y no deja ni una entrada utilizable. **Nunca abre,
 *                  en ningún entorno**, producción incluida: quien escribió algo
 *                  ahí quería restringir, y lo que hay que arreglar es el valor,
 *                  no el alcance.
 *   - `usable`   — al menos una entrada. Restringe, y mezclar entradas válidas
 *                  con ilegibles **no amplía** nada: las ilegibles no coinciden
 *                  con ninguna dirección.
 *
 * Fallar cerrado en producción tiene un coste real —el correo transaccional,
 * restablecer contraseñas incluido, deja de salir— y por eso el arranque y
 * `/api/health/integrations` tienen que nombrarlo en voz alta. Es el lado
 * correcto del que equivocarse: un correo que no sale se nota y se arregla; uno
 * que sale a quien no debía no se deshace.
 */

export type MailGateVerdict =
  | { send: true; reason: "allowlisted" | "production-open" }
  | {
      send: false;
      reason:
        | "not-allowlisted"
        | "no-allowlist-outside-production"
        | "allowlist-unusable";
    };

/**
 * `absent` ≠ `unusable`, y la diferencia decide si producción envía.
 */
export type MailAllowlistState = "absent" | "unusable" | "usable";

export interface MailAllowlist {
  /** Entradas utilizables: direcciones completas o sufijos `@dominio`. */
  entries: string[];
  /**
   * Entradas que no se pueden interpretar. **No amplían nada** —nunca
   * coinciden— y se nombran en el arranque y en `/api/health/integrations`,
   * porque una lista mal escrita que calla se lee como una lista que funciona.
   */
  malformed: string[];
  /**
   * Qué clase de «sin entradas» es ésta. Derivado del valor crudo, no del
   * recuento: `entries.length === 0` no distingue una variable que nadie puso
   * de una que alguien escribió mal, y esa confusión abría producción.
   */
  state: MailAllowlistState;
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

  // Ausencia deliberada: la variable no existe, o existe vacía. Lo segundo
  // cuenta igual a propósito — borrar una variable en Coolify la deja como
  // cadena vacía, así que tratarla como «configurada» convertiría un borrado
  // en un corte de correo en producción.
  const configured = (raw ?? "").trim().length > 0;

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

  const state: MailAllowlistState =
    entries.length > 0 ? "usable" : configured ? "unusable" : "absent";

  return { entries, malformed, state };
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
  // Configurada y sin nada utilizable: no sale, y tampoco en producción. Es el
  // caso que antes caía en `production-open` y convertía una restricción mal
  // escrita en un permiso para todos.
  if (allowlist.state === "unusable") {
    return { send: false, reason: "allowlist-unusable" };
  }

  if (allowlist.state === "absent") {
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
 *
 * Se deriva del **mismo** `state` que decide `mailGate`, no de un recuento
 * paralelo: un banner que diga «abierto» mientras la guarda retiene es peor
 * que no tener banner.
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
  if (allowlist.state === "usable") {
    return `restringido a ${allowlist.entries.length} destinatario(s) autorizado(s)${mal}`;
  }
  if (allowlist.state === "unusable") {
    // El caso que más conviene gritar: hay clave, hay lista, y no sale NADA —
    // tampoco en producción, donde eso incluye restablecer contraseñas. Lo que
    // hay que arreglar es el valor.
    return `BLOQUEADO: EMAIL_ALLOWLIST tiene valor pero ninguna entrada utilizable, así que NADA sale (${environment}) — corrige el valor, no el alcance${mal}`;
  }
  return environment === "production"
    ? `abierto: producción escribe a cualquier usuario${mal}`
    : `RETENIDO: hay clave y EMAIL_ALLOWLIST no está configurada, así que NADA sale (${environment})${mal}`;
}
