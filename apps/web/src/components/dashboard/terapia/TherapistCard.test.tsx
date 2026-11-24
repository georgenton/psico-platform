import { render } from "@testing-library/react";
import type { TherapistSummary } from "@psico/types";
import { describe, expect, it } from "vitest";

import { ratingLabel } from "./rating";
import { TherapistCard } from "./TherapistCard";

const ficha = (over: Partial<TherapistSummary> = {}): TherapistSummary => ({
  id: "t",
  name: "Nombre",
  initials: "N",
  title: "Perfil de demostración",
  avatarUrl: null,
  coverToken: "warm",
  modalities: ["INDIVIDUAL"],
  specialties: [],
  priceUsd: 40,
  currency: "USD",
  avgRating: null,
  reviewsCount: null,
  isDemo: true,
  ...over,
});

describe("TherapistCard no pinta una puntuación que no existe", () => {
  it.each([
    ["sin dato", {}],
    ["con nota y sin recuento", { avgRating: 4.9 }],
    ["con cero reseñas", { avgRating: 0, reviewsCount: 0 }],
    ["con una API que no manda el campo", { avgRating: undefined as never }],
  ])("%s", (_caso, over) => {
    const { container } = render(
      <TherapistCard therapist={ficha(over)} href="/x" />,
    );
    expect(container.textContent).not.toContain("⭐");
    expect(container.textContent).toContain("Nombre");
  });

  it("con reseñas de verdad, sí (control contrario)", () => {
    const { container } = render(
      <TherapistCard
        therapist={ficha({ avgRating: 4.5, reviewsCount: 3, isDemo: false })}
        href="/x"
      />,
    );
    expect(container.textContent).toContain("⭐ 4.5 (3)");
  });
});

describe("ratingLabel", () => {
  it("calla sin reseñas y habla con ellas", () => {
    expect(ratingLabel({ avgRating: null, reviewsCount: null })).toBeNull();
    expect(ratingLabel({ avgRating: null, reviewsCount: 3 })).toBeNull();
    expect(ratingLabel({ avgRating: 5, reviewsCount: null })).toBeNull();
    expect(ratingLabel({ avgRating: 5, reviewsCount: 0 })).toBeNull();
    expect(ratingLabel({ avgRating: 5, reviewsCount: 1 })).toBe("5.0 (1)");
  });
});
