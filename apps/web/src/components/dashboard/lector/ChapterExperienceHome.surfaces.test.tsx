import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChapterExperiencePublicView, GuideRouteItem } from "@psico/types";
import { ChapterExperienceHome } from "./ChapterExperienceHome";
import type { RouteCardVerdict } from "../guide/GuidedRouteList";
import type { GuideRouteState } from "../guide/use-guide-route";
import { EEC_C01_MICROGUIDES } from "../guide/eec-c01-microguides";

/**
 * One surface per reading.
 *
 * Publishing EEC-C01's five put them in BOTH lists at once: the chapter's
 * guided route and the older published-experiences list. A reader saw the same
 * five readings twice, and the second set could not be opened. These assert the
 * split that fixed it — and that Parejas is untouched by it.
 */

const view = (
  guideKey: string,
  title: string,
): ChapterExperiencePublicView => ({
  experienceKey: guideKey,
  experienceVersion: 1,
  title,
  guidePin: { guideKey, guideVersion: 1 },
  scenes: [],
});

const FIVE = EEC_C01_MICROGUIDES.map((m) => view(`eec-c1-${m.slug}`, m.title));
const PILOT = view(
  "eec-c1-cuerpo-antes-que-mente",
  "El cuerpo, antes que la mente",
);
const PAREJAS = view("pqp-c1-contacto-sostenido", "El contacto sostenido");

const ROUTE: GuideRouteItem[] = EEC_C01_MICROGUIDES.map((m, i) => ({
  guideKey: `eec-c1-${m.slug}`,
  guideVersion: 1,
  order: i + 1,
  title: m.title,
  description: m.summary,
  estimatedMinutes: m.duration.replace(" minutos", ""),
}));

const verdicts = new Map<string, RouteCardVerdict>(
  ROUTE.map((g) => [`${g.guideKey}@1`, "start"]),
);

function renderHome(
  routeState: GuideRouteState,
  onOpenRouteGuide = vi.fn(),
  onOpenExperience = vi.fn(),
) {
  render(
    <ChapterExperienceHome
      book={{
        title: "Emociones en Construcción",
        authorName: "M. Q.",
        slug: "emociones-en-construccion",
      }}
      chapter={{
        order: 1,
        title: "¿Realmente sabemos qué es una emoción?",
        durationMinutes: 30,
        partNumber: 1,
        partTitle: "Parte I",
      }}
      progressPct={0.1}
      modeViews={{
        leer: { kind: "BOOK", state: "PUBLISHED", label: "Leer" },
        escuchar: { kind: "AUDIOBOOK", state: "HIDDEN", label: "🎧 Escuchar" },
        ver: { kind: "VIDEO", state: "HIDDEN", label: "🎬 Ver" },
      }}
      guidedView={{ kind: "GUIDED", state: "HIDDEN", label: "Lectura guiada" }}
      experiencesEnabled
      experiences={[...FIVE, PILOT, PAREJAS]}
      experienceStates={{
        status: "ready",
        states: new Map(),
        requestKey: "k",
        generation: 1,
      }}
      canRunResumePin={() => true}
      onOpenExperience={onOpenExperience}
      activityCount={4}
      onContinueReading={() => {}}
      onPickMode={() => {}}
      onOpenActivities={() => {}}
      routeState={routeState}
      routeVerdicts={verdicts}
      onOpenRouteGuide={onOpenRouteGuide}
    />,
  );
  return { onOpenRouteGuide, onOpenExperience };
}

describe("with the flag off — the route is dark", () => {
  it("shows no guided route and no card for the five", () => {
    renderHome({ status: "unavailable" });
    expect(screen.queryByTestId("route-list")).toBeNull();
    expect(screen.queryAllByTestId("route-card")).toHaveLength(0);
    for (const m of EEC_C01_MICROGUIDES) {
      expect(screen.queryByText(m.title), m.slug).toBeNull();
    }
  });

  it("does not offer the historical pilot as a card either", () => {
    renderHome({ status: "unavailable" });
    expect(screen.queryByText("El cuerpo, antes que la mente")).toBeNull();
  });

  it("still lists Parejas, exactly as before", () => {
    renderHome({ status: "unavailable" });
    expect(screen.getByText("El contacto sostenido")).toBeInTheDocument();
  });
});

describe("with the flag on — one surface, five cards", () => {
  it("shows exactly five route cards", () => {
    renderHome({ status: "available", guides: ROUTE });
    expect(screen.getAllByTestId("route-card")).toHaveLength(5);
  });

  it("does not duplicate them in the published-experiences list", () => {
    renderHome({ status: "available", guides: ROUTE });
    for (const m of EEC_C01_MICROGUIDES) {
      // Once — on the route card — and nowhere else.
      expect(screen.getAllByText(m.title), m.slug).toHaveLength(1);
    }
  });

  it("keeps the pilot out of both surfaces", () => {
    renderHome({ status: "available", guides: ROUTE });
    expect(screen.queryByText("El cuerpo, antes que la mente")).toBeNull();
    const list = screen.getByTestId("route-list");
    expect(list.textContent).not.toMatch(/cuerpo,? antes que la mente/i);
  });

  it("opens the reading the reader picked — MG01 opens MG01", async () => {
    const user = userEvent.setup();
    const { onOpenRouteGuide } = renderHome({
      status: "available",
      guides: ROUTE,
    });
    await user.click(
      screen.getByRole("button", {
        name: `Empezar: ${EEC_C01_MICROGUIDES[0].title}`,
      }),
    );
    expect(onOpenRouteGuide).toHaveBeenCalledOnce();
    expect(onOpenRouteGuide.mock.calls[0][0].guideKey).toBe(
      "eec-c1-teorias-como-lentes",
    );
  });

  it("…and MG03 opens MG03", async () => {
    const user = userEvent.setup();
    const { onOpenRouteGuide } = renderHome({
      status: "available",
      guides: ROUTE,
    });
    await user.click(
      screen.getByRole("button", {
        name: `Empezar: ${EEC_C01_MICROGUIDES[2].title}`,
      }),
    );
    expect(onOpenRouteGuide.mock.calls[0][0].guideKey).toBe(
      "eec-c1-alarma-antes-del-relato",
    );
  });
});
