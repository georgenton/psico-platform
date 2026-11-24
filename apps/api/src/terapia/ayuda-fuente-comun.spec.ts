import {
  CRISIS_COUNTRIES,
  crisisCheckedOn,
  crisisDirectory,
  crisisEmergencyFor,
  dialableHotline,
  getCrisisFor,
  recursosDeAyuda,
  type CrisisCountry,
  type EstadoAyuda,
} from "@psico/types";
import { afterEach, describe, expect, it } from "vitest";

import { RECURSOS_RETIRADOS } from "../../../../packages/types/src/ayuda-retirados";
import { crisisNotice } from "../eco/crisis";

/**
 * Las reglas de la fuente común de ayuda.
 *
 * Los literales servidos están en `crisis-catalog.e2e-spec.ts`. Aquí se
 * comprueba lo que los literales no pueden decir: que la puerta es el estado,
 * que todo lo publicado trae su evidencia, y que los consejos no nombran lo que
 * la lista no tiene.
 */

const TODOS = CRISIS_COUNTRIES.flatMap((pais) =>
  recursosDeAyuda(pais).map((recurso) => ({ pais, recurso })),
);
const PUBLICADOS = TODOS.filter((t) => t.recurso.estado === "publicado");
const EN_VALIDACION = TODOS.filter((t) => t.recurso.estado === "en-validacion");

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

describe("cada recurso trae su evidencia", () => {
  it("hay de las dos clases, o esto no comprueba nada", () => {
    expect(PUBLICADOS.map((t) => t.recurso.linea.id)).toEqual([
      "ec-911",
      "co-106",
      "mx-saptel",
    ]);
    expect(EN_VALIDACION.map((t) => t.recurso.linea.id)).toEqual([
      "ec-171-6",
      "co-123",
      "mx-linea-de-la-vida",
      "mx-911",
    ]);
    // Lo retirado no vive en el catálogo, que sí viaja al navegador.
    expect(TODOS.length).toBe(PUBLICADOS.length + EN_VALIDACION.length);
  });

  it.each(TODOS.map((t) => [t.recurso.linea.id, t.recurso] as const))(
    "%s: organismo, fuentes primarias, fecha, qué acredita y qué no",
    (_id, { evidencia }) => {
      expect(evidencia.organismo).not.toBe("");
      expect(evidencia.fuentes.length).toBeGreaterThan(0);
      for (const f of evidencia.fuentes) {
        expect(f.label).not.toBe("");
        expect(f.version).not.toBe("");
        expect(new URL(f.url).protocol).toBe("https:");
      }
      expect(evidencia.comprobado).toMatch(FECHA);
      expect(evidencia.acredita.length).toBeGreaterThan(0);
      expect(evidencia.noAcredita.length).toBeGreaterThan(0);
    },
  );

  it.each(EN_VALIDACION.map((t) => [t.recurso.linea.id, t.recurso] as const))(
    "%s: dice qué falta para publicarlo",
    (_id, { evidencia }) => {
      expect(evidencia.falta?.length ?? 0).toBeGreaterThan(0);
    },
  );

  it("ningún identificador se repite, tampoco con los retirados", () => {
    const ids = [
      ...TODOS.map((t) => t.recurso.linea.id),
      ...RECURSOS_RETIRADOS.map((r) => r.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("todo lo que se sirve trae fuente, fecha y un número marcable", () => {
  const SERVIDAS = CRISIS_COUNTRIES.flatMap((pais) =>
    getCrisisFor(pais).lines.map((linea) => [linea.id, linea] as const),
  );

  it.each(SERVIDAS)("%s", (_id, linea) => {
    expect(linea.source).toBeDefined();
    expect(linea.source!.checkedOn).toMatch(FECHA);
    expect(new URL(linea.source!.url).protocol).toBe("https:");
    expect(crisisCheckedOn(linea.source!)).toMatch(/^\d{1,2} [a-z]{3} \d{4}$/);

    // Lo que leen las aplicaciones instaladas.
    expect(typeof linea.phone).toBe("string");
    expect(linea.availability).not.toBe("");
    expect(linea.languages.length).toBeGreaterThan(0);
  });

  it("los `tel:`, escritos a mano", () => {
    expect(SERVIDAS.map(([id, l]) => [id, dialableHotline(l.phone)])).toEqual([
      ["ec-911", "911"],
      ["co-106", "106"],
      ["mx-saptel", "+52-55-5259-8121"],
    ]);
  });

  it("y los que esperan, también: publicar no puede estrenar un enlace muerto", () => {
    expect(
      EN_VALIDACION.map(({ recurso: { linea } }) => [
        linea.id,
        dialableHotline(linea.phone),
      ]),
    ).toEqual([
      // Se marca 171; la opción se elige después.
      ["ec-171-6", "171"],
      ["co-123", "123"],
      ["mx-linea-de-la-vida", "8009112000"],
      ["mx-911", "911"],
    ]);
  });

  it("la fecha se dice como un día del calendario, sin husos", () => {
    expect(
      crisisCheckedOn({ label: "x", url: "x", checkedOn: "2026-01-01" }),
    ).toBe("1 ene 2026");
  });
});

describe("la puerta es el estado, y nada más", () => {
  const originales = TODOS.map((t) => t.recurso.estado);
  afterEach(() => {
    TODOS.forEach((t, i) => {
      t.recurso.estado = originales[i]!;
    });
  });

  const poner = (id: string, estado: EstadoAyuda) => {
    TODOS.find((t) => t.recurso.linea.id === id)!.recurso.estado = estado;
  };
  const ids = (pais: CrisisCountry) =>
    getCrisisFor(pais).lines.map((l) => l.id);

  it.each(["en-validacion", "retirado"] as const)(
    "el 911 en «%s» deja de servirse, y Eco deja de darlo",
    (estado) => {
      expect(ids("EC")).toEqual(["ec-911"]);
      poner("ec-911", estado);
      expect(ids("EC")).toEqual([]);
      expect(crisisEmergencyFor("EC")).toBeNull();
      expect(crisisNotice("EC").text).not.toMatch(/\d/);
      expect(crisisNotice(null).text).not.toMatch(/\d/);
      expect(dialableHotline(crisisNotice("EC").hotline)).toBeNull();
    },
  );

  it("publicar una que espera es cambiar su estado", () => {
    poner("ec-171-6", "publicado");
    const linea = getCrisisFor("EC").lines.find((l) => l.id === "ec-171-6");
    expect(linea?.source).toEqual({
      label: "salud.gob.ec",
      url: "https://www.salud.gob.ec/linea-171-opcion-6/",
      checkedOn: "2026-11-24",
    });
    // Y no la convierte en el número de emergencias de nadie.
    expect(crisisEmergencyFor("EC")?.phone).toBe("911");
  });

  it("publicar el 123 no lo vuelve la emergencia de Colombia por su cuenta", () => {
    poner("co-123", "publicado");
    expect(ids("CO")).toEqual(["co-106", "co-123"]);
    expect(crisisEmergencyFor("CO")).toBeNull();
  });
});

describe("la emergencia de cada país", () => {
  it("sólo donde está acreditada", () => {
    expect(
      CRISIS_COUNTRIES.map((p) => [p, crisisEmergencyFor(p)?.phone ?? null]),
    ).toEqual([
      ["EC", "911"],
      ["CO", null],
      ["MX", null],
    ]);
    expect(crisisEmergencyFor("EC")).toEqual({
      country: "EC",
      countryName: "Ecuador",
      phone: "911",
    });
  });
});

describe("los consejos y los pasos no nombran lo que la lista no tiene", () => {
  it.each([...CRISIS_COUNTRIES, "INTL"])("%s", (pais) => {
    const { lines, safetyTipsShort, nextSteps } = getCrisisFor(pais);
    const copia = [...safetyTipsShort, ...nextSteps].join("\n");
    const numeros = lines.map((l) => l.phone.replace(/\D/g, ""));
    for (const n of copia.match(/\d{3,}/g) ?? []) {
      expect(numeros).toContain(n);
    }
    // Un sitio web que se nombre tiene que ser el del directorio publicado.
    for (const sitio of copia.match(/[a-z]+\.(com|org|gob\.ec)\b/g) ?? []) {
      expect(sitio).toBe(crisisDirectory()?.name);
    }
  });

  it("ni prometen horarios, anonimato o que alguien responda ahora", () => {
    for (const pais of [...CRISIS_COUNTRIES, "INTL"]) {
      const copia = JSON.stringify(getCrisisFor(pais));
      expect(copia).not.toMatch(/24\s*\/\s*7/);
      expect(copia).not.toMatch(/an[oó]nim/i);
      expect(copia).not.toMatch(/ahora mismo/i);
    }
  });

  it("sin país, en español", () => {
    const copia = JSON.stringify(getCrisisFor("ZZ"));
    expect(copia).not.toMatch(/\b(breathe|reach out|visit|someone)\b/i);
    expect(getCrisisFor("ZZ").lines).toEqual([]);
  });
});
