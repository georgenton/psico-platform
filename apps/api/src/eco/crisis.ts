/**
 * Crisis detector — Sprint S10, layer 1.
 *
 * This is the FIRST defense before the LLM ever sees the user's text. The
 * patterns target unambiguous signals that imply immediate risk; we explicitly
 * avoid soft signals (sadness, stress) because false-positive crisis derivations
 * are harmful UX — they break trust by sending help when none was asked for.
 *
 * The patterns are intentionally conservative. The LLM (layer 2) handles
 * borderline cases by responding with the `[CRISIS]` sentinel and our parser
 * promotes that to a crisis SSE event downstream.
 *
 * Per docs/design/handoff/08-eco.md "Crisis trigger" — the derivation message
 * is non-negotiable.
 */

// Lowercase, accent-insensitive lookup. We strip diacritics before matching
// to avoid keyword spoofing via composed/normalised forms.
//
// Some patterns are full words (`\b...\b`), others substrings (e.g. "matarme")
// because Spanish conjugation produces "matarte" / "matarme" / "matarse" etc.
const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid/i, // suicidio, suicidarme, suicidio asistido
  /\bautolesion/i, // autolesion, autolesionarme
  /\bauto[ -]?lesion/i, // auto-lesion, auto lesion
  /\bmatar[mt]e\b/i, // matarme, matarte (en contexto general)
  /\bquitarme la vida\b/i,
  /\bno (quiero|deseo) (vivir|seguir)\b/i,
  /\bya no aguanto\b/i, // a softer signal; combined with others it's enough
  /\bquiero (morir|desaparecer)/i,
  // English fallback (some users code-switch).
  /\b(suicide|kill myself|self[- ]harm|don'?t want to live|end it all)\b/i,
];

/**
 * Local crisis response. Hard-coded in Spanish-EC because that's our v1
 * market. The hotline number is the Línea de Crisis Ecuador (1800-4-SALUD).
 *
 * Per the design contract, this text is shown verbatim to the user; do NOT
 * route this through the LLM (the LLM is fallible).
 */
export const CRISIS_MESSAGE = `Lo que me contaste me preocupa. Quiero asegurarme de que estés a salvo.

Por favor, contacta ya mismo a la **Línea de Crisis Ecuador: 1800-4-SALUD (1800-472583)**. Atienden 24/7, son gratuitos y confidenciales.

Si estás fuera de Ecuador o prefieres otra línea, dime y la busco contigo.

No estás solo/a. Yo no soy un profesional, pero alguien que sí lo es te puede acompañar ahora.`;

export const CRISIS_HOTLINE = "1800-4-SALUD (1800-472583)";
export const CRISIS_PATH = "/terapia/crisis";

/**
 * Sentinel returned by the LLM (system-prompt-instructed) when it judges
 * the message reflects crisis-level distress that our regex didn't catch.
 * Server parses the streamed response; if the first non-whitespace token is
 * this sentinel, we drop the rest of the stream and emit a `crisis` event.
 */
export const CRISIS_LLM_SENTINEL = "[CRISIS]";

/**
 * Returns true if the plaintext should be intercepted as a crisis before
 * reaching the LLM. Strips accents so "matár(me)" and "matarme" both match.
 */
export function isCrisisText(plaintext: string): boolean {
  const normalised = plaintext
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return CRISIS_PATTERNS.some((p) => p.test(normalised));
}
