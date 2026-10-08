import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecommendationCard } from "./RecommendationCard";
import {
  accessCopy,
  resolveBookAccess,
  type IncomingRecommendation,
} from "@/lib/onboarding/book-access";

/**
 * What the first screen tells someone a book costs.
 *
 * The field this reads is required in the API contract and present in every
 * response this repository's API produces, so TypeScript considers a binary
 * `=== "pro"` exhaustive and the original version used one. These tests exist
 * because the values the WEB can receive are a wider set than the values the
 * API promises: the promotion plan deploys the API before the Web, so a Web
 * newer than its API is a state we pass through deliberately, and a body with
 * no `tierRequired` at all is what that looks like.
 */

const completeOnboarding = vi.hoisted(() => vi.fn());
vi.mock("@/actions/onboarding", () => ({ completeOnboarding }));

const BOOK: IncomingRecommendation = {
  bookId: "b1",
  title: "Emociones en Construcción",
  author: "Marina Quintana",
  cover: "cool",
  chapter1Preview: "Un primer párrafo.",
  why: "Porque nombraste la ansiedad.",
  tierRequired: "free",
};

/** A second book, so switching can be exercised. */
const ALT: IncomingRecommendation = {
  ...BOOK,
  bookId: "b2",
  title: "Familias Ensambladas",
  tierRequired: "pro",
};

/** A body that never carried `tierRequired` at all — an older API's shape. */
const withoutTier = (b: IncomingRecommendation): IncomingRecommendation => {
  const copy: Record<string, unknown> = { ...b };
  delete copy.tierRequired;
  return copy as IncomingRecommendation;
};

const badge = () => screen.getByText(/Incluido en|Acceso por confirmar/);
const cta = () =>
  screen.getByRole("button", {
    name: /Empezar a leer|Continuar con este libro/,
  });

beforeEach(() => {
  completeOnboarding.mockReset();
  completeOnboarding.mockResolvedValue(undefined);
});

describe("resolveBookAccess · la frontera de datos", () => {
  it("reconoce los dos valores que el contrato promete", () => {
    expect(resolveBookAccess("free")).toBe("free");
    expect(resolveBookAccess("pro")).toBe("pro");
  });

  it("todo lo demás es «desconocido», no «gratis»", () => {
    // Each of these used to render «Incluido en tu plan».
    for (const raw of [
      undefined,
      null,
      "",
      "FREE",
      "Pro",
      "b2b",
      "enterprise",
      0,
      1,
      false,
      true,
      {},
      [],
      ["free"],
      { tier: "free" },
    ]) {
      expect(resolveBookAccess(raw)).toBe("unknown");
    }
  });

  it("el estado desconocido no promete acceso ni en la insignia ni en el botón", () => {
    const c = accessCopy("unknown", "Un libro");
    expect(c.badge).toBe("Acceso por confirmar");
    expect(c.cta).toBe("Continuar con este libro");
    // No title interpolation either: the neutral CTA is not "start reading X".
    expect(c.cta).not.toContain("Un libro");
    expect(c.badge).not.toMatch(/incluido/i);
  });
});

describe("RecommendationCard · lo que se dice del acceso", () => {
  it("free: dice que está incluido en el plan y ofrece empezar a leer", () => {
    render(<RecommendationCard primary={BOOK} alternatives={[]} />);
    expect(badge()).toHaveTextContent("Incluido en tu plan");
    expect(badge()).toHaveAttribute("data-access", "free");
    expect(cta()).toHaveTextContent(`Empezar a leer "${BOOK.title}"`);
  });

  it("pro: lo dice antes del botón, no después", () => {
    render(
      <RecommendationCard
        primary={{ ...BOOK, tierRequired: "pro" }}
        alternatives={[]}
      />,
    );
    expect(badge()).toHaveTextContent("Incluido en Pro");
    expect(badge()).toHaveAttribute("data-access", "pro");
  });

  // ── the three the API never sends, and the web can still receive ─────────
  const unknowns: Array<[string, Partial<IncomingRecommendation>]> = [
    ["ausente (API anterior al campo)", {}],
    ["null", { tierRequired: null }],
    ["un valor que este cliente no conoce", { tierRequired: "b2b" }],
  ];

  for (const [name, patch] of unknowns) {
    it(`${name}: no afirma acceso, y el botón se vuelve neutro`, () => {
      render(
        <RecommendationCard
          primary={{ ...withoutTier(BOOK), ...patch } as IncomingRecommendation}
          alternatives={[]}
        />,
      );
      expect(badge()).toHaveTextContent("Acceso por confirmar");
      expect(badge()).toHaveAttribute("data-access", "unknown");
      expect(cta()).toHaveTextContent("Continuar con este libro");
      expect(screen.queryByText(/Incluido en/)).toBeNull();
    });
  }

  it("una respuesta con la forma de la API ANTERIOR no promete nada", () => {
    // Literally the body the deployed API returned before this change: no
    // `tierRequired`, and `author` fixed to the one hard-coded name.
    const legacyBody = JSON.parse(
      JSON.stringify({
        recommendation: {
          bookId: "b1",
          title: "Emociones en Construcción",
          author: "Marina Quintana",
          cover: "cool",
          chapter1Preview: "Un primer párrafo.",
          why: "Porque nombraste la ansiedad.",
        },
        alternatives: [],
      }),
    );
    render(
      <RecommendationCard
        primary={legacyBody.recommendation}
        alternatives={legacyBody.alternatives}
      />,
    );
    expect(badge()).toHaveTextContent("Acceso por confirmar");
    expect(cta()).toHaveTextContent("Continuar con este libro");
  });

  it("al cambiar de alternativa, insignia y botón se recalculan juntos", async () => {
    const user = userEvent.setup();
    // A third book, distinct id and title, whose `tierRequired` never arrived.
    const noTier = {
      ...withoutTier(BOOK),
      bookId: "b3",
      title: "Un tercero",
    } as IncomingRecommendation;

    render(<RecommendationCard primary={BOOK} alternatives={[ALT, noTier]} />);

    expect(badge()).toHaveTextContent("Incluido en tu plan");

    await user.click(screen.getByRole("button", { name: ALT.title }));
    expect(badge()).toHaveTextContent("Incluido en Pro");
    expect(badge()).toHaveAttribute("data-access", "pro");
    expect(cta()).toHaveTextContent(`Empezar a leer "${ALT.title}"`);

    // On to the one with no field at all: the state has to follow the book the
    // reader is actually looking at, not the one they landed on. This is the
    // case the binary version got wrong even when the primary was fine.
    await user.click(screen.getByRole("button", { name: noTier.title }));
    expect(badge()).toHaveTextContent("Acceso por confirmar");
    expect(badge()).toHaveAttribute("data-access", "unknown");
    expect(cta()).toHaveTextContent("Continuar con este libro");

    // …and back, to show it is recomputed rather than latched.
    await user.click(screen.getByRole("button", { name: BOOK.title }));
    expect(badge()).toHaveTextContent("Incluido en tu plan");
  });

  it("el destino del botón no cambia con el estado de acceso", async () => {
    const user = userEvent.setup();

    render(
      <RecommendationCard primary={withoutTier(BOOK)} alternatives={[]} />,
    );
    await user.click(cta());
    // Same server action, same book id: the neutral wording describes what we
    // can promise, it does not route the reader somewhere else.
    expect(completeOnboarding).toHaveBeenCalledWith({ chosenBookId: "b1" });
  });
});
