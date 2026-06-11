import { emailShell, escape } from "./base";
import type { RenderedEmail } from "./verify-email.template";

export interface AuthorPublicationApprovedProps {
  authorFirstName: string;
  bookTitle: string;
  /** Slug del Book público recién creado, para construir el deep-link al catálogo. */
  bookSlug: string;
  /** Cantidad de capítulos publicados (informativo). */
  chapters: number;
  /** URL base del frontend para construir el link del catálogo. */
  appUrl: string;
}

/**
 * Email enviado al autor cuando admin aprueba su libro y se publica al
 * catálogo (Sprint S71.B-notify).
 *
 * Diseño: tono editorial cálido, link al detalle del libro en catálogo,
 * sin CTA agresivo (los autores B2B no son freemium).
 */
export function authorPublicationApprovedEmail(
  props: AuthorPublicationApprovedProps,
): RenderedEmail {
  const greeting = props.authorFirstName.trim() || "hola";
  const detailUrl = `${props.appUrl.replace(/\/+$/, "")}/dashboard/biblioteca/${encodeURIComponent(props.bookSlug)}`;

  const html = emailShell({
    preheader: `Tu libro "${props.bookTitle}" ya está publicado en Psico Platform.`,
    bodyHtml: `
      <p style="margin:0 0 16px; font-size:17px; font-weight:600;">¡${escape(greeting)}!</p>
      <p style="margin:0 0 16px;">
        Tu libro <strong>${escape(props.bookTitle)}</strong> fue aprobado y
        ya está publicado en el catálogo de <strong>Psico Platform</strong>.
      </p>
      <p style="margin:0 0 16px;">
        Publicaste ${props.chapters} capítulo(s). Los lectores ya pueden
        encontrarlo en su biblioteca.
      </p>
      <p style="margin:24px 0;">
        <a href="${escape(detailUrl)}"
           style="display:inline-block; padding:12px 20px; background:#7C5BC4; color:#FFFFFF; text-decoration:none; border-radius:999px; font-weight:600; font-size:14px;">
          Ver en el catálogo →
        </a>
      </p>
      <p style="margin:0 0 16px; font-size:13px; color:#7A6650;">
        Si necesitas hacer cambios, puedes despublicar el libro desde tu panel
        del editor y volverlo a enviar a revisión.
      </p>
    `,
  });

  const text = [
    `¡${greeting}!`,
    "",
    `Tu libro "${props.bookTitle}" fue aprobado y ya está publicado en Psico Platform.`,
    `Publicaste ${props.chapters} capítulo(s).`,
    "",
    `Ver en el catálogo: ${detailUrl}`,
    "",
    "Si necesitas cambios, despublica desde tu panel y reenvía a revisión.",
  ].join("\n");

  return {
    subject: `Tu libro "${props.bookTitle}" está publicado`,
    html,
    text,
    tag: "author-publication-approved",
  };
}
