import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ContentUnitRead,
  GuideExperienceCardState,
  GuideReaderAnchorLocator,
  LectorChapterResponse,
} from "@psico/types";
import { LectorShell } from "./LectorShell";
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";

/**
 * B5 — el recorrido propio es distinto del predeterminado del capítulo.
 *
 * El caso que `LectorShell.guided-offer.test.tsx` **no** representa. Su caso 3
 * conserva la puerta de un recorrido propio, y lo hace sólo para el pin
 * PREDETERMINADO del capítulo: el que `useChapterExperience` recibe. Un pin
 * archivado entra por ahí. Un pin DISTINTO, del mismo capítulo, no.
 *
 * Y ése es el que la gente tiene. Medido: el menú del recorrido sale del libro
 * mayor del guía, que no depende del CMS, así que la tarjeta ofrece «Continuar»
 * con el veredicto del servidor detrás; al pulsarla, `openRouteGuide` abría el
 * panel y el efecto que vigila la pestaña **lo cerraba en el mismo commit**,
 * porque la oferta valía `none`. Un clic sin consecuencia sobre el avance
 * propio de alguien.
 *
 * ── El escenario, exacto ───────────────────────────────────────────────────
 *
 *   - el capítulo tiene recorrido predeterminado **A** (`cuerpo-antes-que-mente`,
 *     que es además el pin real retirado);
 *   - su oferta publicada está **vacía**;
 *   - esta persona **no** tiene recorrido propio en A (404 por identidad exacta);
 *   - **sí** lo tiene en **B** (`teorias-como-lentes`), del mismo capítulo,
 *     reproducible y admitido por el servidor;
 *   - su tarjeta ofrece «Continuar».
 *
 * Lo que se exige: que la acción abra B y lo **mantenga** abierto, y que cerrar
 * y volver a abrir conserve B. Más el control contrario, que es lo que impide
 * que esto degenere en una pestaña vacía para cualquiera.
 *
 * Nada de esto prueba propiedad ni permiso por una selección del cliente: lo que
 * la oferta lee son los estados que el servidor devolvió por pin exacto.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

const getGuideDiscovery = vi.fn();
const getGuideRoute = vi.fn();
const getExperienceCardStates = vi.fn();
const listPublishedForChapter = vi.fn();
const getOwnByPin = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: (...a: unknown[]) => getGuideDiscovery(...a),
      getGuideRoute: (...a: unknown[]) => getGuideRoute(...a),
      getExperienceCardStates: (...a: unknown[]) =>
        getExperienceCardStates(...a),
    },
    experienceApi: {
      listPublishedForChapter: (...a: unknown[]) =>
        listPublishedForChapter(...a),
      getOwnByPin: (...a: unknown[]) => getOwnByPin(...a),
    },
  };
});

import { ApiError } from "@psico/api-client";

/** A — el predeterminado del capítulo, y el pin retirado de verdad. */
const A = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
  sourceHeading: "El cuerpo y la emoción",
  passageLastSentence:
    "Nuestro cuerpo siente antes que nuestra mente entienda.",
};

/** B — otro recorrido del MISMO capítulo, en el que esta persona tiene sesión. */
const B = {
  guideKey: "eec-c1-teorias-como-lentes",
  guideVersion: 1,
  sourceHeading: "Distintas lentes para comprender una emoción",
  passageLastSentence:
    "Las teorías sobre las emociones no son simples opiniones",
};

const BOOK_SLUG = "emociones-en-construccion";
const CHAPTER_ORDER = 1;
const GUIDE_TAB = "reader-mode-guiada";
const PANEL = "reader-guide-panel";

/** El estado por pin, tal como lo devuelve el lote del servidor. */
function estado(
  pin: { guideKey: string; guideVersion: number },
  over: Partial<GuideExperienceCardState> = {},
): GuideExperienceCardState {
  return {
    guidePin: pin,
    status: "START",
    resumePin: pin,
    evaluatedPin: pin,
    applicability: "APPLIES",
    presentation: "PLAYABLE",
    ...over,
  };
}

/** El recorrido del capítulo: dos lecturas, A y B, como lo lista el servidor. */
const RUTA = {
  available: true,
  guides: [
    {
      guideKey: A.guideKey,
      guideVersion: A.guideVersion,
      order: 1,
      title: "El cuerpo primero",
      description: "Lo que el cuerpo dice antes que la mente.",
      estimatedMinutes: "7–9",
    },
    {
      guideKey: B.guideKey,
      guideVersion: B.guideVersion,
      order: 2,
      title: "Lentes para una emoción",
      description: "Tres teorías leídas como lentes, no como verdades.",
      estimatedMinutes: "7–9",
    },
  ],
};

/**
 * Bloques que satisfacen los DOS localizadores.
 *
 * Un capítulo real contiene los pasajes de sus cinco microguías, así que esto
 * no es una concesión del arnés: sin ambos, la condición 6 de
 * `guideRuntimeReady` —el pasaje se localiza— fallaría para el pin que corra y
 * el panel no se montaría por una razón distinta de la que se está probando.
 * Cada frase aparece una sola vez: los localizadores declaran
 * `expectedMatchCount: 1`.
 */
function unidad(): ContentUnitRead {
  const bloque = (
    n: number,
    kind: "HEADING" | "PARAGRAPH",
    content: string,
  ) => ({
    blockKey: `bk-${n}`,
    legacyBlockId: `b-${n}`,
    blockVersionId: `bv-${n}`,
    kind,
    order: n,
    content,
    meta: null,
  });
  return {
    editionKey: `${BOOK_SLUG}-1e`,
    revisionNumber: 1,
    unitKey: `unit-${CHAPTER_ORDER}`,
    title: "Capítulo",
    summary: null,
    order: CHAPTER_ORDER,
    partNumber: null,
    partTitle: null,
    source: "content-core",
    blocks: [
      bloque(1, "HEADING", A.sourceHeading),
      bloque(2, "PARAGRAPH", `Un preámbulo. ${A.passageLastSentence}`),
      bloque(3, "HEADING", B.sourceHeading),
      bloque(4, "PARAGRAPH", `Otro preámbulo. ${B.passageLastSentence}`),
    ],
  } as unknown as ContentUnitRead;
}

function initial(): LectorChapterResponse {
  return {
    book: { id: "b", slug: BOOK_SLUG, title: "Un libro", totalChapters: 10 },
    chapter: {
      id: `ch-${CHAPTER_ORDER}`,
      order: CHAPTER_ORDER,
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
          bookSlug={BOOK_SLUG}
          initial={initial()}
          unit={unidad()}
          marks={null}
        />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>,
  );
}

/**
 * El lote de estados **sólo se pide en la portada o con el panel abierto**
 * (`if (surface !== "home" && !guideOpen) return`), así que el camino del
 * encargo pasa por la portada: es donde está la tarjeta. Esto va allí y espera
 * a que el servidor haya contestado.
 */
async function irAPortada(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId("reader-open-chapter-home"));
  await waitFor(() => expect(getExperienceCardStates).toHaveBeenCalled());
}

/**
 * Una AUSENCIA no se confirma con una espera corta: el lector se hidrata por
 * partes. Se espera a que las tres lecturas hayan contestado antes de afirmar
 * que algo falta.
 */
async function asentar() {
  await waitFor(() => expect(getGuideDiscovery).toHaveBeenCalled());
  await waitFor(() => expect(listPublishedForChapter).toHaveBeenCalled());
  await waitFor(() => expect(getExperienceCardStates).toHaveBeenCalled());
  await waitFor(() => expect(true).toBe(true));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  // La preparación entera en verde, en todos los casos. Lo único que cambia de
  // caso a caso es qué dice el servidor sobre el recorrido propio.
  getGuideDiscovery.mockResolvedValue({
    available: true,
    guideKey: A.guideKey,
    guideVersion: A.guideVersion,
  });
  getGuideRoute.mockResolvedValue(RUTA);
  // El capítulo no publica NADA, y esta persona no tiene recorrido propio en A.
  listPublishedForChapter.mockResolvedValue({ items: [] });
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

describe("B5 · un recorrido propio en otro pin del mismo capítulo", () => {
  /** El escenario del encargo: sesión en B, nada publicado, nada propio en A. */
  function sesionEnB(over: Partial<GuideExperienceCardState> = {}) {
    getExperienceCardStates.mockResolvedValue({
      items: [estado(A), estado(B, { status: "CONTINUE", ...over })],
    });
  }

  it("la tarjeta de B ofrece «Continuar», que es de donde parte el caso", async () => {
    sesionEnB();
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);

    expect(
      await screen.findByRole("button", {
        name: /Continuar: Lentes para una emoción/i,
      }),
    ).toBeEnabled();
  });

  it("conserva la pestaña guiada aunque el capítulo no publique nada", async () => {
    // Antes: `none`, pestaña oculta, y el clic de la tarjeta sin efecto.
    sesionEnB();
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);

    expect(await screen.findByTestId(GUIDE_TAB)).toBeInTheDocument();
  });

  it("abrir B desde su tarjeta deja el panel ABIERTO, y lo mantiene", async () => {
    // El corazón del caso. El panel se abría y el efecto que vigila la pestaña
    // lo cerraba en el mismo commit, así que la comprobación no es sólo que
    // aparezca: es que siga ahí después de que los efectos hayan corrido.
    sesionEnB();
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);

    await user.click(
      await screen.findByRole("button", {
        name: /Continuar: Lentes para una emoción/i,
      }),
    );

    expect(await screen.findByTestId(PANEL)).toBeInTheDocument();
    // Y que no se cierre un tick después, que es exactamente lo que hacía.
    await asentar();
    expect(screen.getByTestId(PANEL)).toBeInTheDocument();
    // Abierto sobre B, no sobre el predeterminado del capítulo: el panel pinta
    // el recorrido que el servidor dijo reanudar.
    expect(screen.getByTestId(PANEL)).toHaveTextContent(/Recorrido guiado/i);
    expect(
      screen.queryByTestId("rgp-sin-recorrido-publicado"),
    ).not.toBeInTheDocument();
  });

  it("cerrar y volver a abrir conserva B, no el predeterminado", async () => {
    sesionEnB();
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);
    await user.click(
      await screen.findByRole("button", {
        name: /Continuar: Lentes para una emoción/i,
      }),
    );
    await screen.findByTestId(PANEL);

    // Cerrar es un gesto visual: no cancela nada ni suelta el pin elegido.
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() =>
      expect(screen.queryByTestId(PANEL)).not.toBeInTheDocument(),
    );

    // Y volver a abrir por la pestaña — sin pasar otra vez por la tarjeta.
    await user.click(await screen.findByTestId(GUIDE_TAB));

    expect(await screen.findByTestId(PANEL)).toBeInTheDocument();
    await asentar();
    expect(screen.getByTestId(PANEL)).toBeInTheDocument();
    // Si hubiera vuelto al pin predeterminado, el panel diría que el capítulo
    // no publica nada. Es la asimetría que distingue «conserva B» de «abre
    // algo».
    expect(
      screen.queryByTestId("rgp-sin-recorrido-publicado"),
    ).not.toBeInTheDocument();
  });

  it("el control contrario · sin recorrido propio, NO hay pestaña", async () => {
    // Misma preparación, mismo capítulo vacío, y nadie ha empezado nada. Esto
    // es lo que impide que B5 reparta pestañas vacías.
    getExperienceCardStates.mockResolvedValue({
      items: [estado(A), estado(B)],
    });
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);
    await asentar();

    expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
  });

  it("el control contrario · con una sesión pero nada que reproducir, NO hay pestaña", async () => {
    // El estado de las cinco microguías antes de publicarse: «Completada» era
    // cierto y el panel no tenía nada que pintar.
    sesionEnB({ presentation: "PREPARING" });
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);
    await asentar();

    expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
  });

  it("el control contrario · si el servidor no lo admite aquí, NO hay pestaña", async () => {
    sesionEnB({ applicability: "UNAVAILABLE" });
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);
    await asentar();

    expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
  });

  it("un re-preguntar de rutina NO le quita la puerta a quien ya la tenía", async () => {
    // La pegajosidad al contexto, probada como lo que evita.
    //
    // La autoridad vuelve a `loading` cada vez que algo invalida la respuesta
    // anterior: volver a la portada, recuperar el foco, y —la peor— terminar un
    // recorrido, que revalida CON EL PANEL ABIERTO. Sin memoria, la oferta
    // caería a `none` en ese instante, la pestaña se ocultaría y el efecto que
    // la vigila cerraría el panel: el mismo defecto, por el camino de al lado.
    //
    // Se fuerza de forma determinista en vez de por carrera: la primera
    // consulta contesta y la segunda no contesta nunca, así que la autoridad se
    // queda en `loading` y lo único que puede sostener la pestaña es la
    // memoria.
    getExperienceCardStates
      .mockResolvedValueOnce({
        items: [estado(A), estado(B, { status: "CONTINUE" })],
      })
      .mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);
    expect(await screen.findByTestId(GUIDE_TAB)).toBeInTheDocument();

    // Volver al lector y a la portada invalida la respuesta anterior: la
    // segunda consulta sale y se queda colgada.
    await user.click(screen.getByTestId("reader-open-chapter-home"));
    await user.click(screen.getByTestId("reader-open-chapter-home"));
    await waitFor(() =>
      expect(getExperienceCardStates.mock.calls.length).toBeGreaterThan(1),
    );
    await asentar();

    expect(screen.getByTestId(GUIDE_TAB)).toBeInTheDocument();
  });

  it("un recorrido TERMINADO también conserva su puerta", async () => {
    // «Revisar» es la otra acción que el encargo nombra.
    sesionEnB({ status: "COMPLETED" });
    const user = userEvent.setup();
    renderReader();
    await irAPortada(user);

    expect(await screen.findByTestId(GUIDE_TAB)).toBeInTheDocument();
  });
});
