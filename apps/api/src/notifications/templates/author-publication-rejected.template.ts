import { emailShell, escape } from "./base";
import type { RenderedEmail } from "./verify-email.template";

export interface AuthorPublicationRejectedProps {
  authorFirstName: string;
  bookTitle: string;
  /** Feedback editorial del admin. Opcional — algunos rechazos no llevan
   * texto (content policy, generic "no apto"). */
  feedback: string | null;
  /** URL base del frontend para el deep-link al panel del editor. */
  appUrl: string;
  /** ID del AuthorBook para construir el link directo a la página de revisión. */
  bookId: string;
}

/**
 * Email enviado al autor cuando admin rechaza su libro tras la revisión
 * (Sprint S71.B-notify).
 *
 * El AuthorBook regresa a DRAFT. El autor puede editar y reenviar.
 */
export function authorPublicationRejectedEmail(
  props: AuthorPublicationRejectedProps,
): RenderedEmail {
  const greeting = props.authorFirstName.trim() || "hola";
  const editorUrl = `${props.appUrl.replace(/\/+$/, "")}/autor/libros/${encodeURIComponent(props.bookId)}`;

  const feedbackBlock = props.feedback
    ? `
      <p style="margin:0 0 8px; font-weight:600; color:#3D2E1F;">
        Feedback del editor:
      </p>
      <blockquote
        style="margin:0 0 16px; padding:12px 16px; background:#FAF7F2;
               border-left:3px solid #E27D60; border-radius:8px;
               font-style:italic; white-space:pre-wrap; color:#3D2E1F;">
        ${escape(props.feedback)}
      </blockquote>`
    : `<p style="margin:0 0 16px; color:#7A6650;">
        El editor no incluyó comentarios específicos esta vez.
      </p>`;

  const html = emailShell({
    preheader: `Tu libro "${props.bookTitle}" volvió a borrador con feedback editorial.`,
    bodyHtml: `
      <p style="margin:0 0 16px; font-size:17px; font-weight:600;">¡${escape(greeting)}!</p>
      <p style="margin:0 0 16px;">
        Revisamos <strong>${escape(props.bookTitle)}</strong> y por ahora no
        podemos publicarlo. El libro volvió a borrador para que puedas hacer
        ajustes y reenviarlo.
      </p>
      ${feedbackBlock}
      <p style="margin:24px 0;">
        <a href="${escape(editorUrl)}"
           style="display:inline-block; padding:12px 20px; background:#7C5BC4; color:#FFFFFF; text-decoration:none; border-radius:999px; font-weight:600; font-size:14px;">
          Abrir el editor →
        </a>
      </p>
      <p style="margin:0 0 16px; font-size:13px; color:#7A6650;">
        Cuando estés listo, vuelve a presionar "Enviar a revisión" desde el
        panel de publicación.
      </p>
    `,
  });

  const text = [
    `¡${greeting}!`,
    "",
    `Revisamos "${props.bookTitle}" y por ahora no podemos publicarlo. El libro volvió a borrador.`,
    "",
    props.feedback ? `Feedback del editor:\n${props.feedback}` : "El editor no incluyó comentarios específicos.",
    "",
    `Abre el editor: ${editorUrl}`,
    "",
    "Cuando estés listo, vuelve a presionar 'Enviar a revisión' desde el panel.",
  ].join("\n");

  return {
    subject: `Tu libro "${props.bookTitle}" volvió a borrador`,
    html,
    text,
    tag: "author-publication-rejected",
  };
}
