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

/**
 * The panels these tests must cover, named by `target`.
 *
 * By target and not by index: the order of the tour is editorial and has
 * already changed once (Patrones was appended as a fifth step). An index would
 * silently start checking a different panel the next time somebody reorders
 * the catalog, which is exactly when you want the check to still be pointing
 * at the right one. `biblioteca` carries the audio claim and `diario` the
 * privacy and recovery claims — the two the veracity matrix was written about.
 */
const COVERED_TARGETS = ["biblioteca", "diario"] as const;

const stepFor = (target: string) => {
  const step = STEPS.find((s) => s.target === target);
  if (!step) throw new Error(`no tour step targets «${target}»`);
  if (!step.learnMore) throw new Error(`step «${target}» has no learnMore`);
  return step;
};

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
    for (const target of COVERED_TARGETS) {
      // Throws with a clear message if the step or its panel disappeared,
      // rather than letting the suite go quietly green on nothing.
      expect(stepFor(target).learnMore!.points.length).toBeGreaterThan(0);
    }
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
  // These panels carry the claims the veracity matrix was written about —
  // the audio condition on Biblioteca, privacy and recovery on Reflexiones —
  // and the first version of this suite only ever opened the first one it
  // found. Both are covered now, parameterised over the same body rather than
  // duplicated, and selected by `target` so reordering the tour cannot quietly
  // point these checks at a different panel.

  describe.each(COVERED_TARGETS)("«Saber más» · %s", (target) => {
    const step = stepFor(target);
    const lm = step.learnMore!;
    const panelOf = () => screen.getByRole("dialog", { name: lm.title });
    const panelGone = () =>
      expect(screen.queryByRole("dialog", { name: lm.title })).toBeNull();

    const openPanel = async () => {
      vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
      render(<TourOverlay />);
      await waitFor(() => screen.getByText(STEPS[0]!.title));
      await advanceTo(step.title);
      await userEvent.click(screen.getByRole("button", { name: /Saber más/i }));
      return panelOf();
    };

    it("muestra el contenido que sirve la API, no una copia del cliente", async () => {
      const panel = await openPanel();

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

    it("se cierra con Entendido y el tour sigue abierto, sin completarse", async () => {
      await openPanel();
      await userEvent.click(screen.getByRole("button", { name: /Entendido/i }));
      panelGone();
      // The tour step is still there behind it, and nothing was reported as
      // finished: reading an explanation is not finishing the tour.
      expect(screen.getByText(step.title)).toBeInTheDocument();
      expect(onboardingApi.completeTour).not.toHaveBeenCalled();
    });

    it("el velo cierra sólo el panel", async () => {
      const panel = await openPanel();
      await userEvent.click(panel);
      panelGone();
      expect(screen.getByText(step.title)).toBeInTheDocument();
      expect(onboardingApi.completeTour).not.toHaveBeenCalled();
    });

    it("Escape cierra sólo el panel", async () => {
      await openPanel();
      await userEvent.keyboard("{Escape}");
      panelGone();
      expect(screen.getByText(step.title)).toBeInTheDocument();
      expect(onboardingApi.completeTour).not.toHaveBeenCalled();
    });

    it("al seguir navegando, el panel no se queda abierto encima del paso siguiente", async () => {
      await openPanel();
      await userEvent.click(screen.getByRole("button", { name: /Entendido/i }));
      // Move on, then come back: the panel must not reopen by itself.
      const onLast = STEPS.indexOf(step) === STEPS.length - 1;
      await userEvent.click(
        screen.getByRole("button", {
          name: onLast ? /Anterior/i : /Siguiente/i,
        }),
      );
      panelGone();
    });
  });

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

  // ── the corrected claims, read off the rendered panel ────────────────────
  //
  // The API spec binds these to their sources (the word count to
  // `SEED_PHRASE_WORD_COUNT`, the audio wording to its conditions). What is
  // asserted here is the other half: that the corrected sentences actually
  // reach the eye through the real client, rather than living in a constant
  // nobody renders.

  describe("lo que el lector acaba leyendo", () => {
    const openPanelFor = async (target: string) => {
      const step = stepFor(target);
      vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
      render(<TourOverlay />);
      await waitFor(() => screen.getByText(STEPS[0]!.title));
      await advanceTo(step.title);
      await userEvent.click(screen.getByRole("button", { name: /Saber más/i }));
      return screen.getByRole("dialog", { name: step.learnMore!.title });
    };

    it("Reflexiones: 12 palabras, no 24", async () => {
      const panel = await openPanelFor("diario");
      expect(panel).toHaveTextContent(/frase de 12 palabras/i);
      expect(panel).not.toHaveTextContent(/24 palabras/i);
    });

    it("Reflexiones: se puede volver a consultar en Ajustes → Seguridad", async () => {
      const panel = await openPanelFor("diario");
      expect(panel).toHaveTextContent(/Ajustes → Seguridad/);
    });

    it("Reflexiones: la pérdida exige las tres cosas, sesión incluida", async () => {
      const panel = await openPanelFor("diario");
      // An unlocked session is a third way out, and the one somebody in
      // trouble is most likely to still have open. The earlier absolute named
      // only two and contradicted the bullet above it.
      expect(panel).toHaveTextContent(/sesión que las conserve desbloqueadas/i);
      expect(panel).not.toHaveTextContent(
        /si pierdes la contraseña y la frase, el contenido cifrado no se puede recuperar/i,
      );
    });

    it("Reflexiones: restablecer la contraseña no descifra por sí solo", async () => {
      const panel = await openPanelFor("diario");
      expect(panel).toHaveTextContent(/no descifra por sí solo/i);
    });

    it("Reflexiones: pide no compartir la frase", async () => {
      const panel = await openPanelFor("diario");
      expect(panel).toHaveTextContent(/no la compartas/i);
    });

    it("Biblioteca: el audio se describe por condiciones, no por catálogo", async () => {
      const panel = await openPanelFor("biblioteca");
      expect(panel).toHaveTextContent(/audio requiere Pro/i);
      expect(panel).toHaveTextContent(/pista publicada/i);
      // Asserting an inventory nobody measured.
      expect(panel).not.toHaveTextContent(/algunos capítulos tienen audio/i);
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
