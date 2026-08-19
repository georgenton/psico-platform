import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ChapterExperiencePublicView,
  GuideExperienceCardState,
} from "@psico/types";
import {
  ExperienceList,
  experienceCardStatus,
  experiencePinKey,
  type ExperienceCardStates,
} from "./ExperienceList";

/**
 * GR-7 / C.1 — Chapter Home, by cardinality and by state.
 *
 * Three cardinality cases, and the interesting one is zero: a chapter with no
 * journey shows no section, no placeholder and no disabled card. "No hay
 * experiencias" is a worse answer than saying nothing, because it turns a
 * complete chapter into an apology.
 *
 * The status assertions changed shape with C.1 and that is the point of #639.
 * Before, one chapter-wide session was handed to every card and each card
 * compared it against its own pin — so two experiences shared a verdict, and
 * finishing one made the other read «Completada». Now the server answers per
 * card and this component only translates. A card whose state is missing reads
 * «Empezar», which is what an unopened journey looks like anyway.
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

/** A server verdict for one card, in the shape the batch returns. */
function state(
  pin: { guideKey: string; guideVersion: number },
  status: GuideExperienceCardState["status"],
  over: Partial<GuideExperienceCardState> = {},
): GuideExperienceCardState {
  const session =
    status === "START"
      ? null
      : {
          sessionId: `ses_${pin.guideKey}`,
          guideKey: pin.guideKey,
          guideVersion: pin.guideVersion,
          status:
            status === "COMPLETED"
              ? ("COMPLETED" as const)
              : ("ACTIVE" as const),
          stepsCompleted: status === "COMPLETED" ? 3 : 1,
          totalSteps: 3,
          currentStepKey: status === "COMPLETED" ? null : "paso",
        };
  return { guidePin: pin, status, session, resumePin: pin, ...over };
}

const states = (...entries: GuideExperienceCardState[]): ExperienceCardStates =>
  new Map(entries.map((s) => [experiencePinKey(s.guidePin), s]));

const NONE: ExperienceCardStates = new Map();

const onOpen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("Chapter Home · cardinality", () => {
  it("0 experiences — the section does not exist", () => {
    render(<ExperienceList experiences={[]} states={NONE} onOpen={onOpen} />);

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
        states={NONE}
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
        states={NONE}
        onOpen={onOpen}
      />,
    );

    const titles = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("p")?.textContent);
    expect(titles).toEqual(["Experiencia 1", "Experiencia 2", "Experiencia 3"]);
  });

  it("the order does not change with the states", () => {
    // A verdict must never reorder the catalog: the server published this
    // sequence and a reader's progress is not an editorial decision.
    render(
      <ExperienceList
        experiences={[experience(1), experience(2), experience(3)]}
        states={states(
          state({ guideKey: "guide-3", guideVersion: 1 }, "COMPLETED"),
          state({ guideKey: "guide-2", guideVersion: 1 }, "CONTINUE"),
        )}
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
    render(<ExperienceList experiences={many} states={NONE} onOpen={onOpen} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("Experiencia 10")).toBeInTheDocument();
    expect(screen.queryByText(/ver más/i)).toBeNull();
  });

  it("the list has an accessible heading and each card one clear action", () => {
    render(
      <ExperienceList
        experiences={[experience(1), experience(2)]}
        states={NONE}
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

describe("Chapter Home · each card carries its OWN state (#639)", () => {
  it("A completed and B untouched read differently, side by side", () => {
    // The defect, stated as a test: one chapter, two journeys, one finished.
    render(
      <ExperienceList
        experiences={[experience(1), experience(2)]}
        states={states(
          state({ guideKey: "guide-1", guideVersion: 1 }, "COMPLETED"),
          state({ guideKey: "guide-2", guideVersion: 1 }, "START"),
        )}
        onOpen={onOpen}
      />,
    );

    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]!).getByText(/Completada/)).toBeInTheDocument();
    expect(
      within(cards[0]!).getByRole("button", { name: /Ver resumen/ }),
    ).toBeInTheDocument();

    expect(within(cards[1]!).queryByText(/Completada/)).toBeNull();
    expect(
      within(cards[1]!).getByRole("button", { name: /Empezar/ }),
    ).toBeInTheDocument();
  });

  it("an ACTIVE run in B never colours A", () => {
    render(
      <ExperienceList
        experiences={[experience(1), experience(2)]}
        states={states(
          state({ guideKey: "guide-1", guideVersion: 1 }, "START"),
          state({ guideKey: "guide-2", guideVersion: 1 }, "CONTINUE"),
        )}
        onOpen={onOpen}
      />,
    );

    const cards = screen.getAllByRole("listitem");
    expect(
      within(cards[0]!).getByRole("button", { name: /Empezar/ }),
    ).toBeInTheDocument();
    expect(within(cards[0]!).queryByText(/En curso/)).toBeNull();
    expect(within(cards[1]!).getByText(/En curso/)).toBeInTheDocument();
  });

  it("an OLD active version still reads Continuar on the new card", () => {
    // The reader left `guide-1@1` running and the catalog published `@2`.
    // The server answers CONTINUE for the published pin and hands back the
    // session's own pin — the card must not read «Empezar» and strand the run.
    const published = { guideKey: "guide-1", guideVersion: 2 };
    const older: GuideExperienceCardState = {
      guidePin: published,
      status: "CONTINUE",
      session: {
        sessionId: "ses_old",
        guideKey: "guide-1",
        guideVersion: 1,
        status: "ACTIVE",
        stepsCompleted: 2,
        totalSteps: 3,
        currentStepKey: "paso-2",
      },
      resumePin: { guideKey: "guide-1", guideVersion: 1 },
    };

    render(
      <ExperienceList
        experiences={[experience(1, { guidePin: published })]}
        states={states(older)}
        onOpen={onOpen}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Continuar/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/En curso/)).toBeInTheDocument();
  });

  it("a card with no answer reads Empezar, never a guess", () => {
    // The batch failed, or the server said nothing about this pin.
    render(
      <ExperienceList
        experiences={[experience(1)]}
        states={NONE}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByRole("button", { name: /Empezar/ })).toBeInTheDocument();
    expect(screen.queryByText(/En curso/)).toBeNull();
    expect(screen.queryByText(/Completada/)).toBeNull();
  });

  it("rendering a card starts nothing — opening is a tap", async () => {
    render(
      <ExperienceList
        experiences={[experience(1), experience(2)]}
        states={NONE}
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

  it("leaks no session id and no raw server text", () => {
    const { container } = render(
      <ExperienceList
        experiences={[experience(1)]}
        states={states(
          state({ guideKey: "guide-1", guideVersion: 1 }, "CONTINUE"),
        )}
        onOpen={onOpen}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toContain("ses_guide-1");
    expect(html).not.toContain("guideKey");
    expect(html).not.toMatch(/GUIDE_[A-Z_]+/);
  });
});

describe("experienceCardStatus — the server decides, this only translates", () => {
  const pin = { guideKey: "guide-eec", guideVersion: 1 };

  it("maps the three server words to the three reader words", () => {
    expect(
      experienceCardStatus(
        experience(1, { guidePin: pin }),
        states(state(pin, "START")),
      ),
    ).toBe("start");
    expect(
      experienceCardStatus(
        experience(1, { guidePin: pin }),
        states(state(pin, "CONTINUE")),
      ),
    ).toBe("continue");
    expect(
      experienceCardStatus(
        experience(1, { guidePin: pin }),
        states(state(pin, "COMPLETED")),
      ),
    ).toBe("completed");
  });

  it("a state for ANOTHER pin does not answer for this card", () => {
    expect(
      experienceCardStatus(
        experience(1, { guidePin: pin }),
        states(state({ guideKey: "otra", guideVersion: 1 }, "COMPLETED")),
      ),
    ).toBe("start");
  });

  it("two experiences on the SAME binding share their state, honestly", () => {
    /**
     * CMS V1 (#637) records this deliberately. Two experience keys pinned to
     * one guide are one lineage, and C.1 does not pretend otherwise: they read
     * the same because they ARE the same run. Inventing independence here
     * would hide a catalog mistake that C.3/C.4 must prevent at creation time.
     */
    const shared = states(state(pin, "COMPLETED"));
    const a = experience(1, { experienceKey: "eec", guidePin: pin });
    const b = experience(2, { experienceKey: "otra", guidePin: pin });

    expect(experienceCardStatus(a, shared)).toBe("completed");
    expect(experienceCardStatus(b, shared)).toBe("completed");
  });
});
