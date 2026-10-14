import { render as renderRTL, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CircleTemplateRegistry } from "@psico/types";
// Type-only, so it is erased before `vi.mock`'s hoisted factory runs.
import type * as EligibilityModule from "@/lib/circulos/eligibility";

/** The sentinel Next's own `notFound()` throws, stood in for here. */
const NOT_FOUND = new Error("NEXT_NOT_FOUND");

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));
vi.mock("server-only", () => ({}));

const serverFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api.server", () => ({
  serverFetch: (...args: unknown[]) => serverFetch(...args),
  // La implementación real: reconoce los throws de Next por su `digest`.
  isNextThrow: (err: unknown) =>
    typeof (err as { digest?: unknown })?.digest === "string",
}));

// El formulario es un Client Component con su propio estado; aquí sólo importa
// SI se ofrece, no cómo se comporta por dentro.
vi.mock("@/components/circulos/CrearCirculo", () => ({
  CrearCirculo: () => <div data-testid="formulario-creacion" />,
}));

/**
 * Records what the page hands the resolver, then delegates to the REAL one.
 *
 * A recording wrapper rather than a stub: the behaviour under test is the
 * page's, so replacing the resolver would only prove the test's own double
 * works.
 */
const keysSeen = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/circulos/eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof EligibilityModule>();
  return {
    ...actual,
    resolvePublishedTemplateByKey: (key: string, deps?: unknown) => {
      keysSeen.push(key);
      return (
        actual.resolvePublishedTemplateByKey as (
          k: string,
          d?: unknown,
        ) => unknown
      )(key, deps);
    },
  };
});

import NuevoDuoPage from "./page";
import {
  resolvePublishedTemplateByKey,
  type DuoEligibilityDeps,
} from "@/lib/circulos/eligibility";
import { PLANTILLA } from "@/components/circulos/__fixtures__/actividad";

/**
 * The organiser route's refusal is uniform, and it never throws.
 *
 * `params.templateKey` arrives ALREADY decoded — Next decodes dynamic segments
 * itself. The page used to decode it a second time, which is not a harmless
 * redundancy: a key containing a literal `%` (`100%`, `50%-50%`) makes
 * `decodeURIComponent` throw `URIError`, and an unhandled throw is a 500 on a
 * route whose every other refusal is a quiet 404. The single input most likely
 * to be probed would have been the single input that answered differently.
 *
 * ── Y la segunda mitad, añadida después ────────────────────────────────────
 *
 * La página decidía con el catálogo y nada más, así que para quien el rollout
 * no admite renderizaba el formulario entero con su botón — una creación que
 * la API contesta con 503, y el rechazo llegaba al pulsar. Medido en staging
 * el 14-10. Lo que se comprueba abajo es que la autoridad es el servidor, que
 * los grupos tienen su propio permiso, y que una respuesta que no se puede
 * creer se lee cerrada.
 */

/** El refuseo del catálogo ocurre ANTES de consultar nada, y aquí se captura. */
async function render(templateKey: string): Promise<{ threw: unknown }> {
  try {
    await NuevoDuoPage({ params: { templateKey } });
    return { threw: null };
  } catch (err) {
    return { threw: err };
  }
}

const DUO = "duo-lo-que-me-ayuda";
const GRUPO = "grupo-lo-que-nos-ayuda";

const pintar = async (templateKey: string) =>
  renderRTL(await NuevoDuoPage({ params: { templateKey } }));

const seOfreceLaCreacion = () =>
  screen.queryByTestId("formulario-creacion") !== null;

beforeEach(() => {
  serverFetch.mockReset();
  keysSeen.length = 0;
});

describe("a malformed decoded key is refused, not thrown at", () => {
  const MALFORMED = ["100%", "50%-50%", "%", "%E0%A4%A", "descuento-%%", "%zz"];

  it("never raises URIError for a key containing a literal %", async () => {
    for (const key of MALFORMED) {
      const { threw } = await render(key);
      expect(threw, key).not.toBeInstanceOf(URIError);
      expect((threw as Error)?.name, key).not.toBe("URIError");
    }
  });

  it("takes the same notFound() path as any unknown key", async () => {
    const baseline = (await render("una-clave-que-no-existe")).threw;
    expect(baseline).toBe(NOT_FOUND);

    for (const key of MALFORMED) {
      // Not merely "a 404" — the very same sentinel, by the very same route.
      expect((await render(key)).threw, key).toBe(baseline);
    }
  });

  it("hands the key to the resolver verbatim, decoding nothing", async () => {
    // If the page decoded a second time, `a%20b` would arrive as `a b` and
    // `100%` would not arrive at all — it would have thrown on the way.
    keysSeen.length = 0;
    await render("100%");
    await render("a%20b");
    await render("eec-c1-cuerpo-antes-que-mente");
    expect(keysSeen).toEqual([
      "100%",
      "a%20b",
      "eec-c1-cuerpo-antes-que-mente",
    ]);
  });

  it("una clave rechazada no llega a preguntar por capacidades", async () => {
    // El orden importa: el catálogo refuta primero, así que una clave
    // desconocida no gasta una consulta ni filtra que la ruta existe.
    await render("100%");
    await render("una-clave-que-no-existe");
    expect(serverFetch).not.toHaveBeenCalled();
  });
});

describe("the refusal reveals nothing about WHY", () => {
  it("unknown, ambiguous, DRAFT and ARCHIVED are one answer", () => {
    // The page turns `null` into `notFound()`. So the question is whether the
    // resolver's four refusals are distinguishable — they must not be, or the
    // address bar becomes a way to enumerate the catalog.
    const withSource = (over = {}) => ({
      ...PLANTILLA,
      source: {
        bookSlug: "fixture-book",
        chapterOrder: 1,
        experiencePin: { experienceKey: "x", experienceVersion: 1 },
      },
      ...over,
    });
    const d = (definitions: ReturnType<typeof withSource>[]) =>
      ({
        catalog: [],
        registry: new CircleTemplateRegistry(definitions),
      }) as DuoEligibilityDeps;

    const answers = [
      // unknown
      resolvePublishedTemplateByKey("no-existe", d([withSource()])),
      // DRAFT
      resolvePublishedTemplateByKey(
        "fixture-duo",
        d([withSource({ status: "DRAFT" })]),
      ),
      // ARCHIVED
      resolvePublishedTemplateByKey(
        "fixture-duo",
        d([withSource({ status: "ARCHIVED" })]),
      ),
      // ambiguous — two PUBLISHED versions of one key
      resolvePublishedTemplateByKey(
        "fixture-duo",
        d([withSource(), withSource({ templateVersion: 2 })]),
      ),
      // malformed
      resolvePublishedTemplateByKey("100%", d([withSource()])),
      // empty
      resolvePublishedTemplateByKey("fixture-duo", d([])),
    ];

    // One value, six causes. Nothing carries the reason outward.
    expect(answers).toEqual([null, null, null, null, null, null]);
    expect(new Set(answers).size).toBe(1);
  });

  it("una clave que el catálogo no publica es notFound, sea cual sea", async () => {
    // Antes este caso decía «el catálogo está vacío en producción». Dejó de ser
    // cierto: hoy publica `duo-lo-que-me-ayuda@2` y `grupo-lo-que-nos-ayuda@1`.
    // Lo que sigue valiendo —y es lo que importa— es que cualquier clave que no
    // esté publicada recibe la misma respuesta, incluida la de C07.
    for (const key of [
      "fixture-duo",
      "pqp-c7-reconocer-la-violencia",
      "eec-c1-cuerpo-antes-que-mente",
      "100%",
    ]) {
      expect((await render(key)).threw, key).toBe(NOT_FOUND);
    }
  });
});

describe("la pantalla de creación sigue la autoridad del servidor", () => {
  it("sin sesión usable, la redirección se propaga — no se pinta «no disponible»", async () => {
    const redireccion = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    serverFetch.mockRejectedValue(redireccion);

    await expect(pintar(DUO)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("autenticado pero no habilitado: lo dice, y no ofrece crear nada", async () => {
    serverFetch.mockRejectedValue(
      Object.assign(new Error("CIRCLES_UNAVAILABLE"), { statusCode: 503 }),
    );

    await pintar(DUO);

    expect(screen.getByRole("heading")).toHaveTextContent(
      /todavía no está abierto/i,
    );
    expect(seOfreceLaCreacion()).toBe(false);
  });

  it("habilitado para Dúo: el recorrido actual se conserva", async () => {
    serverFetch.mockResolvedValue({ available: true, canCreateGroups: false });

    await pintar(DUO);

    expect(seOfreceLaCreacion()).toBe(true);
  });

  it("grupos deshabilitados: la plantilla de GRUPO no se ofrece, aunque Círculos esté abierto", async () => {
    // El caso que la deducción «disponible ⇒ grupos» rompía.
    serverFetch.mockResolvedValue({ available: true, canCreateGroups: false });

    await pintar(GRUPO);

    expect(screen.getByRole("heading")).toHaveTextContent(
      /todavía no puedes crear un grupo/i,
    );
    expect(seOfreceLaCreacion()).toBe(false);
  });

  it("grupos habilitados: la plantilla de GRUPO sí se ofrece", async () => {
    serverFetch.mockResolvedValue({ available: true, canCreateGroups: true });

    await pintar(GRUPO);

    expect(seOfreceLaCreacion()).toBe(true);
  });

  it("si la consulta de disponibilidad falla, falla cerrada", async () => {
    serverFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    await pintar(DUO);

    expect(seOfreceLaCreacion()).toBe(false);
  });
});

/**
 * Una respuesta que RESUELVE no es una respuesta que AFIRME algo.
 *
 * `serverFetch<CirclesAccessResponse>` es una anotación de TypeScript, borrada
 * al compilar: nadie valida el JSON. La primera versión de esta página
 * devolvía «disponible» por el mero hecho de no haber lanzado, de modo que un
 * cuerpo `null`, `{}` o incluso `{available:false}` abría la pantalla. Es el
 * mismo fallo que la página corrige, reintroducido por la puerta del tipado.
 */
describe("un cuerpo que no se puede creer se lee cerrado", () => {
  const CUERPOS_INVALIDOS: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["objeto vacío", {}],
    ["available:false", { available: false }],
    ["available como cadena", { available: "true" }],
    ["available numérico", { available: 1 }],
    ["una cadena", "available"],
    ["un arreglo", []],
  ];

  it.each(CUERPOS_INVALIDOS)(
    "con %s no se ofrece la creación del Dúo",
    async (_nombre, cuerpo) => {
      serverFetch.mockResolvedValue(cuerpo);

      await pintar(DUO);

      expect(seOfreceLaCreacion()).toBe(false);
    },
  );

  it("una respuesta contradictoria —grupos sin disponibilidad— no concede nada", async () => {
    // El segundo interruptor sólo puede ESTRECHAR, así que conceder grupos sin
    // conceder el acceso es un contrato roto, no un permiso parcial.
    serverFetch.mockResolvedValue({ available: false, canCreateGroups: true });

    await pintar(GRUPO);

    expect(seOfreceLaCreacion()).toBe(false);
  });

  it.each([
    ["cadena", "true"],
    ["número", 1],
    ["nulo", null],
  ])(
    "con disponibilidad válida pero grupos como %s, el grupo no se ofrece",
    async (_nombre, valor) => {
      serverFetch.mockResolvedValue({
        available: true,
        canCreateGroups: valor,
      });

      await pintar(GRUPO);

      expect(seOfreceLaCreacion()).toBe(false);
    },
  );

  // Compatibilidad hacia atrás: si Web se promueve antes que API, el segundo
  // campo no viene. El Dúo tiene que seguir funcionando; el grupo, no. Son dos
  // afirmaciones distintas y van en dos casos, para que un fallo diga cuál.
  it("una API antigua conserva el Dúo", async () => {
    serverFetch.mockResolvedValue({ available: true });
    await pintar(DUO);
    expect(seOfreceLaCreacion()).toBe(true);
  });

  it("una API antigua no concede grupos por omisión", async () => {
    serverFetch.mockResolvedValue({ available: true });
    await pintar(GRUPO);
    expect(seOfreceLaCreacion()).toBe(false);
  });
});
