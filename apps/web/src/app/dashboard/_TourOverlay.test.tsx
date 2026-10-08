import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TourOverlay } from "./_TourOverlay";

// The REAL catalog the API serves, imported rather than retyped.
//
// `apps/api/src/onboarding/constants.ts` has no Nest imports — only types from
// `@psico/types` — so it loads cleanly here. This matters: a fixture invented
// in this file would keep passing while the copy it stands for drifts, and
// the whole point of these tests is that what the API says is what the reader
// sees. The content itself is owned by `onboarding.service.spec.ts`, which
// binds the recovery-phrase number to `SEED_PHRASE_WORD_COUNT`; what is
// checked HERE is that the client renders the catalog instead of a copy of
// its own.
import { TOUR_STEPS } from "../../../../api/src/onboarding/constants";

vi.mock("@psico/api-client", () => ({
  onboardingApi: {
    getTour: vi.fn(),
    completeTour: vi.fn(),
  },
}));

import { onboardingApi } from "@psico/api-client";

/** The catalog as it crosses the wire. */
const STEPS = JSON.parse(JSON.stringify(TOUR_STEPS)) as typeof TOUR_STEPS;

/** The first step that actually has a «Saber más» panel. */
const stepWithLearnMore = STEPS.find((s) => s.learnMore)!;
const indexWithLearnMore = STEPS.indexOf(stepWithLearnMore);

/** Walk forward with the real button until `title` is on screen. */
async function advanceTo(title: string) {
  for (let i = 0; i < STEPS.length; i += 1) {
    if (screen.queryByText(title)) return;
    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
  }
  throw new Error(`never reached the step titled «${title}»`);
}

describe("TourOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onboardingApi.completeTour).mockResolvedValue({ ok: true });
  });

  it("the fixture really is the API catalog, and it has something to show", () => {
    // Guards the guard: if the import ever resolves to an empty array, every
    // test below would pass vacuously.
    expect(STEPS.length).toBeGreaterThan(0);
    expect(stepWithLearnMore).toBeDefined();
    expect(stepWithLearnMore.learnMore!.points.length).toBeGreaterThan(0);
  });

  it("renders the first step after fetching the catalog", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
    render(<TourOverlay />);
    await waitFor(() => {
      expect(screen.getByText(STEPS[0]!.title)).toBeInTheDocument();
    });
    expect(
      screen.getByText(new RegExp(`Paso 1 de ${STEPS.length}`, "i")),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Siguiente/i }),
    ).toBeInTheDocument();
    // Not the last step → no Terminar button yet.
    expect(
      screen.queryByRole("button", { name: /Terminar/i }),
    ).not.toBeInTheDocument();
  });

  it("advances to the next step on Siguiente", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
    render(<TourOverlay />);
    await waitFor(() => screen.getByText(STEPS[0]!.title));

    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    expect(screen.getByText(STEPS[1]!.title)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Paso 2 de ${STEPS.length}`, "i")),
    ).toBeInTheDocument();
    // Now an Anterior button exists.
    expect(
      screen.getByRole("button", { name: /Anterior/i }),
    ).toBeInTheDocument();
  });

  it("walks the whole catalog forwards and backwards", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
    render(<TourOverlay />);
    await waitFor(() => screen.getByText(STEPS[0]!.title));

    // Every step the API serves is reachable, in order, with its own body.
    for (let i = 1; i < STEPS.length; i += 1) {
      await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
      expect(screen.getByText(STEPS[i]!.title)).toBeInTheDocument();
      expect(screen.getByText(STEPS[i]!.body)).toBeInTheDocument();
    }
    for (let i = STEPS.length - 2; i >= 0; i -= 1) {
      await userEvent.click(screen.getByRole("button", { name: /Anterior/i }));
      expect(screen.getByText(STEPS[i]!.title)).toBeInTheDocument();
    }
    // Back at the start, Anterior is gone again.
    expect(
      screen.queryByRole("button", { name: /Anterior/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a Terminar button on the last step that POSTs steps.length", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
    render(<TourOverlay />);
    await waitFor(() => screen.getByText(STEPS[0]!.title));
    for (let i = 1; i < STEPS.length; i += 1) {
      await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    }

    const terminar = screen.getByRole("button", { name: /Terminar/i });
    expect(terminar).toBeInTheDocument();
    await userEvent.click(terminar);

    await waitFor(() => {
      expect(onboardingApi.completeTour).toHaveBeenCalledWith({
        stepsCompleted: STEPS.length,
      });
    });
  });

  it("dismisses with stepsCompleted = current index when Saltar tour is pressed", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
    render(<TourOverlay />);
    await waitFor(() => screen.getByText(STEPS[0]!.title));
    // Advance one step so stepsCompleted reports 1, not 0.
    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    await userEvent.click(screen.getByRole("button", { name: /Saltar tour/i }));

    await waitFor(() => {
      expect(onboardingApi.completeTour).toHaveBeenCalledWith({
        stepsCompleted: 1,
      });
    });
    // Saltar and Terminar hit the same endpoint; the difference is the count.
    expect(onboardingApi.completeTour).toHaveBeenCalledTimes(1);
  });

  // ── «Saber más» ─────────────────────────────────────────────────────────
  //
  // This is the panel that carries the privacy and recovery claims — the ones
  // the veracity matrix was written about — and nothing exercised it.

  describe("«Saber más»", () => {
    const openPanel = async () => {
      vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
      render(<TourOverlay />);
      await waitFor(() => screen.getByText(STEPS[0]!.title));
      await advanceTo(stepWithLearnMore.title);
      await userEvent.click(screen.getByRole("button", { name: /Saber más/i }));
      return screen.getByRole("dialog", {
        name: stepWithLearnMore.learnMore!.title,
      });
    };

    it("only offers the button on steps that actually have a panel", async () => {
      vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
      render(<TourOverlay />);
      await waitFor(() => screen.getByText(STEPS[0]!.title));

      for (let i = 0; i < STEPS.length; i += 1) {
        if (i > 0) {
          await userEvent.click(
            screen.getByRole("button", { name: /Siguiente/i }),
          );
        }
        const offered = screen.queryByRole("button", { name: /Saber más/i });
        // Offered exactly when the catalog carries content for it: a button
        // that opens an empty panel is worse than no button.
        expect(Boolean(offered)).toBe(Boolean(STEPS[i]!.learnMore));
      }
    });

    it("muestra el contenido que sirve la API, no una copia del cliente", async () => {
      const panel = await openPanel();
      const lm = stepWithLearnMore.learnMore!;

      expect(panel).toHaveAttribute("aria-modal", "true");
      expect(within(panel).getByText(lm.title)).toBeInTheDocument();
      if (lm.analogy) {
        expect(within(panel).getByText(lm.analogy)).toBeInTheDocument();
      }
      // EVERY point, verbatim and in order. Not a count, not a substring:
      // a dropped bullet is how a privacy caveat disappears.
      const items = within(panel).getAllByRole("listitem");
      expect(items).toHaveLength(lm.points.length);
      items.forEach((li, i) => {
        expect(li).toHaveTextContent(lm.points[i]!);
      });
    });

    it("se cierra con Entendido, con el velo y con Escape, sin cerrar el tour", async () => {
      // Entendido
      await openPanel();
      await userEvent.click(screen.getByRole("button", { name: /Entendido/i }));
      expect(
        screen.queryByRole("dialog", {
          name: stepWithLearnMore.learnMore!.title,
        }),
      ).toBeNull();
      // The tour step is still there behind it, and nothing was reported as
      // finished: reading an explanation is not finishing the tour.
      expect(screen.getByText(stepWithLearnMore.title)).toBeInTheDocument();
      expect(onboardingApi.completeTour).not.toHaveBeenCalled();
    });

    it("el velo cierra sólo el panel", async () => {
      const panel = await openPanel();
      await userEvent.click(panel);
      expect(
        screen.queryByRole("dialog", {
          name: stepWithLearnMore.learnMore!.title,
        }),
      ).toBeNull();
      expect(screen.getByText(stepWithLearnMore.title)).toBeInTheDocument();
      expect(onboardingApi.completeTour).not.toHaveBeenCalled();
    });

    it("Escape cierra sólo el panel", async () => {
      await openPanel();
      await userEvent.keyboard("{Escape}");
      expect(
        screen.queryByRole("dialog", {
          name: stepWithLearnMore.learnMore!.title,
        }),
      ).toBeNull();
      expect(screen.getByText(stepWithLearnMore.title)).toBeInTheDocument();
      expect(onboardingApi.completeTour).not.toHaveBeenCalled();
    });

    it("al seguir navegando, el panel no se queda abierto encima del paso siguiente", async () => {
      await openPanel();
      await userEvent.click(screen.getByRole("button", { name: /Entendido/i }));
      // Move on, then come back: the panel must not reopen by itself.
      const onLast = indexWithLearnMore === STEPS.length - 1;
      await userEvent.click(
        screen.getByRole("button", {
          name: onLast ? /Anterior/i : /Siguiente/i,
        }),
      );
      expect(
        screen.queryByRole("dialog", {
          name: stepWithLearnMore.learnMore!.title,
        }),
      ).toBeNull();
    });
  });

  it("silently dismisses when the catalog is empty", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: [] });
    render(<TourOverlay />);
    // Nothing is rendered after the fetch resolves.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // We also did NOT POST to complete — empty catalog is a no-op,
    // not a "tour skipped" event.
    expect(onboardingApi.completeTour).not.toHaveBeenCalled();
  });
});
