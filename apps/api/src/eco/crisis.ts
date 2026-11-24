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

import {
  CRISIS_DEFAULT_COUNTRY,
  crisisEmergencyFor,
  isCrisisCountry,
  type CrisisCountry,
  type CrisisEmergency,
} from "@psico/types";

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

/** What a client receives when the conversation is derived. */
export interface CrisisNotice {
  text: string;
  hotline: string;
  crisisPath: string;
  country?: CrisisCountry;
}

export const CRISIS_PATH = "/terapia/crisis";

/**
 * The emergency number to offer, or `null`.
 *
 * Eco does not pick a country: it uses the one declared in the profile, and
 * the product's starting one when nobody has declared any — the text always
 * says which. A declared country without an accredited emergency number gets
 * NO number, never another country's.
 */
function emergencyFor(
  declared: string | null | undefined,
): CrisisEmergency | null {
  const country = countryCode(declared) ?? CRISIS_DEFAULT_COUNTRY;
  return isCrisisCountry(country) ? crisisEmergencyFor(country) : null;
}

/** The profile's country as a code, or `null` if nobody has declared one. */
function countryCode(declared: string | null | undefined): string | null {
  return declared?.trim().toUpperCase() || null;
}

/** Where to call if there is danger. Shared with the legacy chat's prompt. */
export function crisisGuidance(declared: string | null | undefined): string {
  const emergency = emergencyFor(declared);
  return emergency
    ? `Si tú u otra persona están en peligro, llama ahora. En ${emergency.countryName}, el número de emergencias es el ${emergency.phone}. Si estás en otro país, llama al número de emergencias de ese país.`
    : "Si tú u otra persona están en peligro, llama ahora al número de emergencias de tu país.";
}

/**
 * The canned crisis notice. Shown verbatim and persisted as it is sent; do NOT
 * route it through the LLM (the LLM is fallible).
 *
 * Every number in it comes from the shared catalogue in `@psico/types`, which
 * only serves what a primary source accredits. Plain text: both clients paint
 * it as it comes, so an asterisk would be read as an asterisk.
 *
 * `hotline` carries the country it belongs to — `911 (Ecuador)` — because the
 * clients paint it on the call button, and the bracket is dropped when dialling
 * by the installed ones too. Without a number it is the phrase that completes
 * the sentence those clients already paint when nothing is dialable: «Llama al
 * número de emergencias de tu país». An empty string would leave «Llama al »
 * hanging, or an empty dialler in the oldest ones.
 */
export function crisisNotice(
  declared: string | null | undefined,
): CrisisNotice {
  const emergency = emergencyFor(declared);
  const country = countryCode(declared);

  return {
    text: `Lo que me contaste me preocupa. Quiero que estés a salvo.

${crisisGuidance(declared)}

No soy profesional de la salud ni un servicio de emergencias. Hay más recursos en Ayuda inmediata.

No tienes que pasar por esto a solas. Si puedes, busca a alguien de confianza.`,
    hotline: emergency
      ? `${emergency.phone} (${emergency.countryName})`
      : "número de emergencias de tu país",
    crisisPath: CRISIS_PATH,
    ...(isCrisisCountry(country) ? { country } : {}),
  };
}

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
