import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ChapterExperiencePublicView,
  GuideSessionView,
} from "@psico/types";
import { ExperienceList, experienceCardStatus } from "./ExperienceList";

/**
 * GR-7 — Chapter Home, by cardinality.
 *
 * Three cases, and the interesting one is zero: a chapter with no journey
 * shows no section, no placeholder and no disabled card. "No hay
 * experiencias" is a worse answer than saying nothing, because it turns a
 * complete chapter into an apology.
 *
 * The status assertions matter for a different reason. A card that said
 * «Continuar» when nothing was open would be the client guessing at progress
 * the server owns — so the status is derived from the session the server
 * reported, and a session belonging to another journey never colours a card.
 */

function experience(
  n: number,
  over: Partial<ChapterExperiencePublicView> = {},
): ChapterExperiencePublicView {
  return {
    experienceKey: `exp-${n}`,
    experienceVersion: 1,
    title: `Experiencia ${n}`,
    summary: `Resumen ${n}`,
    estimatedMinutes: 10 + n,
    guidePin: { guideKey: `guide-${n}`, guideVersion: 1 },
    scenes: [],
    ...over,
  };
}

function sessionFor(
  n: number,
  status: GuideSessionView["status"] = "ACTIVE",
): GuideSessionView {
  return {
    sessionId: `ses_${n}`,
    guideKey: `guide-${n}`,
    guideVersion: 1,
    status,
    stepsCompleted: 1,
    totalSteps: 3,
    currentStepKey: "paso",
  };
}

const onOpen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("Chapter Home · cardinality", () => {
  it("0 experiences — the section does not exist", () => {
    render(<ExperienceList experiences={[]} session={null} onOpen={onOpen} />);

    expect(screen.queryByTestId("chapter-experiences")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    // Not an empty state: no placeholder, no "coming soon", no disabled card.
    expect(screen.queryByText(/no hay/i)).toBeNull();
    expect(screen.queryByText(/próximamente/i)).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("1 experience — one card, not a carousel of one", () => {
    render(
      <ExperienceList
        experiences={[experience(1)]}
        session={null}
        onOpen={onOpen}
      />,
    );

    const section = screen.getByTestId("chapter-experiences");
    expect(within(section).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Experiencia 1")).toBeInTheDocument();
    expect(screen.getByText("Resumen 1")).toBeInTheDocument();
    // No tab strip, no slider, no "1 de 1".
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/1 de 1/)).toBeNull();
  });

  it("3 experiences — three cards in the SERVER's order", () => {
    render(
      <ExperienceList
        experiences={[experience(1), experience(2), experience(3)]}
        session={null}
        onOpen={onOpen}
      />,
    );

    const titles = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("p")?.textContent);
    expect(titles).toEqual(["Experiencia 1", "Experiencia 2", "Experiencia 3"]);
  });

  it("10 experiences — all ten, no editorial cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => experience(i + 1));
    render(
      <ExperienceList experiences={many} session={null} onOpen={onOpen} />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("Experiencia 10")).toBeInTheDocument();
    expect(screen.queryByText(/ver más/i)).toBeNull();
  });

  it("the list has an accessible heading and each card one clear action", () => {
    render(
      <ExperienceList
        experiences={[experience(1), experience(2)]}
        session={null}
        onOpen={onOpen}
      />,
    );

    const heading = screen.getByRole("heading", {
      name: "Experiencias guiadas",
    });
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveAttribute(
      "aria-labelledby",
      heading.id,
    );
    for (const button of screen.getAllByRole("button")) {
      // The visible word is inside the accessible name, so a voice-control
      // user can say what they can read.
      expect(button.getAttribute("aria-label")).toContain(
        button.textContent ?? "",
      );
    }
  });
});

describe("Chapter Home · card status comes from the server", () => {
  it("no session → Empezar", () => {
    expect(experienceCardStatus(experience(1), null)).toBe("start");
    render(
      <ExperienceList
        experiences={[experience(1)]}
        session={null}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByRole("button", { name: /Empezar/ })).toBeInTheDocument();
  });

  it("a recoverable session for THIS pin → Continuar", () => {
    render(
      <ExperienceList
        experiences={[experience(1)]}
        session={sessionFor(1)}
        onOpen={onOpen}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Continuar/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/En curso/)).toBeInTheDocument();
  });

  it("a session for ANOTHER journey never colours this card", () => {
    // The strong form: an open run elsewhere must not read as progress here.
    expect(experienceCardStatus(experience(1), sessionFor(2))).toBe("start");
    render(
      <ExperienceList
        experiences={[experience(1)]}
        session={sessionFor(2)}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByRole("button", { name: /Empezar/ })).toBeInTheDocument();
  });

  it("a completed session → Completada, and it stays openable", async () => {
    render(
      <ExperienceList
        experiences={[experience(1)]}
        session={sessionFor(1, "COMPLETED")}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText(/Completada/)).toBeInTheDocument();
    const action = screen.getByRole("button", { name: /Ver resumen/ });
    await userEvent.click(action);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("rendering a card starts nothing — opening is a tap", async () => {
    render(
      <ExperienceList
        experiences={[experience(1), experience(2)]}
        session={null}
        onOpen={onOpen}
      />,
    );
    expect(onOpen).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole("button")[1]!);
    // The exact experience picked, at the exact version discovery served.
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ experienceKey: "exp-2", experienceVersion: 1 }),
    );
  });
});

describe("experienceCardStatus — progress follows the GUIDE, not the version", () => {
  /**
   * CMS V1 (#637) records this deliberately, because it is the fact the
   * one-lineage-per-guide rule exists to protect.
   *
   * The status is read from the GuideSession matching the card's guide pin. Two
   * versions of one experience share that pin, so completion carries forward
   * across a republish — which is what we want, and why the CMS refuses to
   * create a SECOND experience key on the same pin: it would inherit the first
   * one's progress without anyone having opened it.
   */
  const pinned = (experienceVersion: number) => ({
    experienceKey: "eec",
    experienceVersion,
    title: `v${experienceVersion}`,
    guidePin: { guideKey: "guide-eec", guideVersion: 1 },
    scenes: [],
  });

  const completedSession = {
    sessionId: "s1",
    guideKey: "guide-eec",
    guideVersion: 1,
    status: "COMPLETED" as const,
    stepsCompleted: 3,
    totalSteps: 3,
    currentStepKey: null,
  };

  it("keeps a finished journey finished after a new version is published", () => {
    expect(
      experienceCardStatus(
        pinned(2) as unknown as Parameters<typeof experienceCardStatus>[0],
        completedSession,
      ),
    ).toBe("completed");
  });

  it("would report an unopened experience as finished if it shared the pin", () => {
    // Precisely the confusion CMS V1 prevents at creation time: nothing here
    // can tell these two apart, because the session only knows the guide.
    const otherKeySamePin = {
      ...pinned(1),
      experienceKey: "otra-experiencia",
    };

    expect(
      experienceCardStatus(
        otherKeySamePin as unknown as Parameters<
          typeof experienceCardStatus
        >[0],
        completedSession,
      ),
    ).toBe("completed");
  });
});
