import type { CoverToken } from "@psico/types";
import { Colors } from "@/theme";

/**
 * coverColor — mobile fallback for CoverToken → solid color.
 *
 * Web uses CSS linear-gradient(135deg, ...); React Native does not ship
 * gradients without `expo-linear-gradient`. To keep the bundle small the
 * mobile renders a solid mid-tone of the design's gradient endpoints.
 *
 * Mapping:
 *   cool  → lavender[500]  (primary)
 *   warm  → sage[500]
 *   mixed → lavender[400]  (lighter than cool, hints at the dual gradient)
 *
 * If we ever add expo-linear-gradient, replace the consumers with a
 * <LinearGradient colors={[...start, ...end]} /> using the same endpoints
 * as docs/design/inicio/inicio.css.
 */
export function coverColor(
  token: CoverToken | string | null | undefined,
): string {
  if (token === "warm") return Colors.sage[500];
  if (token === "mixed") return Colors.lavender[400];
  return Colors.lavender[500];
}
