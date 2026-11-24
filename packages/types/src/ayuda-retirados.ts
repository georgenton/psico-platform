import type { EvidenciaAyuda, EstadoAyuda } from "./crisis-catalog";

/**
 * Help resources that were published and must not come back without a
 * decision.
 *
 * ── Why this file is in no bundle ─────────────────────────────────────────
 *
 * `index.ts` does not export it and the package does not build it, so it ships
 * to nobody: not to the browser, not to the app, not to the API. Its only
 * readers are the tests, by path. `ayuda-retirados.spec.ts` in the API takes
 * the traces below and fails if any of them shows up in code that is served —
 * a screen, a prompt, a seed, the built package.
 *
 * Bringing one back means deleting its entry here with a primary source that
 * says what it is, and adding it to `crisis-catalog.ts`.
 */
export interface RecursoRetirado {
  id: string;
  estado: Extract<EstadoAyuda, "retirado">;
  /** What the product published, word for word. */
  nombre: string;
  telefono: string | null;
  motivo: string;
  fuentes: EvidenciaAyuda["fuentes"] | null;
  comprobado: string;
  /**
   * How it is recognised. Digits only: that number, with any separators and
   * with or without prefix. Anything else: that text, ignoring case.
   */
  huellas: readonly string[];
}

export const RECURSOS_RETIRADOS: readonly RecursoRetirado[] = [
  {
    id: "ec-cetad",
    estado: "retirado",
    nombre: "CETAD · Centro de Escucha Telefónica",
    telefono: "+593-2-3960-100",
    motivo:
      "El número es la central del Ministerio de Agricultura, Ganadería y Pesca del Ecuador. CETAD es el nombre de centros de tratamiento del Ministerio de Salud Pública; ninguna fuente abierta publica un «Centro de Escucha Telefónica».",
    fuentes: [
      {
        label: "agricultura.gob.ec",
        url: "https://www.agricultura.gob.ec/direcciones/",
        version: "página viva",
      },
      {
        label: "salud.gob.ec",
        url: "https://www.salud.gob.ec/msp-cuenta-con-132-unidades-para-atencion-en-salud-mental-y-tratamiento-de-consumo-de-drogas/",
        version: "2023-09-14; qué es un CETAD",
      },
    ],
    comprobado: "2026-11-24",
    huellas: ["3960100", "CETAD", "Centro de Escucha Telefónica"],
  },
  {
    id: "ec-telefono-amistad",
    estado: "retirado",
    nombre: "Teléfono de la Amistad Quito",
    telefono: "+593-2-2563-141",
    motivo:
      "Ninguna fuente, primaria o secundaria, sostiene el nombre, el número ni el horario.",
    fuentes: null,
    comprobado: "2026-11-24",
    huellas: ["2563141", "Teléfono de la Amistad"],
  },
  {
    id: "ec-1800-4-salud",
    estado: "retirado",
    nombre: "Línea de Crisis Ecuador: 1800-4-SALUD (1800-472583)",
    telefono: "1800-472583",
    motivo:
      "Ninguna fuente sostiene el número, ni que atienda 24/7, ni que sea gratuito o confidencial.",
    fuentes: null,
    comprobado: "2026-11-24",
    huellas: ["1800472583", "1800-4-SALUD", "Línea de Crisis Ecuador"],
  },
  {
    id: "intl-iasp-telefono",
    estado: "retirado",
    nombre: "IASP · Directorio internacional",
    telefono: "+1-800-273-8255",
    motivo:
      "El número es el de la línea de prevención del suicidio de Estados Unidos (hoy 988). No es de IASP, que no atiende, ni es internacional.",
    fuentes: [
      {
        label: "988lifeline.org",
        url: "https://988lifeline.org/faq/about-us/faq-does-1-800-273-talk-8255-still-work/",
        version: "sin fecha; el cambio a 988 fue el 2022-07-16",
      },
      {
        label: "iasp.info",
        url: "https://www.iasp.info/crisis-centres-helplines/",
        version: "© 2000–2026",
      },
    ],
    comprobado: "2026-11-24",
    huellas: ["8002738255", "IASP · Directorio internacional"],
  },
  {
    id: "ec-sas-911",
    estado: "retirado",
    nombre: "SAS · 911 Salud Mental",
    // The number is right and stays published, as what it is: emergencies.
    telefono: null,
    motivo:
      "Es un rótulo, no un número: no se encontró ningún servicio llamado «911 Salud Mental» ni un organismo «SAS». El 911 sigue publicado como emergencias.",
    fuentes: [
      {
        label: "gob.ec",
        url: "https://www.gob.ec/ecu-911/tramites/solicitud-atencion-emergencia-traves-diferentes-mecanismos-alerta",
        version: "actualizada 2025-10-28",
      },
    ],
    comprobado: "2026-11-24",
    huellas: ["911 Salud Mental", "SAS · 911"],
  },
];
