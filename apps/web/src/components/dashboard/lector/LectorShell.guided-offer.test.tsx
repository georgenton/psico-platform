import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type {
  ContentUnitRead,
  GuideReaderAnchorLocator,
  LectorChapterResponse,
} from "@psico/types";
import { GUIDE_READER_ANCHOR } from "@psico/types";
import { LectorShell } from "./LectorShell";
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";

/**
 * Una pestaña es una oferta.
 *
 * Las seis condiciones de `guideRuntimeReady` dicen que el lector *podría*
 * montar un recorrido: el padrón está abierto para este actor, hay ámbito, el
 * descubrimiento contestó, el pin se parsea, este build trae su presentación y
 * el pasaje se localiza en el capítulo en pantalla. **Ninguna de las seis dice
 * que haya un recorrido publicado.**
 *
 * Medido en staging el 2026-11-13 con la cuenta del padrón: 8 de los 10
 * capítulos del libro ancla ofrecían la pestaña «🌱 Experiencia guiada» y 7 de
 * esos 8 no tenían nada detrás. La pestaña invitaba a una sala vacía, y lo
 * hacía con la preparación entera en verde — porque el menú del guía sale del
 * catálogo en código, que nombra un pin para los diez capítulos.
 *
 * Lo que este fichero fija son los tres casos del encargo, que son tres
 * respuestas distintas y no tres grados de la misma:
 *
 *   1. el capítulo publica algo → hay pestaña;
 *   2. no publica nada → NO hay pestaña;
 *   3. no publica nada **y** esta persona tiene un recorrido propio aquí → hay
 *      pestaña, porque su puerta se conserva.
 *
 * Y el cuarto, que es el que distingue una regla honesta de una que apaga de
 * más: una consulta que **falla** no es un capítulo vacío.
 *
 * Nada de esto es un límite en la API. El servidor sigue admitiendo un inicio
 * sin Experience publicada, deliberadamente: el libro mayor del guía no cuelga
 * del CMS. Esconder una pestaña es la interfaz normal, no una frontera.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

const getGuideDiscovery = vi.fn();
const listPublishedForChapter = vi.fn();
const getOwnByPin = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: (...a: unknown[]) => getGuideDiscovery(...a),
    },
    experienceApi: {
      listPublishedForChapter: (...a: unknown[]) =>
        listPublishedForChapter(...a),
      getOwnByPin: (...a: unknown[]) => getOwnByPin(...a),
    },
  };
});

import { ApiError } from "@psico/api-client";
import { EEC_EXPERIENCE } from "../guide/guide-test-fixtures";

const EEC_PIN = { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 };
const GUIDE_TAB = "reader-mode-guiada";

beforeEach(() => {
  vi.clearAllMocks();
  // La preparación, entera en verde, en los cuatro casos. Lo único que cambia
  // de caso a caso es si hay algo que ofrecer.
  getGuideDiscovery.mockResolvedValue({ available: true, ...EEC_PIN });
  getOwnByPin.mockRejectedValue(new ApiError(404, "EXPERIENCE_NOT_FOUND"));
  class FakeIO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;
  Range.prototype.getBoundingClientRect = () => ({}) as DOMRect;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("{}", { status: 200 }),
  );
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
  vi.restoreAllMocks();
});

/** Blocks that carry the locator's heading and sentence — so the anchor resolves. */
function unitFor(locator: GuideReaderAnchorLocator): ContentUnitRead {
  return {
    editionKey: `${locator.bookSlug}-1e`,
    revisionNumber: 1,
    unitKey: `unit-${locator.chapterOrder}`,
    title: "Capítulo",
    summary: null,
    order: locator.chapterOrder,
    partNumber: null,
    partTitle: null,
    source: "content-core",
    blocks: [
      {
        blockKey: "bk-h",
        legacyBlockId: "b-h",
        blockVersionId: "bv-h",
        kind: "HEADING",
        order: 1,
        content: locator.sourceHeading,
        meta: null,
      },
      {
        blockKey: "bk-p",
        legacyBlockId: "b-p",
        blockVersionId: "bv-p",
        kind: "PARAGRAPH",
        order: 2,
        content: `Un preámbulo. ${locator.passageLastSentence}`,
        meta: null,
      },
    ],
  };
}

function initial(order: number): LectorChapterResponse {
  return {
    book: { id: "b", slug: "s", title: "Un libro", totalChapters: 9 },
    chapter: {
      id: `ch-${order}`,
      order,
      title: "Un capítulo",
      description: null,
      durationMinutes: 10,
      audioAvailable: false,
    },
    blocks: [],
    lessons: [],
    preferences: {
      font: "serif",
      fontSize: 18,
      theme: "system",
      lineHeight: 1.6,
    },
    highlights: [],
    annotations: [],
    session: {
      lastBlockId: null,
      progressPct: 0,
      timeSpentSec: 0,
      completedAt: null,
    },
  } as unknown as LectorChapterResponse;
}

function renderReader() {
  return render(
    <GuideAvailabilityProvider available>
      <GuideActorScopeProvider scope={"A".repeat(43)}>
        <LectorShell
          apiBase="https://api.example/api"
          token="tok"
          bookSlug={GUIDE_READER_ANCHOR.bookSlug}
          initial={initial(GUIDE_READER_ANCHOR.chapterOrder)}
          unit={unitFor(GUIDE_READER_ANCHOR)}
          marks={null}
        />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>,
  );
}

/**
 * Una AUSENCIA no se confirma con una espera corta.
 *
 * El lector se hidrata por partes y la pestaña aparece cuando contestan tres
 * lecturas distintas, así que un `queryBy` inmediato diría «no está» también
 * cuando sí va a estar. Se espera a que la oferta esté decidida —la pestaña
 * presente en el caso positivo— antes de afirmar que falta.
 */
async function settle() {
  await waitFor(() => expect(getGuideDiscovery).toHaveBeenCalled());
  await waitFor(() => expect(listPublishedForChapter).toHaveBeenCalled());
  // Dos vueltas más para que el `setState` de las dos lecturas pinte.
  await waitFor(() => expect(true).toBe(true));
  await new Promise((r) => setTimeout(r, 0));
}

describe("GUIDED_OFFER · la pestaña guiada sólo se ofrece si hay algo detrás", () => {
  it("1 · el capítulo publica su recorrido: hay pestaña", async () => {
    listPublishedForChapter.mockResolvedValue({ items: [EEC_EXPERIENCE] });
    renderReader();

    expect(await screen.findByTestId(GUIDE_TAB)).toBeInTheDocument();
  });

  it("2 · el capítulo no publica nada: NO hay pestaña", async () => {
    // El caso de 7 de los 8 capítulos que la ofrecían. La preparación es la
    // misma del caso 1 — lo único que cambia es que no hay nada que abrir.
    listPublishedForChapter.mockResolvedValue({ items: [] });
    renderReader();
    await settle();

    expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
  });

  it("3 · un recorrido propio conserva su puerta aunque el capítulo no publique nada", async () => {
    // El servidor contesta por identidad exacta: la sesión es de quien
    // pregunta. Pasa con un pin ARCHIVADO, que deja de estar en la oferta y
    // sigue siendo suyo — y esconderle la pestaña sería quitarle el avance que
    // tiene guardado.
    listPublishedForChapter.mockResolvedValue({ items: [] });
    getOwnByPin.mockResolvedValue({ experience: EEC_EXPERIENCE });
    renderReader();

    expect(await screen.findByTestId(GUIDE_TAB)).toBeInTheDocument();
  });

  it("4 · una consulta que falla NO esconde la pestaña", async () => {
    // `failed` no es `none`. Quitarle la puerta por una red caída a quien
    // tiene un recorrido empezado es peor que ofrecerla de más, y el propio
    // panel explica desde dentro que no se pudo consultar.
    listPublishedForChapter.mockRejectedValue(new ApiError(500, "BOOM"));
    renderReader();

    expect(await screen.findByTestId(GUIDE_TAB)).toBeInTheDocument();
  });

  it("5 · y tampoco cuando lo que falla es la lectura del recorrido propio", async () => {
    listPublishedForChapter.mockResolvedValue({ items: [] });
    getOwnByPin.mockRejectedValue(new ApiError(401, "EXPIRED"));
    renderReader();

    expect(await screen.findByTestId(GUIDE_TAB)).toBeInTheDocument();
  });
});
