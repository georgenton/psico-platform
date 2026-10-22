import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GuideRouteItem } from "@psico/types";
import { GuidedRouteList, type RouteCardVerdict } from "./GuidedRouteList";
import { useGuideRoute } from "./use-guide-route";
import { TOUCH_TARGET } from "../experience/practices/practice-ui";

vi.mock("@psico/api-client", () => ({
  guideApi: { getGuideRoute: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { guideApi } = (await import("@psico/api-client")) as any;

const GUIDES: GuideRouteItem[] = [
  {
    guideKey: "eec-c1-teorias-como-lentes",
    guideVersion: 1,
    order: 1,
    title: "Las teorías son lentes",
    description: "Qué mira cada teoría y qué deja fuera.",
    estimatedMinutes: "7–9",
  },
  {
    guideKey: "eec-c1-rostro-como-pista",
    guideVersion: 1,
    order: 2,
    title: "El rostro como pista",
    description: "Una expresión informa; no cierra la pregunta.",
    estimatedMinutes: "7–9",
  },
  {
    guideKey: "eec-c1-alarma-antes-del-relato",
    guideVersion: 1,
    order: 3,
    title: "La alarma antes del relato",
    description: "Protegerse no es lo mismo que sentir miedo.",
    estimatedMinutes: "8–10",
  },
];

const verdicts = (m: Record<string, RouteCardVerdict>) =>
  new Map(Object.entries(m));

/**
 * Las tres del fixture tienen experiencia publicada y arrancable, salvo en
 * las pruebas que existen para el caso contrario. Por defecto, estas pruebas
 * siguen hablando del VEREDICTO, que es lo que siempre midieron.
 */
const TODAS_EJECUTABLES = new Set(
  GUIDES.map((g) => `${g.guideKey}@${g.guideVersion}`),
);

describe("the guided route list", () => {
  it("renders nothing while the route is dark", () => {
    const { container } = render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "unavailable" }}
        verdicts={new Map()}
        onOpen={() => {}}
      />,
    );
    // Not an empty section, not a "próximamente": nothing at all.
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a skeleton while it is loading", () => {
    render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "loading" }}
        verdicts={new Map()}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId("route-loading")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("offers a retry when it failed", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "error" }}
        verdicts={new Map()}
        onOpen={() => {}}
        onRetry={onRetry}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Reintentar cargar el recorrido guiado",
      }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("lists one card per reading, in the server's order", () => {
    render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "available", guides: GUIDES }}
        verdicts={new Map()}
        onOpen={() => {}}
      />,
    );
    const cards = screen.getAllByTestId("route-card");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent("Las teorías son lentes");
    expect(cards[2]).toHaveTextContent("La alarma antes del relato");
    expect(cards[2]).toHaveTextContent("8–10 min");
  });

  it("gives every card its own verdict, independently", () => {
    render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({
          "eec-c1-teorias-como-lentes@1": "completed",
          "eec-c1-rostro-como-pista@1": "continue",
          "eec-c1-alarma-antes-del-relato@1": "start",
        })}
        onOpen={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Revisar: Las teorías son lentes" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Continuar: El rostro como pista" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Empezar: La alarma antes del relato",
      }),
    ).toBeEnabled();
  });

  it("refuses to offer a click when there is no verdict", () => {
    render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "available", guides: GUIDES }}
        verdicts={new Map()}
        onOpen={() => {}}
      />,
    );
    // "We could not ask" is not "you have not started".
    for (const b of screen.getAllByRole("button")) {
      expect(b).toBeDisabled();
      expect(b).toHaveTextContent("No disponible ahora");
    }
  });

  it("opens the reading the reader chose, by exact pin", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({ "eec-c1-rostro-como-pista@1": "start" })}
        onOpen={onOpen}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Empezar: El rostro como pista" }),
    );
    expect(onOpen).toHaveBeenCalledWith(GUIDES[1]);
  });

  it("is reachable with a keyboard", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({ "eec-c1-teorias-como-lentes@1": "start" })}
        onOpen={onOpen}
      />,
    );
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Empezar: Las teorías son lentes" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("never shows the historical pilot as one more card", () => {
    render(
      <GuidedRouteList
        runnablePins={TODAS_EJECUTABLES}
        state={{ status: "available", guides: GUIDES }}
        verdicts={new Map()}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByText(/cuerpo, antes que la mente/i)).toBeNull();
  });
});

describe("the route hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks nothing while disabled", () => {
    const { result } = renderHook(() =>
      useGuideRoute({
        enabled: false,
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
      }),
    );
    expect(result.current.status).toBe("idle");
    expect(guideApi.getGuideRoute).not.toHaveBeenCalled();
  });

  it("reads an available route and keeps the server's order", async () => {
    guideApi.getGuideRoute.mockResolvedValue({
      available: true,
      guides: [GUIDES[2], GUIDES[0], GUIDES[1]],
    });
    const { result } = renderHook(() =>
      useGuideRoute({
        enabled: true,
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("available"));
    if (result.current.status !== "available") throw new Error("not available");
    expect(result.current.guides.map((g) => g.order)).toEqual([1, 2, 3]);
  });

  it("treats a dark route exactly as a chapter with none", async () => {
    guideApi.getGuideRoute.mockResolvedValue({ available: false });
    const { result } = renderHook(() =>
      useGuideRoute({
        enabled: true,
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("fails closed on a shape it does not trust", async () => {
    guideApi.getGuideRoute.mockResolvedValue({ available: true, guides: [{}] });
    const { result } = renderHook(() =>
      useGuideRoute({
        enabled: true,
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("fails closed when the request rejects", async () => {
    guideApi.getGuideRoute.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() =>
      useGuideRoute({
        enabled: true,
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});

describe("una guía sin experiencia ejecutable no se ofrece", () => {
  it("la tarjeta queda deshabilitada aunque su veredicto diga «Empezar»", () => {
    // El veredicto dice lo que la persona ha hecho: para una guía que nadie
    // empezó, `start`. Eso no dice nada sobre si hay algo que abrir. El pin
    // de esta tarjeta no está entre los ejecutables.
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({
          "eec-c1-teorias-como-lentes@1": "start",
          "eec-c1-rostro-como-pista@1": "start",
          "eec-c1-alarma-antes-del-relato@1": "start",
        })}
        runnablePins={new Set(["eec-c1-rostro-como-pista@1"])}
        onOpen={() => {}}
      />,
    );

    const sinEjecutor = screen.getByRole("button", {
      name: "No disponible ahora: Las teorías son lentes",
    });
    expect(sinEjecutor).toBeDisabled();

    // Y la que sí tiene experiencia conserva su oferta.
    expect(
      screen.getByRole("button", { name: "Empezar: El rostro como pista" }),
    ).toBeEnabled();
  });

  it("no se puede abrir pulsándola", async () => {
    const onOpen = vi.fn();
    const usuario = userEvent.setup();
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({ "eec-c1-teorias-como-lentes@1": "start" })}
        runnablePins={new Set()}
        onOpen={onOpen}
      />,
    );

    await usuario
      .click(
        screen.getByRole("button", {
          name: "No disponible ahora: Las teorías son lentes",
        }),
      )
      .catch(() => {
        /* un control deshabilitado rechaza el clic: es el resultado buscado */
      });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("pero sí presenta «En curso»: la puerta es para empezar, no para seguir", () => {
    // Esta prueba afirmaba lo contrario. Era mía, y era un error: aplastar
    // todo veredicto a «desconocido» borraba también el progreso de quien ya
    // había empezado. `startable` contesta sobre altas nuevas y nada más.
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({ "eec-c1-teorias-como-lentes@1": "continue" })}
        runnablePins={new Set()}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByText("En curso")).toBeInTheDocument();
  });
});

describe("empezar, continuar y revisar son preguntas distintas", () => {
  it("3 · retirada para inicios nuevos, pero con sesión: se puede continuar", () => {
    // `startable` contesta sobre altas nuevas. Una sesión existente resuelve
    // su propia versión fijada y el servidor la sigue sirviendo; esconderla
    // sería quitarle a alguien un progreso que ya es suyo.
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({ "eec-c1-teorias-como-lentes@1": "continue" })}
        runnablePins={new Set()}
        onOpen={() => {}}
      />,
    );

    const boton = screen.getByRole("button", {
      name: "Continuar: Las teorías son lentes",
    });
    expect(boton).toBeEnabled();
    expect(screen.getByText("En curso")).toBeInTheDocument();
  });

  it("4 · sesión completada: se puede revisar, aunque no se pueda empezar otra", () => {
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({ "eec-c1-teorias-como-lentes@1": "completed" })}
        runnablePins={new Set()}
        onOpen={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Revisar: Las teorías son lentes" }),
    ).toBeEnabled();
    expect(screen.getByText("Completada")).toBeInTheDocument();
  });

  it("y continuar abre de verdad: la puerta no se traga el clic", async () => {
    const onOpen = vi.fn();
    const usuario = userEvent.setup();
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({ "eec-c1-teorias-como-lentes@1": "continue" })}
        runnablePins={new Set()}
        onOpen={onOpen}
      />,
    );

    await usuario.click(
      screen.getByRole("button", { name: "Continuar: Las teorías son lentes" }),
    );

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("5 · sin respuesta del servidor el estado es desconocido, no «retirada»", () => {
    // Un veredicto ausente es desconocimiento. No se afirma que esté
    // retirada, y tampoco se ofrece: no se puede prometer lo que no se sabe.
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({})}
        runnablePins={TODAS_EJECUTABLES}
        onOpen={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "No disponible ahora: Las teorías son lentes",
      }),
    ).toBeDisabled();
  });
});

/**
 * El área que se pulsa en la tarjeta de microguía.
 *
 * Su botón es el único control que la tarjeta tiene y la razón de que exista,
 * y medía unos 31 px de alto: por debajo de los 44 que el resto del lector
 * mantiene. Hoy no se nota porque las cinco microguías de C01 siguen en
 * borrador y las tarjetas salen deshabilitadas, pero en cuanto una se publique
 * eso pasa a ser una zona táctil de verdad.
 *
 * Las medidas se leen del estilo que el componente aplica, contra la misma
 * constante que dibuja: si alguien la baja, o quita el `minHeight`, esto falla.
 */
describe("áreas táctiles del recorrido guiado", () => {
  const alto = (el: HTMLElement) => parseFloat(el.style.minHeight || "0");

  it("el botón de la tarjeta mide al menos 44 de alto", () => {
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({
          "eec-c1-teorias-como-lentes@1": "start",
          "eec-c1-rostro-como-pista@1": "continue",
          "eec-c1-alarma-antes-del-relato@1": "completed",
        })}
        runnablePins={TODAS_EJECUTABLES}
        onOpen={() => {}}
      />,
    );

    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(3);
    for (const b of botones) {
      expect(alto(b)).toBeGreaterThanOrEqual(TOUCH_TARGET);
    }
  });

  it("y también cuando está deshabilitado", () => {
    // `ctaDisabled` se aplica ENCIMA de `cta` y sólo cambia colores y cursor.
    // Si algún día dejara de heredar el tamaño, o se invirtiera el orden de la
    // mezcla, el control que más se mira sería el más pequeño.
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={new Map()}
        runnablePins={new Set()}
        onOpen={() => {}}
      />,
    );

    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(3);
    for (const b of botones) {
      expect(b).toBeDisabled();
      expect(alto(b)).toBeGreaterThanOrEqual(TOUCH_TARGET);
    }
  });

  it("«Reintentar» tampoco es más difícil de pulsar", () => {
    // El único control del estado de error. Quien llega ahí ya tuvo un fallo;
    // es el peor sitio para una zona táctil pequeña.
    render(
      <GuidedRouteList
        state={{ status: "error" }}
        verdicts={new Map()}
        runnablePins={new Set()}
        onOpen={() => {}}
        onRetry={() => {}}
      />,
    );

    const reintentar = screen.getByRole("button", {
      name: "Reintentar cargar el recorrido guiado",
    });
    expect(alto(reintentar)).toBeGreaterThanOrEqual(TOUCH_TARGET);
  });

  it("control negativo — los 31 px de antes ya no pasarían", () => {
    // El tamaño anterior, escrito aquí para que la prueba signifique algo: si
    // `TOUCH_TARGET` volviera a un número que el padding y una línea de 13px
    // alcanzan por sí solos, esta afirmación caería.
    expect(TOUCH_TARGET).toBeGreaterThan(31);
  });

  it("el alto no se cobra en ancho: la tarjeta sigue pudiendo ser estrecha", () => {
    // La tarjeta es una columna, así que el botón crece hacia abajo. Lo que
    // produciría desbordamiento horizontal a 320 px es fijarle un ancho, y
    // eso es justo lo que no se hizo.
    render(
      <GuidedRouteList
        state={{ status: "available", guides: GUIDES }}
        verdicts={verdicts({ "eec-c1-teorias-como-lentes@1": "start" })}
        runnablePins={TODAS_EJECUTABLES}
        onOpen={() => {}}
      />,
    );

    const boton = screen.getByRole("button", {
      name: "Empezar: Las teorías son lentes",
    });
    expect(boton.style.width).toBe("");
    expect(boton.style.minWidth).toBe("");
  });
});
