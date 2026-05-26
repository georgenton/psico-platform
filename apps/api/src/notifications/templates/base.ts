/**
 * Shared email shell. All templates wrap their body content inside this so
 * we have a single place to evolve branding (logo, footer, color tokens).
 *
 * Plain HTML over JSX templates for v1: lower complexity, no JSX runtime
 * needed in the API, faster to test. If we end up with >5 templates we'll
 * migrate to @react-email/components in a polish sprint.
 *
 * Security: every interpolation in the templates must be HTML-escaped via
 * `escape()`. The only exception is `bodyHtml` which is rendered as-is —
 * callers are responsible for escaping inside it.
 */
export interface EmailShellProps {
  /** Preheader text — shown in inbox previews before opening the email. */
  preheader: string;
  /** Already-rendered HTML body. Caller escapes interpolations. */
  bodyHtml: string;
}

export function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailShell({ preheader, bodyHtml }: EmailShellProps): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Psico Platform</title>
  </head>
  <body style="margin:0; padding:0; background:#FAF7F2; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#3D2E1F;">
    <!-- preheader (hidden, shown in inbox preview) -->
    <span style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escape(preheader)}</span>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background:#FFFFFF; border-radius:20px; box-shadow:0 4px 24px rgba(61,46,31,0.06);">
            <tr>
              <td style="padding:32px 40px 8px;">
                <h1 style="margin:0; font-size:22px; font-weight:700; color:#7C5BC4; letter-spacing:-0.5px;">Psico Platform</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 40px; font-size:15px; line-height:1.65;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px; background:#F3EFE8; border-radius:0 0 20px 20px; font-size:12px; line-height:1.5; color:#7E6F5F;">
                Si no esperabas este mensaje, puedes ignorarlo de forma segura.
                <br>
                © Psico Platform — psicoeducación para tu bienestar.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
