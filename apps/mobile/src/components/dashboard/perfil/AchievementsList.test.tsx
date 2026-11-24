import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import type { AchievementProgress } from "@psico/types";

import { AchievementsList } from "./AchievementsList";

function logro(over: Partial<AchievementProgress> = {}): AchievementProgress {
  return {
    id: "first-reflection",
    label: "Primera reflexión",
    description: "Escribe tu primera entrada en el diario.",
    icon: "pencil",
    progressCurrent: 0,
    progressTarget: 1,
    unlockedAt: null,
    ...over,
  };
}

/**
 * El estado de un logro, dicho con algo más que el color.
 */
describe("AchievementsList", () => {
  it("anuncia si está pendiente o conseguido", () => {
    render(
      <AchievementsList
        achievements={[
          logro({ id: "falta" }),
          logro({
            id: "hecho",
            description: "Escribiste tu primera entrada en el diario.",
            progressCurrent: 1,
            unlockedAt: new Date("2026-11-20T10:00:00Z"),
          }),
        ]}
      />,
    );
    expect(
      screen.getByLabelText(
        "Primera reflexión. Pendiente, 0 de 1. Escribe tu primera entrada en el diario.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Primera reflexión. Conseguido. Escribiste tu primera entrada en el diario.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("🔒")).toBeTruthy();
    expect(screen.getByText("🏆")).toBeTruthy();
  });

  it("no atenúa la tarjeta pendiente: su texto se tiene que leer igual", () => {
    render(<AchievementsList achievements={[logro({ id: "falta" })]} />);
    const estilo = StyleSheet.flatten(
      screen.getByTestId("achievement-falta").props.style,
    );
    expect(estilo.opacity ?? 1).toBe(1);
  });
});
