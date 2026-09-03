import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GuideRouteItem } from "@psico/types";
import { GuidedRouteList, type RouteCardVerdict } from "./GuidedRouteList";
import { useGuideRoute } from "./use-guide-route";

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

describe("the guided route list", () => {
  it("renders nothing while the route is dark", () => {
    const { container } = render(
      <GuidedRouteList
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
