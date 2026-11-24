/**
 * Qué entra al Mapa Emocional y qué no, dicho donde alguien puede confundirlo.
 *
 * ── Por qué existe este fichero ───────────────────────────────────────────
 *
 * Biblioteca decía «cada lectura alimenta tu Mapa Emocional» y Reflexiones,
 * «cada cosa que escribes aquí le da forma a tu Mapa Emocional». El programa V2
 * separó justamente eso, y el propio Mapa dice lo contrario dos pantallas más
 * allá («Nada entra a este mapa sin ti»). Contrastado con
 * `emotional-map.scoring.ts` bajo `EMOTIONAL_MAP_V2` (encendido por omisión):
 *
 *   - leer, subrayar y escribir NO mueven ninguna dimensión. Cuentan en Mi
 *     Evolución (`evolucion.service.ts`: capítulos, marcas, reflexiones);
 *   - Calma sale del ánimo que se marca (MoodLog, o una reflexión guardada con
 *     un ánimo elegido a propósito);
 *   - Claridad, Compasión y Consciencia, de las respuestas al check-in;
 *   - Conexión y Propósito, de los temas que la persona confirma;
 *   - el análisis del texto está apagado por omisión
 *     (`PrivacySettings.localTextAnalysis`), ocurre en el dispositivo y, aun
 *     encendido, sólo describe: no puntúa.
 *
 * Las frases viven aquí porque las dicen web y móvil, y dos redacciones
 * parecidas acaban contando dos productos distintos.
 */

/** Biblioteca: la actividad de lectura va a Mi Evolución. */
export const LECTURA_Y_MAPA_NOTA =
  "Lo que lees cuenta en Mi Evolución. A tu Mapa Emocional solo entra lo que " +
  "tú registras o confirmas, como un tema que te resonó.";

/** Reflexiones: escribir va a Mi Evolución; al Mapa, sólo lo que se elige. */
export const REFLEXION_Y_MAPA_NOTA =
  "Escribir cuenta en Mi Evolución. A tu Mapa Emocional llega el ánimo que " +
  "marques y, solo si lo activas en Seguridad, unos números que tu " +
  "dispositivo calcula del texto. El texto, nunca.";
