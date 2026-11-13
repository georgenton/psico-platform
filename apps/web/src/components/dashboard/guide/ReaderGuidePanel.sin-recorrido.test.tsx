import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type * as ApiClientModule from "@psico/api-client";
import type { GuideAnchorResolution } from "./guide-anchor";

/**
 * «No está publicado» y «no pudimos prepararlo» no son lo mismo.
 *
 * El panel refusaba con una sola frase para tres causas distintas, y la que
 * leía peor era la estructural. Medido en staging con la cuenta del padrón: de
 * los 10 capítulos del libro ancla, 8 muestran la pestaña del recorrido guiado
 * —el descubrimiento por capítulo nombra un pin, el paquete del cliente existe
 * y el pasaje se localiza— y 7 de esos 8 no tienen ninguna experiencia
 * publicada detrás de ese pin. Los siete decían «No pudimos preparar el
 * recorrido», que se lee como un fallo que alguien podría reintentar contra un
 * capítulo que simplemente no está publicado todavía.
 *
 * Si en ese caso debería ofrecerse una pestaña es una decisión de producto, y
 * no de este componente. Decir cuál de las tres cosas pasa, sí.
 */

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      createGuideSession: vi.fn(),
      completeGuideSessionStep: vi.fn(),
      submitGuideStepRecall: vi.fn(),
      cancelGuideSession: vi.fn(),
      completeGuideSession: vi.fn(),
    },
    experienceApi: {
      listPublishedForChapter: (input: {
        bookSlug: string;
        chapterOrder: number;
      }) => Promise.resolve(experiencesForChapter(input)),
    },
  };
});

import { ReaderGuidePanel } from "./ReaderGuidePanel";
import { EEC_BUNDLE, experiencesForChapter } from "./guide-test-fixtures";

const SCOPE = "r".repeat(43);
const CONCEPT = { key: "c", label: "Un concepto" } as const;
const RESUELTO: GuideAnchorResolution = {
  status: "RESOLVED",
  blockKey: "k-1",
  blockVersionId: "v-1",
  renderBlockId: "b-1",
};

function panel(chapterOrder: number, anchor: GuideAnchorResolution) {
  return (
    <ReaderGuidePanel
      actorScope={SCOPE}
      bundle={EEC_BUNDLE}
      anchor={anchor}
      concept={CONCEPT}
      bookSlug="emociones-en-construccion"
      chapterOrder={chapterOrder}
      apiBase="https://api.test/api"
      token="tok"
      onClose={vi.fn()}
      onGoToPassage={vi.fn()}
      onContinueReading={vi.fn()}
      onOpenExplicitCheckin={vi.fn()}
    />
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ReaderGuidePanel — cuando no hay nada que recorrer", () => {
  it("dice que el capítulo no tiene recorrido publicado, y no que falló algo", async () => {
    // El capítulo 7 del libro ancla: pasaje localizado, cero experiencias
    // publicadas. Es el caso de 7 de los 8 capítulos que ofrecen la pestaña.
    render(panel(7, RESUELTO));

    await waitFor(() =>
      expect(
        screen.getByTestId("rgp-sin-recorrido-publicado"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/todavía no tiene recorrido guiado publicado/i),
    ).toBeInTheDocument();
    // Y explícitamente NO la frase de fallo: es el punto del arreglo.
    expect(screen.queryByText(/No pudimos preparar/i)).not.toBeInTheDocument();
  });

  it("conserva la frase de fallo cuando el pasaje de verdad no se localiza", async () => {
    // Aquí sí hay algo roto o movido: el capítulo 1 publica su experiencia y
    // el ancla no resuelve. Una causa distinta merece una frase distinta.
    render(panel(1, { status: "UNRESOLVED" } as GuideAnchorResolution));

    await waitFor(() =>
      expect(screen.getByTestId("rgp-anchor-unresolved")).toBeInTheDocument(),
    );
    expect(screen.getByText(/No pudimos preparar/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/todavía no tiene recorrido guiado publicado/i),
    ).not.toBeInTheDocument();
  });

  it("y cuando faltan las dos cosas, nombra la que es la causa", async () => {
    // Capítulo sin nada publicado Y con el ancla sin resolver. Las dos son
    // ciertas, y sólo una es la causa: el ancla de un recorrido que no existe
    // no es una avería. La primera versión de este componente ponía el ancla
    // por delante y reportaba una avería donde no había ninguna.
    render(panel(7, { status: "UNRESOLVED" } as GuideAnchorResolution));

    await waitFor(() =>
      expect(
        screen.getByTestId("rgp-sin-recorrido-publicado"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/No pudimos preparar/i)).not.toBeInTheDocument();
  });

  it("y no adelanta ninguna de las dos mientras la pregunta está en vuelo", async () => {
    // Síncrono a propósito: antes de que la promesa resuelva, el estado es
    // «loading» y la única frase honesta es la de espera.
    render(panel(7, RESUELTO));

    expect(screen.getByText("Preparando el recorrido…")).toBeInTheDocument();
    expect(screen.queryByText(/No pudimos preparar/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/todavía no tiene recorrido guiado publicado/i),
    ).not.toBeInTheDocument();
    // Y el identificador tampoco adelanta el veredicto: «todavía no sé» no
    // puede marcarse como «no está publicado», que es lo que leerían las
    // pruebas y cualquier instrumento que mire el DOM.
    expect(
      screen.queryByTestId("rgp-sin-recorrido-publicado"),
    ).not.toBeInTheDocument();

    // Y se deja llegar la respuesta dentro del test, para no dejar la
    // actualización de estado fuera de `act` ni colgando entre casos.
    await waitFor(() =>
      expect(
        screen.getByTestId("rgp-sin-recorrido-publicado"),
      ).toBeInTheDocument(),
    );
  });
});
