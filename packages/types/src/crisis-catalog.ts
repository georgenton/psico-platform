import type { CrisisResponse } from "./index";

/**
 * Crisis lines per country, curated by ops. v1 ships with Ecuador + a
 * fallback "internacional" entry. Ampliable sin migration porque vive en
 * código — el design dice "no negociable" para v1 (tener líneas de
 * crisis disponibles SIN auth).
 *
 * Source: WHO Suicide Prevention + local providers (verify on each release).
 *
 * ── Why this lives in a shared package ────────────────────────────────────
 *
 * It used to live inside the API, and the only way for a screen to show a
 * phone number was to ask the API for it. That makes the one page nobody can
 * afford to find empty depend on a network call to a service that can be
 * down, restarting or unreachable from where the person is.
 *
 * It is plain data plus a pure lookup, so it can be read without a network.
 * The API still serves `GET /api/terapia/crisis` from THIS module — same
 * object, same resolver — so there is one catalogue and not two copies that
 * drift apart. `apps/api/src/terapia/crisis-catalog.e2e-spec.ts` pins the
 * served response to literals captured before the move.
 */
const CRISIS_BY_COUNTRY = {
  EC: {
    country: "EC",
    lines: [
      {
        id: "ec-sas-911",
        name: "SAS · 911 Salud Mental",
        phone: "911",
        availability: "24/7",
        languages: ["es"],
      },
      {
        id: "ec-cetad",
        name: "CETAD · Centro de Escucha Telefónica",
        phone: "+593-2-3960-100",
        availability: "Lun–Vie 08:00–20:00",
        languages: ["es"],
      },
      {
        id: "ec-telefono-amistad",
        name: "Teléfono de la Amistad Quito",
        phone: "+593-2-2563-141",
        availability: "Diario 16:00–22:00",
        languages: ["es"],
      },
    ],
    safetyTipsShort: [
      "Respira lento. 4 segundos al inhalar, 6 al exhalar.",
      "Estás en un cuerpo. Mira un objeto y nómbralo en voz alta.",
      "Si tienes a alguien cerca, dile lo que sientes.",
      "Si el impulso está fuerte, aleja objetos peligrosos y llama al 911.",
    ],
    nextSteps: [
      "Llama a una línea de la lista de arriba. Estás haciendo lo correcto.",
      "Si estás bajo medicación, no la dejes sin hablar con tu médico.",
      "Mañana, agenda una consulta. Hoy alcanzaste a pedir ayuda.",
    ],
  },
  CO: {
    country: "CO",
    lines: [
      {
        id: "co-linea-106",
        name: "Línea 106 · Apoyo Emocional",
        phone: "106",
        availability: "24/7",
        languages: ["es"],
      },
    ],
    safetyTipsShort: [
      "Respira lento.",
      "Llama a la línea 106 — es gratis y anónima.",
    ],
    nextSteps: ["Llama a la línea 106."],
  },
  MX: {
    country: "MX",
    lines: [
      {
        id: "mx-saptel",
        name: "SAPTEL",
        phone: "+52-55-5259-8121",
        availability: "24/7",
        languages: ["es"],
      },
    ],
    safetyTipsShort: ["Respira lento.", "SAPTEL responde 24/7."],
    nextSteps: ["Llama a SAPTEL."],
  },
} satisfies Record<string, CrisisResponse>;

/** Served for a country the catalogue does not know. It is not a country. */
export const CRISIS_FALLBACK: CrisisResponse = {
  country: "INTL",
  lines: [
    {
      id: "intl-iasp",
      name: "IASP · Directorio internacional",
      phone: "+1-800-273-8255",
      chatUrl: "https://findahelpline.com",
      availability: "24/7",
      languages: ["es", "en"],
    },
  ],
  safetyTipsShort: [
    "Breathe slow. 4 seconds in, 6 seconds out.",
    "Reach out to someone you trust.",
    "If you have access, remove dangerous objects from reach.",
  ],
  nextSteps: [
    "Visit findahelpline.com to find a local line.",
    "Tell one person what you are feeling.",
  ],
};

/** A country the catalogue has lines for. */
export type CrisisCountry = keyof typeof CRISIS_BY_COUNTRY;

/** The countries a screen may offer, in the catalogue's own order. */
export const CRISIS_COUNTRIES = Object.keys(
  CRISIS_BY_COUNTRY,
) as readonly CrisisCountry[];

/** Where a screen starts when nobody has said where they are. */
export const CRISIS_DEFAULT_COUNTRY: CrisisCountry = "EC";

/**
 * The name a person reads. Typed against the catalogue, so adding a country
 * without naming it does not compile.
 */
export const CRISIS_COUNTRY_NAMES: Record<CrisisCountry, string> = {
  EC: "Ecuador",
  CO: "Colombia",
  MX: "México",
};

/**
 * Whether a string IS a country of the catalogue. `Object.keys` membership and
 * not `in`: the value can come from an address bar, and `in` would answer yes
 * to `toString`.
 */
export function isCrisisCountry(value: unknown): value is CrisisCountry {
  return (
    typeof value === "string" &&
    (CRISIS_COUNTRIES as readonly string[]).includes(value)
  );
}

export function getCrisisFor(countryCode: string | undefined): CrisisResponse {
  if (!countryCode) return CRISIS_BY_COUNTRY[CRISIS_DEFAULT_COUNTRY];
  const normalized = countryCode.toUpperCase();
  return isCrisisCountry(normalized)
    ? CRISIS_BY_COUNTRY[normalized]
    : CRISIS_FALLBACK;
}
