import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/notifications", () => ({
  updateNotificationsAction: vi.fn(),
}));

import { NotificationsForm } from "./NotificationsForm";

/**
 * Un interruptor que avisa «antes de tu próxima sesión» ofrece la sesión.
 * La preferencia sigue en la cuenta —se recibe y no se toca—; lo que se retira
 * es la oferta.
 */
describe("NotificationsForm", () => {
  it("no ofrece recordatorios de terapia, y conserva los demás", () => {
    const { container } = render(
      <NotificationsForm
        initial={{
          dailyReminder: true,
          streakReminders: true,
          ecoReplies: true,
          weeklyReport: true,
          terapiaReminders: true,
          reminderTime: "20:00",
        }}
      />,
    );
    expect(container.textContent).not.toMatch(/terapia/i);
    for (const texto of [
      "Recordatorio diario",
      "Recordatorios de racha",
      "Respuestas de Eco",
      "Resumen semanal",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
