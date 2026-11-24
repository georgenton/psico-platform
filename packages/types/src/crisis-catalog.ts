import type {
  CrisisDirectory,
  CrisisLine,
  CrisisResponse,
  CrisisSource,
} from "./index";

/**
 * Help resources per country, each with the evidence behind it.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *
 * Only a resource whose `estado` is `publicado` is served or painted, and only
 * with what a PRIMARY source accredits. On 2026-11-24 every entry was checked
 * against the organisations' own pages: one number turned out to be a
 * ministry's switchboard, and others had no source at all. Until then this
 * header credited the list to «WHO + local providers», which nobody could show.
 *
 * So the evidence sits next to the datum: who runs it, which page says so, on
 * what day it was checked, what that page accredits and what it does NOT.
 * Readable summary, with the open questions: `docs/product/ayuda-evidencia.md`.
 *
 * ── How an entry changes ──────────────────────────────────────────────────
 *
 *   · Publishing one under validation: its `estado`, plus the literals pinned
 *     in `apps/api/src/terapia/crisis-catalog.e2e-spec.ts`.
 *   · Pulling one that can no longer be trusted: set `en-validacion` and it
 *     stops being served. Whatever the tips still say about it breaks
 *     `ayuda-fuente-comun.spec.ts`, on purpose.
 *   · Withdrawing one for good: move it to `ayuda-retirados.ts`, which is in
 *     no bundle and feeds the ratchet that keeps it from coming back.
 *
 * ── Why this lives in a shared package ────────────────────────────────────
 *
 * It used to live inside the API, and the only way for a screen to show a
 * phone number was to ask the API for it. That makes the one page nobody can
 * afford to find empty depend on a network call to a service that can be
 * down, restarting or unreachable from where the person is.
 *
 * It is plain data plus a pure lookup, so it can be read without a network.
 * The API serves `GET /api/terapia/crisis` from THIS module, Eco's crisis
 * notice and the legacy chat read the same one, and so do the web and mobile
 * help screens. One source, not four copies that drift apart.
 */

/** Only `publicado` is ever served or painted. */
export type EstadoAyuda = "publicado" | "en-validacion" | "retirado";

/** A primary source: a page of whoever runs the resource or answers for it. */
export interface FuenteAyuda {
  /** How a screen names it. */
  label: string;
  url: string;
  /** The date or version the page itself shows. */
  version: string;
}

export interface EvidenciaAyuda {
  organismo: string;
  /** The first one is the one the screens link to. */
  fuentes: readonly [FuenteAyuda, ...FuenteAyuda[]];
  /** Day it was checked against those sources, `YYYY-MM-DD`. */
  comprobado: string;
  acredita: readonly string[];
  noAcredita: readonly string[];
  /** The concrete questions left before it can be published. */
  falta?: readonly string[];
}

export interface RecursoAyuda {
  estado: EstadoAyuda;
  /** What is served if it is published. `source` comes from the evidence. */
  linea: Omit<CrisisLine, "source">;
  evidencia: EvidenciaAyuda;
}

interface PaisAyuda {
  /**
   * The line that IS the country's emergency number, by id, and only where a
   * current primary source says so. Never «the first of the list»: the first
   * line of Colombia is not an emergency service.
   */
  emergencia: string | null;
  recursos: readonly RecursoAyuda[];
  safetyTipsShort: string[];
  nextSteps: string[];
}

// No source states a language. `es` stays because installed apps read the
// field, and it is the language those pages are written in.
const CRISIS_BY_COUNTRY = {
  EC: {
    emergencia: "ec-911",
    recursos: [
      {
        estado: "publicado",
        linea: {
          id: "ec-911",
          name: "ECU 911 · Emergencias",
          phone: "911",
          availability: "24 horas, todos los días",
          languages: ["es"],
          notes: ["Gratuito", "Todo Ecuador"],
        },
        evidencia: {
          organismo: "Servicio Integrado de Seguridad ECU 911",
          fuentes: [
            {
              label: "gob.ec",
              url: "https://www.gob.ec/ecu-911/tramites/solicitud-atencion-emergencia-traves-diferentes-mecanismos-alerta",
              version: "actualizada 2025-10-28",
            },
            {
              label: "ecu911.gob.ec",
              url: "https://www.ecu911.gob.ec/831-emergencias-por-intentos-autoliticos-coordino-el-ecu-911-en-2026/",
              version: "sin fecha; datos hasta 2026-09-08",
            },
          ],
          comprobado: "2026-11-24",
          acredita: [
            "911, desde fijo o móvil: la línea única de emergencias del país.",
            "24 horas, todos los días del año, sin costo, en todo el territorio.",
            "ECU 911 pide marcarlo ante riesgo de suicidio, propio o de otra persona.",
          ],
          noAcredita: [
            "Que sea una línea de salud mental: es la línea general de emergencias.",
            "Que conteste un profesional de salud mental en cada provincia.",
            "Confidencialidad: la ficha pide el nombre de quien reporta.",
            "Que se pueda marcar desde el exterior.",
          ],
        },
      },
      {
        estado: "en-validacion",
        linea: {
          id: "ec-171-6",
          name: "Línea 171, opción 6 · Ministerio de Salud Pública",
          // Dials 171; the option is keyed in once somebody answers.
          phone: "171 (opción 6)",
          availability: "Horario sin confirmar",
          languages: ["es"],
          notes: ["Gratuita", "Marca 171 y después elige la opción 6"],
        },
        evidencia: {
          organismo: "Ministerio de Salud Pública del Ecuador",
          fuentes: [
            {
              label: "salud.gob.ec",
              url: "https://www.salud.gob.ec/linea-171-opcion-6/",
              version: "página vigente; imágenes de 2026-03-31 y 2026-04-10",
            },
            {
              label: "salud.gob.ec · lineamientos",
              url: "https://www.salud.gob.ec/wp-content/uploads/2026/07/Lineamientos-para-atencion-a-personas-con-comportamiento-suicida-en-establecimientos-de-salud-del-Ministerio-de-Salud-Publica.pdf",
              version: "2026; PDF creado 2026-07-08",
            },
          ],
          comprobado: "2026-11-24",
          acredita: [
            "Existe en 2026, es 171 opción 6 y es gratuita.",
            "Asesoría psicológica, contención emocional y primeros auxilios psicológicos por teléfono.",
          ],
          noAcredita: [
            "El horario: el Ministerio publicó 7:00–20:00 en 2023 y activación permanente, sin horas, en 2025.",
            "Confidencialidad o anonimato.",
            "Que se pueda llamar desde el exterior.",
          ],
          falta: [
            "¿Cuál es hoy el horario exacto, incluidos feriados y madrugada? ¿Qué escucha quien llama fuera de ese horario?",
            "¿Es anónima o confidencial, y con qué límites?",
          ],
        },
      },
    ],
    safetyTipsShort: [
      "Respira lento. 4 segundos al inhalar, 6 al exhalar.",
      "Estás en un cuerpo. Mira un objeto y nómbralo en voz alta.",
      "Si tienes a alguien cerca, dile lo que sientes.",
      "Si el impulso está fuerte, aleja objetos peligrosos y llama al 911.",
    ],
    nextSteps: [
      "Si hay peligro, llama al 911. Estás haciendo lo correcto.",
      "Si estás bajo medicación, no la dejes sin hablar con tu médico.",
      "Mañana, agenda una consulta. Hoy alcanzaste a pedir ayuda.",
    ],
  },
  CO: {
    emergencia: null,
    recursos: [
      {
        estado: "publicado",
        linea: {
          id: "co-106",
          name: "Línea 106 · Ministerio de Salud",
          phone: "106",
          availability: "24 horas, todos los días",
          languages: ["es"],
          notes: [
            "Gratuita y confidencial, según el Ministerio de Salud",
            "Algunos territorios tienen su propia 106, que puede tener otro horario",
          ],
        },
        evidencia: {
          organismo: "Ministerio de Salud y Protección Social de Colombia",
          fuentes: [
            {
              label: "minsalud.gov.co",
              url: "https://www.minsalud.gov.co/salud/publica/salud-mental/Paginas/linea-106.aspx",
              version: "página viva, sin fecha visible",
            },
            {
              label: "minsalud.gov.co · circular 002 de 2026",
              url: "https://www.minsalud.gov.co/Normatividad_Nuevo/Circular%20Externa%20No%20002%20de%202026.pdf",
              version: "2026-02-16",
            },
            {
              label: "minsalud.gov.co · directorio",
              url: "https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/ET/directorio-salud-mental-prevencion-suicidio-minsalud.pdf",
              version: "agosto de 2025",
            },
          ],
          comprobado: "2026-11-24",
          acredita: [
            "106, desde fijo o celular y con cualquier operador.",
            "24 horas, todos los días, en la línea nacional.",
            "Gratuita y confidencial: lo dice el Ministerio.",
          ],
          noAcredita: [
            "Que sea anónima con carácter general: el Ministerio no lo dice.",
            "El mismo horario donde hay 106 propia: el directorio da lunes a viernes de 8:00 a 17:00 en Caldas.",
            "Que se pueda llamar desde el exterior.",
          ],
        },
      },
      {
        estado: "en-validacion",
        linea: {
          id: "co-123",
          name: "123 · Emergencias",
          phone: "123",
          availability: "24 horas, todos los días",
          languages: ["es"],
          notes: ["Gratuito"],
        },
        evidencia: {
          organismo:
            "Policía Nacional de Colombia; la operación es territorial",
          fuentes: [
            {
              label: "policia.gov.co",
              url: "https://www.policia.gov.co/noticia/policia-nacional-sensibiliza-comunidad-sobre-uso-las-lineas-emergencia-123-155",
              version: "2023-03-12",
            },
            {
              label: "bogota.gov.co",
              url: "https://bogota.gov.co/mi-ciudad/salud/linea-106-en-bogota-apoyo-psicologico-y-escucha-las-24-horas",
              version: "2026-09-30; sólo Bogotá",
            },
          ],
          comprobado: "2026-11-24",
          acredita: [
            "Nacional, gratuito y las 24 horas, con una fuente de 2023.",
            "Bogotá remite ahí la urgencia de salud mental, en 2026.",
          ],
          noAcredita: ["Vigencia nacional en 2025–2026."],
          falta: ["¿Qué fuente nacional de 2025 o 2026 lo publica?"],
        },
      },
    ],
    safetyTipsShort: [
      "Respira lento.",
      "Llama a la línea 106. Es gratuita y confidencial, según el Ministerio de Salud.",
    ],
    nextSteps: [
      "Llama a la línea 106. Si tu territorio tiene la suya, puede tener otro horario.",
      "Si nadie contesta o hay peligro, llama al número de emergencias de tu país.",
    ],
  },
  MX: {
    emergencia: null,
    recursos: [
      {
        estado: "publicado",
        linea: {
          id: "mx-saptel",
          name: "SAPTEL",
          phone: "+52-55-5259-8121",
          availability: "Horario sin confirmar",
          languages: ["es"],
          notes: [
            "Servicio gratuito",
            "Su sitio publica dos horarios: 24 horas y de 9:00 a 21:00",
          ],
        },
        evidencia: {
          organismo:
            "Consejo Regional Latinoamericano y del Caribe de Salud Mental, según la página de SAPTEL",
          fuentes: [
            {
              label: "saptel.org.mx",
              url: "https://www.saptel.org.mx/",
              version: "sin año en el pie",
            },
            {
              label: "saptel.org.mx · contacto",
              url: "https://www.saptel.org.mx/contacto.html",
              version: "sin fecha; el número",
            },
            {
              label: "saptel.org.mx · qué es",
              url: "https://www.saptel.org.mx/que_es.html",
              version: "sin fecha; gratuito, 24 horas",
            },
            {
              label: "saptel.org.mx · antecedentes",
              url: "https://www.saptel.org.mx/antecedentes.html",
              version: "sin fecha; de 9:00 a 21:00",
            },
          ],
          comprobado: "2026-11-24",
          acredita: [
            "El número, (55) 5259-8121.",
            "Que el servicio es gratuito.",
          ],
          noAcredita: [
            "El horario: su sitio publica 24 horas y también 9:00–21:00.",
            "Si la llamada tiene costo.",
            "Que cubra todo el país: su sitio dice las dos cosas.",
            "Confidencialidad.",
          ],
          falta: [
            "¿Cuál es el horario vigente, 24 horas o de 9:00 a 21:00?",
            "¿La llamada tiene costo fuera de Ciudad de México? ¿Cubre todo el país? ¿Es confidencial?",
          ],
        },
      },
      {
        estado: "en-validacion",
        linea: {
          id: "mx-linea-de-la-vida",
          name: "Línea de la Vida · CONASAMA",
          phone: "800 911 2000",
          availability: "24 horas, todos los días",
          languages: ["es"],
          notes: ["Gratuita"],
        },
        evidencia: {
          organismo:
            "Comisión Nacional de Salud Mental y Adicciones (Secretaría de Salud)",
          fuentes: [
            {
              label: "gob.mx",
              url: "https://www.gob.mx/conasama/articulos/linea-de-la-vida-800-911-2000",
              version: "2025-10-23",
            },
            {
              label: "gob.mx · Línea de la Vida",
              url: "https://www.gob.mx/lineadelavida",
              version: "página viva; contenido hasta 2026-11-03",
            },
          ],
          comprobado: "2026-11-24",
          acredita: [
            "800 911 2000, desde celular o fijo.",
            "24 horas, 365 días, gratuito.",
          ],
          noAcredita: [
            "Confidencialidad o anonimato en la fuente federal.",
            "Que se pueda llamar desde el exterior.",
          ],
          falta: [
            "La decisión de publicarla.",
            "¿Es confidencial o anónima, y funciona desde el exterior?",
          ],
        },
      },
      {
        estado: "en-validacion",
        linea: {
          id: "mx-911",
          name: "911 · Emergencias",
          phone: "911",
          availability: "Horario sin confirmar",
          languages: ["es"],
          notes: ["Gratuito"],
        },
        evidencia: {
          organismo: "SESNSP",
          fuentes: [
            {
              label: "gob.mx · 911",
              url: "https://www.gob.mx/911/es/articulos/que-es-el-911emergencias?idiom=es",
              version: "2016-09-30",
            },
            {
              label: "gob.mx · CONASAMA",
              url: "https://www.gob.mx/conasama/articulos/detengamos-el-suicidio?idiom=es",
              version: "2023-09-05",
            },
          ],
          comprobado: "2026-11-24",
          acredita: [
            "Nacional y gratuito, con una fuente de 2016.",
            "CONASAMA remitía ahí la urgencia por suicidio en 2023.",
          ],
          noAcredita: ["Horario.", "Vigencia en una fuente federal reciente."],
          falta: [
            "¿Qué fuente federal reciente lo publica, y con qué horario?",
          ],
        },
      },
    ],
    safetyTipsShort: [
      "Respira lento.",
      "SAPTEL es un servicio gratuito. Su horario está sin confirmar.",
    ],
    nextSteps: [
      "Llama a SAPTEL.",
      "Si nadie contesta o hay peligro, llama al número de emergencias de tu país.",
    ],
  },
} satisfies Record<string, PaisAyuda>;

/** The directory for whoever is in no country of the list. Not a line. */
const DIRECTORIO: {
  estado: EstadoAyuda;
  directorio: Omit<CrisisDirectory, "source">;
  evidencia: EvidenciaAyuda;
} = {
  estado: "publicado",
  directorio: {
    id: "intl-findahelpline",
    name: "findahelpline.com",
    url: "https://findahelpline.com",
    note: "Es un directorio de líneas por país, de ThroughLine. No es un chat ni atiende llamadas.",
  },
  evidencia: {
    organismo: "ThroughLine Limited",
    fuentes: [
      {
        label: "iasp.info",
        url: "https://www.iasp.info/crisis-centres-helplines/",
        version: "© 2000–2026; remite a este directorio",
      },
      {
        label: "findahelpline.com",
        url: "https://findahelpline.com/about",
        version: "© 2026",
      },
    ],
    comprobado: "2026-11-24",
    acredita: [
      "Directorio web gratuito que deriva a líneas locales.",
      "IASP remite a él; IASP no es un centro de crisis ni atiende.",
    ],
    noAcredita: [
      "Que sea un chat o que alguien responda en el propio sitio.",
      "Un horario propio.",
    ],
  },
};

/** A country the catalogue has lines for. */
export type CrisisCountry = keyof typeof CRISIS_BY_COUNTRY;

/** The countries a screen may offer, in the catalogue's own order. */
export const CRISIS_COUNTRIES = /* @__PURE__ */ Object.keys(
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

/** Every resource and its evidence, whatever its state. For tests and docs. */
export function recursosDeAyuda(
  country: CrisisCountry,
): readonly RecursoAyuda[] {
  return CRISIS_BY_COUNTRY[country].recursos;
}

function sourceOf({ fuentes, comprobado }: EvidenciaAyuda): CrisisSource {
  const { label, url } = fuentes[0];
  return { label, url, checkedOn: comprobado };
}

function publishedLines(country: CrisisCountry): CrisisLine[] {
  return recursosDeAyuda(country)
    .filter((r) => r.estado === "publicado")
    .map((r) => ({ ...r.linea, source: sourceOf(r.evidencia) }));
}

/** The international directory, or `null` while it is not published. */
export function crisisDirectory(): CrisisDirectory | null {
  return DIRECTORIO.estado === "publicado"
    ? { ...DIRECTORIO.directorio, source: sourceOf(DIRECTORIO.evidencia) }
    : null;
}

export interface CrisisEmergency {
  country: CrisisCountry;
  countryName: string;
  phone: string;
}

/**
 * The accredited emergency number of a country, or `null`. It reads the
 * published lines, so pulling the line also pulls the number.
 */
export function crisisEmergencyFor(
  country: CrisisCountry,
): CrisisEmergency | null {
  const { emergencia }: PaisAyuda = CRISIS_BY_COUNTRY[country];
  const linea = publishedLines(country).find((l) => l.id === emergencia);
  return linea
    ? {
        country,
        countryName: CRISIS_COUNTRY_NAMES[country],
        phone: linea.phone,
      }
    : null;
}

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

/** A country nobody has accredited a line for: no phone, and a directory. */
function crisisFallback(): CrisisResponse {
  const directory = crisisDirectory();
  return {
    country: "INTL",
    lines: [],
    safetyTipsShort: [
      "Respira lento. 4 segundos al inhalar, 6 al exhalar.",
      "Busca a alguien de confianza.",
      "Si tienes objetos peligrosos cerca, aléjalos.",
    ],
    nextSteps: [
      "Busca una línea de tu país en findahelpline.com. Es un directorio, no un chat.",
      "Si hay peligro, llama al número de emergencias de tu país.",
      "Cuéntale a una persona lo que sientes.",
    ],
    ...(directory ? { directory } : {}),
  };
}

export function getCrisisFor(countryCode: string | undefined): CrisisResponse {
  const normalized = countryCode
    ? countryCode.toUpperCase()
    : CRISIS_DEFAULT_COUNTRY;
  if (!isCrisisCountry(normalized)) return crisisFallback();

  const { safetyTipsShort, nextSteps } = CRISIS_BY_COUNTRY[normalized];
  return {
    country: normalized,
    lines: publishedLines(normalized),
    safetyTipsShort,
    nextSteps,
  };
}

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/**
 * `2026-11-24` → `24 nov 2026`. By hand: it is a calendar day, and a `Date`
 * would move it to the previous one west of Greenwich.
 */
export function crisisCheckedOn(source: CrisisSource): string {
  const [anio, mes, dia] = source.checkedOn.split("-");
  return `${Number(dia)} ${MESES[Number(mes) - 1]} ${anio}`;
}
