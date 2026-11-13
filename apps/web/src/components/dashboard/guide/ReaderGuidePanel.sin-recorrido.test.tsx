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
      }) => listar(input),
      // Declarado, y con la respuesta del servidor real. Omitirlo hacía que la
      // llamada muriera con un `TypeError` y que el hook lo tragara como «no
      // tienes nada aquí»: el mock fabricaba el defecto que se está probando.
      getOwnByPin: () => propio(),
    },
  };
});

import { ApiError } from "@psico/api-client";
import { ReaderGuidePanel } from "./ReaderGuidePanel";
import {
  EEC_BUNDLE,
  PQP_PIN,
  experiencesForChapter,
  ownByPinNotFound,
} from "./guide-test-fixtures";

/** Un pin bien formado que el capítulo 1 del libro ancla NO ofrece. */
const OTRO_PIN = PQP_PIN;

/**
 * Las dos lecturas, cada una sustituible por caso.
 *
 * Hacen falta dos porque el hook pregunta dos veces y **las dos pueden
 * fallar**: la lista del capítulo y, si el pin no está en ella, el recorrido
 * propio por identidad exacta. El defecto que estas pruebas fijan es que
 * cualquiera de los dos fallos acababa leyéndose como una decisión editorial.
 */
let listar: (input: { bookSlug: string; chapterOrder: number }) => Promise<{
  items: unknown[];
}>;
let propio: () => Promise<never>;

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
  listar = (input) => Promise.resolve(experiencesForChapter(input));
  propio = () => ownByPinNotFound();
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

  it("una consulta que FALLA no se anuncia como un capítulo sin publicar", async () => {
    // El defecto de la versión anterior de este mismo arreglo. Preguntaba
    // `status !== "loading" && definition === null`, así que un 500 —o una red
    // caída, o una sesión caducada— caía en la rama editorial y la pantalla
    // afirmaba algo del catálogo a partir de una pregunta sin contestar.
    listar = () => Promise.reject(new ApiError(500, "BOOM"));
    render(panel(7, RESUELTO));

    await waitFor(() =>
      expect(screen.getByTestId("rgp-consulta-fallida")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/todavía no tiene recorrido guiado publicado/i),
    ).not.toBeInTheDocument();
    // Y dice qué hacer, que es lo que distingue un fallo reintentable de una
    // decisión de quien publica.
    expect(screen.getByText(/vuelve a abrir este panel/i)).toBeInTheDocument();
  });

  it("y tampoco cuando lo que falla es la lectura del recorrido propio", async () => {
    // La SEGUNDA lectura. La lista contesta bien y vacía; el hook pregunta
    // entonces por el pin con identidad exacta, y ahí el 404 es la respuesta
    // normal. Un 401 no lo es: es una pregunta que no llegó a contestarse, y
    // antes el `catch` desnudo la convertía en certeza de ausencia.
    propio = () => Promise.reject(new ApiError(401, "EXPIRED"));
    render(panel(7, RESUELTO));

    await waitFor(() =>
      expect(screen.getByTestId("rgp-consulta-fallida")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/todavía no tiene recorrido guiado publicado/i),
    ).not.toBeInTheDocument();
  });

  it("un 404 del recorrido propio SÍ es una respuesta, y no un fallo", async () => {
    // El control negativo del caso anterior: sin él, la prueba pasaría igual
    // con un hook que llamara «fallo» a cualquier cosa, y los siete capítulos
    // sin publicar volverían a leerse como una avería.
    render(panel(7, RESUELTO));

    await waitFor(() =>
      expect(
        screen.getByTestId("rgp-sin-recorrido-publicado"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("rgp-consulta-fallida"),
    ).not.toBeInTheDocument();
  });

  it("cuando el capítulo publica otros y este pin no está, no dice que esté vacío", async () => {
    // Capítulo 1: publica su experiencia, pero el panel va pinchado a OTRO
    // pin que no está en la oferta ni es un recorrido propio. Decir «el
    // capítulo no tiene recorrido publicado» ahí sería falso: hay uno, en otra
    // tarjeta, y la salida de la persona es distinta.
    render(
      <ReaderGuidePanel
        actorScope={SCOPE}
        bundle={{ ...EEC_BUNDLE, pin: OTRO_PIN }}
        anchor={RESUELTO}
        concept={CONCEPT}
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        apiBase="https://api.test/api"
        token="tok"
        onClose={vi.fn()}
        onGoToPassage={vi.fn()}
        onContinueReading={vi.fn()}
        onOpenExplicitCheckin={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("rgp-recorrido-no-disponible"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/todavía no tiene recorrido guiado publicado/i),
    ).not.toBeInTheDocument();
  });
});
