import type { CoverToken } from "@psico/types";

/**
 * Cover gradient resolver — shared by Home, Biblioteca and Detalle.
 *
 * The backend stores a token (cool/warm/mixed) on Book + recos. The frontend
 * translates the token into a real gradient using the design system's
 * lavender + sage scales. When `coverArtUrl` is present the consumer
 * renders the image instead and uses the gradient only as fallback.
 *
 * Mirrors `docs/design/colors_and_type.css` `--gradient-cover-*`.
 */
export const COVER_GRADIENTS: Record<CoverToken, string> = {
  cool: "linear-gradient(135deg, var(--color-lavender-300) 0%, var(--color-lavender-700) 100%)",
  warm: "linear-gradient(135deg, var(--color-sage-300) 0%, var(--color-sage-700) 100%)",
  mixed:
    "linear-gradient(135deg, var(--color-lavender-300) 0%, var(--color-sage-500) 100%)",
};

/**
 * El tono de una portada, con la misma reserva que el degradado: lo que no se
 * reconoce es `cool`. Para quien lo pinta con una CLASE y no con un estilo en
 * línea, que taparía la regla de portadas de Renacimiento.
 */
export function coverTone(
  token: CoverToken | string | null | undefined,
): CoverToken {
  return token === "warm" || token === "mixed" ? token : "cool";
}

export function coverGradient(
  token: CoverToken | string | null | undefined,
): string {
  return COVER_GRADIENTS[coverTone(token)];
}
