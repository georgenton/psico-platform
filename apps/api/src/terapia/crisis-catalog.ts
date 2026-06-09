import type { CrisisResponse } from "@psico/types";

/**
 * Crisis lines per country, curated by ops. v1 ships with Ecuador + a
 * fallback "internacional" entry. Ampliable sin migration porque vive en
 * código — el design dice "no negociable" para v1 (tener líneas de
 * crisis disponibles SIN auth).
 *
 * Source: WHO Suicide Prevention + local providers (verify on each release).
 */
const CRISIS_BY_COUNTRY: Record<string, CrisisResponse> = {
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
      "Llamá una línea de la lista de arriba. Estás haciendo lo correcto.",
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
      "Llamá la línea 106 — es gratis y anónima.",
    ],
    nextSteps: ["Llamá la línea 106."],
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
    nextSteps: ["Llamá SAPTEL."],
  },
};

const FALLBACK: CrisisResponse = {
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

export function getCrisisFor(countryCode: string | undefined): CrisisResponse {
  if (!countryCode) return CRISIS_BY_COUNTRY.EC ?? FALLBACK;
  const normalized = countryCode.toUpperCase();
  return CRISIS_BY_COUNTRY[normalized] ?? FALLBACK;
}
