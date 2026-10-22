import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GuideRouteItem } from "@psico/types";
import { GuidedRouteNavigator } from "./GuidedRouteNavigator";
import type { RouteCardVerdict } from "./guide-route-verdict";
import { TOUCH_TARGET } from "../experience/practices/practice-ui";

/**
 * El navegador compacto del recorrido, medido por lo que se puede pulsar.
 *
 * Es la mitad compacta de la misma idea que `GuidedRouteList`, y compacto era
 * justo el problema. Medido en el navegador: la fila 38 px (los 22 de la marca
 * más 7 de padding y el borde), «Reintentar» 26, y el `summary` que pliega la
 * hoja en un teléfono 15,6 — el más pequeño de los tres, y el que este
 * componente existe para ofrecer.
 *
 * Las medidas se leen del estilo que el componente aplica, contra la misma
 * constante que dibuja: si alguien la baja, o quita un `minHeight`, esto falla.
 * La densidad que se pierde es deliberada y está anotada en el componente.
 */

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

const TODOS_CON_VEREDICTO = verdicts({
  "eec-c1-teorias-como-lentes@1": "start",
  "eec-c1-rostro-como-pista@1": "continue",
  "eec-c1-alarma-antes-del-relato@1": "completed",
});

const alto = (el: HTMLElement) => parseFloat(el.style.minHeight || "0");

describe("áreas táctiles del navegador del recorrido", () => {
  it("cada fila mide al menos 44 de alto", () => {
    render(
      <GuidedRouteNavigator
        state={{ status: "available", guides: GUIDES }}
        verdicts={TODOS_CON_VEREDICTO}
        activePin={null}
        onOpen={() => {}}
      />,
    );

    const filas = screen.getAllByRole("button");
    expect(filas).toHaveLength(3);
    for (const f of filas) {
      expect(alto(f)).toBeGreaterThanOrEqual(TOUCH_TARGET);
    }
  });

  it("también la fila que está en pantalla", () => {
    // `rowActive` se aplica ENCIMA de `row`: dice cómo se ve la que se está
    // leyendo, no cuánto mide. Si se invirtiera el orden de la mezcla, la fila
    // que más se mira sería la única pequeña.
    render(
      <GuidedRouteNavigator
        state={{ status: "available", guides: GUIDES }}
        verdicts={TODOS_CON_VEREDICTO}
        activePin={{ guideKey: "eec-c1-rostro-como-pista", guideVersion: 1 }}
        onOpen={() => {}}
      />,
    );

    const activa = screen.getByRole("button", { current: true });
    expect(activa).toHaveAttribute("data-active", "true");
    expect(alto(activa)).toBeGreaterThanOrEqual(TOUCH_TARGET);
  });

  it("y la fila sin veredicto, que es la que más se ve hoy", () => {
    // `rowDisabled` sólo baja la opacidad. Las cinco microguías de C01 siguen
    // en borrador, así que ésta es la fila real del capítulo ahora mismo.
    render(
      <GuidedRouteNavigator
        state={{ status: "available", guides: GUIDES }}
        verdicts={new Map()}
        activePin={null}
        onOpen={() => {}}
      />,
    );

    const filas = screen.getAllByRole("button");
    expect(filas).toHaveLength(3);
    for (const f of filas) {
      expect(f).toBeDisabled();
      expect(alto(f)).toBeGreaterThanOrEqual(TOUCH_TARGET);
    }
  });

  it("el control que pliega el recorrido también se puede pulsar", () => {
    // Un `summary` no es un `button`, pero el dedo no distingue: es lo que se
    // toca para doblar la hoja a una línea en un teléfono.
    const { container } = render(
      <GuidedRouteNavigator
        state={{ status: "available", guides: GUIDES }}
        verdicts={TODOS_CON_VEREDICTO}
        activePin={null}
        onOpen={() => {}}
      />,
    );

    const resumen = container.querySelector("summary");
    expect(resumen).not.toBeNull();
    expect(alto(resumen as HTMLElement)).toBeGreaterThanOrEqual(TOUCH_TARGET);
  });

  it("«Reintentar» tampoco es más difícil de pulsar", () => {
    render(
      <GuidedRouteNavigator
        state={{ status: "error" }}
        verdicts={new Map()}
        activePin={null}
        onOpen={() => {}}
        onRetry={() => {}}
      />,
    );

    const reintentar = screen.getByRole("button", {
      name: "Reintentar cargar el recorrido del capítulo",
    });
    expect(alto(reintentar)).toBeGreaterThanOrEqual(TOUCH_TARGET);
  });

  it("control negativo — los ~38 px de la fila ya no pasarían", () => {
    // El alto anterior de la fila, escrito aquí para que la prueba signifique
    // algo: la marca de 22 px más el padding y el borde llegaban solos a 38.
    expect(TOUCH_TARGET).toBeGreaterThan(38);
  });

  it("el alto es mínimo, no fijo: un título largo envuelve", () => {
    // `rowTitle` no lleva `nowrap`, así que un título largo pasa a dos líneas.
    // Con `height` fijo eso se recortaría contra su propio `overflow: hidden`;
    // con `minHeight` la fila crece.
    render(
      <GuidedRouteNavigator
        state={{ status: "available", guides: GUIDES }}
        verdicts={TODOS_CON_VEREDICTO}
        activePin={null}
        onOpen={() => {}}
      />,
    );

    for (const f of screen.getAllByRole("button")) {
      expect(f.style.height).toBe("");
    }
  });

  it("el tamaño no se lleva por delante lo que la fila ya decía", () => {
    // Agrandar los controles no puede borrar lo que el navegador informa: la
    // marca, el estado en palabras y cuántas van completadas.
    render(
      <GuidedRouteNavigator
        state={{ status: "available", guides: GUIDES }}
        verdicts={TODOS_CON_VEREDICTO}
        activePin={{ guideKey: "eec-c1-rostro-como-pista", guideVersion: 1 }}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByTestId("rgp-route-count")).toHaveTextContent("1 de 3");
    expect(screen.getByText("Sin empezar")).toBeInTheDocument();
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("Completada")).toBeInTheDocument();
    for (const g of GUIDES) {
      expect(screen.getByText(g.title)).toBeInTheDocument();
    }
  });
});
