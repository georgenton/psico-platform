import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnboardingShell } from "./OnboardingShell";

describe("la bienvenida enlaza la ayuda", () => {
  it.each([0, 1, 4])("en el paso %i, sin tener que terminarla", (paso) => {
    render(
      <OnboardingShell currentStep={paso}>
        <p>contenido</p>
      </OnboardingShell>,
    );
    expect(
      screen.getByRole("link", { name: /líneas de ayuda/i }),
    ).toHaveAttribute("href", "/ayuda");
  });
});
