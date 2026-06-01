import { emailShell, escape } from "./base";

export interface VerifyEmailProps {
  firstName: string;
  /** Full URL the user clicks to verify. Includes the raw token in the query. */
  verifyUrl: string;
  /** Hours until the token expires. Used in the body copy + preheader. */
  expiresHours: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  tag: string;
}

/**
 * Sent right after registration. The link in `verifyUrl` is single-use and
 * expires after `expiresHours` hours.
 */
export function verifyEmail(props: VerifyEmailProps): RenderedEmail {
  const greeting = props.firstName.trim() || "hola";

  const html = emailShell({
    preheader: `Confirma tu correo para empezar a usar Psico Platform — el enlace vence en ${props.expiresHours} horas.`,
    bodyHtml: `
      <p style="margin:0 0 16px; font-size:17px; font-weight:600;">¡${escape(greeting)}!</p>
      <p style="margin:0 0 16px;">
        Gracias por crear tu cuenta en <strong>Psico Platform</strong>. Para
        activar tu cuenta y empezar a leer, confirma tu correo.
      </p>
      <p style="margin:24px 0;">
        <a href="${escape(props.verifyUrl)}"
           style="display:inline-block; padding:14px 28px; border-radius:14px; background:#7C5BC4; color:#FFFFFF; text-decoration:none; font-weight:600; font-size:15px;">
          Confirmar correo
        </a>
      </p>
      <p style="margin:24px 0 0; color:#7E6F5F; font-size:13px;">
        Este enlace vence en ${props.expiresHours} horas. Si no se abre, copia
        y pega esta dirección en tu navegador:
        <br>
        <span style="word-break:break-all; color:#7C5BC4;">${escape(props.verifyUrl)}</span>
      </p>`,
  });

  const text = `¡${greeting}!

Gracias por crear tu cuenta en Psico Platform. Confirma tu correo para empezar:
${props.verifyUrl}

Este enlace vence en ${props.expiresHours} horas.

Si no fuiste tú quien creó la cuenta, ignora este mensaje.`;

  return {
    subject: "Confirma tu correo · Psico Platform",
    html,
    text,
    tag: "verify-email",
  };
}
