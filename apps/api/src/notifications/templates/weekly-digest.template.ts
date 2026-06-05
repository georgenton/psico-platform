import { emailShell, escape } from "./base";
import type { RenderedEmail } from "./verify-email.template";

export interface WeeklyDigestProps {
  firstName: string;
  /** ISO date YYYY-MM-DD of the Monday of the week. */
  weekStartIso: string;
  /** Last week's stats. */
  diaryEntries: number;
  ecoMessages: number;
  dominantMood: string | null;
  topTags: string[]; // up to ~5
  /** Optional link to the user's Patrones page for richer view. */
  patronesUrl?: string;
}

/**
 * Weekly digest email — Sprint S44.
 *
 * Sent every Monday 07:00 UTC by `WeeklyDigestProcessor`. The body is
 * intentionally short — the goal is to reignite engagement, not to ship
 * a fully-detailed report. The user can deep-link to Patrones for the
 * full picture.
 *
 * Privacy contract: the body NEVER includes diary text, eco messages, or
 * anything that the platform can't see in plaintext. Only categorical
 * counts + the user's own tag tokens.
 *
 * Tone: warm, non-pathologizing, second person. Mirrors the LLM weekly
 * narrative voice (S38) so the digest feels of-a-piece if the user opens
 * Patrones right after.
 */
export function weeklyDigestEmail(props: WeeklyDigestProps): RenderedEmail {
  const greeting = props.firstName.trim() || "hola";
  const weekLabel = formatWeekLabel(props.weekStartIso);

  const noActivity = props.diaryEntries === 0 && props.ecoMessages === 0;

  const statLines = noActivity
    ? `<p style="margin:0 0 12px;">Esta semana no escribiste en el diario ni hablaste con Eco. No pasa nada — el espacio te espera cuando quieras.</p>`
    : `
      <ul style="margin:0 0 16px; padding:0 0 0 18px; list-style:none;">
        ${row("📓", `${props.diaryEntries} ${plural(props.diaryEntries, "entrada", "entradas")} en tu diario`)}
        ${row("🌿", `${props.ecoMessages} ${plural(props.ecoMessages, "mensaje", "mensajes")} con Eco`)}
        ${
          props.dominantMood
            ? row(
                "💭",
                `Mood dominante: <strong>${escape(props.dominantMood)}</strong>`,
              )
            : ""
        }
        ${
          props.topTags.length > 0
            ? row(
                "🏷️",
                `Tags: ${props.topTags
                  .slice(0, 5)
                  .map(
                    (t) =>
                      `<code style="background:#F5F0E8; padding:2px 6px; border-radius:4px;">${escape(t)}</code>`,
                  )
                  .join(" ")}`,
              )
            : ""
        }
      </ul>
    `;

  const ctaButton = props.patronesUrl
    ? `<p style="margin:16px 0;">
         <a href="${escape(props.patronesUrl)}"
            style="display:inline-block; background:#8B73C0; color:#FFFFFF;
                   text-decoration:none; padding:10px 18px; border-radius:24px;
                   font-weight:600; font-size:14px;">
           Ver tu mapa emocional →
         </a>
       </p>`
    : "";

  const html = emailShell({
    preheader: noActivity
      ? `Tu espacio está intacto y te espera.`
      : `${props.diaryEntries} entradas, ${props.ecoMessages} con Eco — tu semana en una mirada.`,
    bodyHtml: `
      <p style="margin:0 0 12px; font-size:17px; font-weight:600;">¡${escape(greeting)}!</p>
      <p style="margin:0 0 16px; color:#7E6F5F;">
        Pequeño resumen de tu ${escape(weekLabel)}.
      </p>
      ${statLines}
      ${ctaButton}
      <p style="margin:24px 0 0; font-size:13px; color:#7E6F5F;">
        Si prefieres no recibir este resumen, puedes desactivarlo en
        <strong>Perfil → Notificaciones → Resumen semanal</strong>.
      </p>
    `,
  });

  const text = noActivity
    ? `¡${greeting}! Esta semana no escribiste — tu espacio te espera cuando quieras.\n\nDesactivar: Perfil → Notificaciones → Resumen semanal.`
    : `¡${greeting}! Resumen de tu ${weekLabel}:\n\n` +
      `· ${props.diaryEntries} entradas en tu diario\n` +
      `· ${props.ecoMessages} mensajes con Eco\n` +
      (props.dominantMood ? `· Mood dominante: ${props.dominantMood}\n` : "") +
      (props.topTags.length > 0
        ? `· Tags: ${props.topTags.slice(0, 5).join(", ")}\n`
        : "") +
      (props.patronesUrl ? `\nVer tu mapa: ${props.patronesUrl}\n` : "") +
      `\nDesactivar: Perfil → Notificaciones → Resumen semanal.`;

  return {
    subject: noActivity
      ? `Tu espacio en Psico te espera`
      : `Tu semana · ${props.diaryEntries} ${plural(props.diaryEntries, "entrada", "entradas")}`,
    html,
    text,
    tag: "weekly-digest",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function plural(n: number, sg: string, pl: string): string {
  return n === 1 ? sg : pl;
}

function row(emoji: string, htmlBody: string): string {
  return `<li style="padding:6px 0; font-size:15px;">${emoji} &nbsp; ${htmlBody}</li>`;
}

function formatWeekLabel(iso: string): string {
  // Render "semana del 25 de mayo" in es-EC; fallback to ISO if parsing
  // fails (defensive — input is always ISO from the processor).
  try {
    const d = new Date(`${iso}T00:00:00Z`);
    const day = d.getUTCDate();
    const month = [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ][d.getUTCMonth()];
    return `semana del ${day} de ${month}`;
  } catch {
    return `semana del ${iso}`;
  }
}
