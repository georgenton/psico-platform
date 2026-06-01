import { emailShell, escape } from "./base";
import type { RenderedEmail } from "./verify-email.template";

export interface PasswordResetProps {
  firstName: string;
  /** Full URL the user clicks. Includes the raw token in the query. */
  resetUrl: string;
  /** Hours until the token expires. */
  expiresHours: number;
  /** IP from which the request came — shown to help the user spot abuse. */
  requestIp?: string | null;
}

/**
 * Sent when a user requests a password reset via POST /api/auth/forgot-password.
 *
 * Important UX notes:
 *  - Even if the email doesn't exist, the endpoint returns 200 (no leak).
 *    So this template is only rendered when the email DID match an account.
 *  - The body mentions the request IP so a real user spotting a reset they
 *    didn't request has a clue about where it came from.
 */
export function passwordResetEmail(props: PasswordResetProps): RenderedEmail {
  const greeting = props.firstName.trim() || "hola";
  const ipLine = props.requestIp
    ? `<br><span style="color:#7E6F5F;">Solicitud desde IP ${escape(props.requestIp)}.</span>`
    : "";

  const html = emailShell({
    preheader: `Cambia tu contraseña de Psico Platform — el enlace vence en ${props.expiresHours} horas.`,
    bodyHtml: `
      <p style="margin:0 0 16px; font-size:17px; font-weight:600;">¡${escape(greeting)}!</p>
      <p style="margin:0 0 16px;">
        Pediste restablecer tu contraseña de <strong>Psico Platform</strong>.
        Haz clic para crear una nueva contraseña.
      </p>
      <p style="margin:24px 0;">
        <a href="${escape(props.resetUrl)}"
           style="display:inline-block; padding:14px 28px; border-radius:14px; background:#7C5BC4; color:#FFFFFF; text-decoration:none; font-weight:600; font-size:15px;">
          Restablecer contraseña
        </a>
      </p>
      <p style="margin:24px 0 0; color:#7E6F5F; font-size:13px;">
        Este enlace vence en ${props.expiresHours} horas y solo puede usarse una vez.
        ${ipLine}
        <br><br>
        <strong>Si no pediste este cambio</strong>, ignora este mensaje y tu
        contraseña actual seguirá funcionando. Si crees que alguien está
        intentando acceder a tu cuenta, revisa tus sesiones activas en
        Perfil → Privacidad.
      </p>`,
  });

  const text = `¡${greeting}!

Pediste restablecer tu contraseña de Psico Platform. Haz clic para crear una nueva contraseña:
${props.resetUrl}

Este enlace vence en ${props.expiresHours} horas y solo puede usarse una vez.${
    props.requestIp ? `\nSolicitud desde IP ${props.requestIp}.` : ""
  }

Si no pediste este cambio, ignora este mensaje.`;

  return {
    subject: "Restablecer tu contraseña · Psico Platform",
    html,
    text,
    tag: "password-reset",
  };
}
