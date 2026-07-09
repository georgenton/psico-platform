import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

vi.mock("@psico/api-client", () => ({
  moodApi: { log: vi.fn(), nextCheckin: vi.fn(), logCheckin: vi.fn() },
}));

import { moodApi } from "@psico/api-client";
import { MoodChip } from "./MoodChip";

const mockedMoodApi = vi.mocked(moodApi);

describe("MoodChip — Sprint B6b (5 wellness levels)", () => {
  beforeEach(() => {
    mockedMoodApi.log.mockReset();
    mockedMoodApi.nextCheckin.mockReset();
    mockedMoodApi.logCheckin.mockReset();
    // Default: no pending question — the popover closes right after the pick.
    mockedMoodApi.nextCheckin.mockResolvedValue({ item: null });
  });

  it("renders the empty state when initialMood is null", () => {
    render(<MoodChip initialMood={null} />);
    expect(screen.getByText("¿Cómo estás?")).toBeInTheDocument();
  });

  it("renders the active mood label when initialMood is set", () => {
    render(<MoodChip initialMood="low" />);
    expect(
      screen.getByRole("button", { name: /Tu ánimo: Bajo. Cambiar/i }),
    ).toBeInTheDocument();
  });

  it("opens the popover on click and renders the 5 wellness faces", async () => {
    const user = userEvent.setup();
    render(<MoodChip initialMood={null} />);
    await user.click(screen.getByRole("button", { name: /Marcar tu ánimo/ }));
    expect(
      screen.getByRole("dialog", { name: /estado de ánimo/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Muy bien" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Bien" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Neutral" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Bajo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Difícil" })).toBeVisible();
  });

  it("logs the picked mood + closes the popover + fires onMoodChange", async () => {
    const user = userEvent.setup();
    mockedMoodApi.log.mockResolvedValueOnce({} as never);
    const onChange = vi.fn();
    render(<MoodChip initialMood={null} onMoodChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Marcar tu ánimo/ }));
    await user.click(screen.getByRole("button", { name: "Bien" }));

    await waitFor(() => {
      expect(mockedMoodApi.log).toHaveBeenCalledWith({ mood: "good" });
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("good");
    });
    expect(
      screen.getByRole("button", { name: /Tu ánimo: Bien/i }),
    ).toBeInTheDocument();
  });

  it("rolls back optimistic state when the API call fails", async () => {
    const user = userEvent.setup();
    mockedMoodApi.log.mockRejectedValueOnce(new Error("boom"));
    render(<MoodChip initialMood={null} />);

    await user.click(screen.getByRole("button", { name: /Marcar tu ánimo/ }));
    await user.click(screen.getByRole("button", { name: "Bien" }));

    await waitFor(() => {
      expect(screen.getByRole("alert", { name: undefined })).toHaveTextContent(
        /No se pudo guardar/,
      );
    });
    expect(screen.getByText("¿Cómo estás?")).toBeInTheDocument();
  });

  it("Etapa 2: shows the daily checkin question after the mood pick and posts the answer", async () => {
    const user = userEvent.setup();
    mockedMoodApi.log.mockResolvedValueOnce({} as never);
    mockedMoodApi.nextCheckin.mockResolvedValueOnce({
      item: {
        key: "compasion_amable",
        axis: "compasion",
        text: "¿Fuiste amable contigo cuando algo salió mal?",
      },
    } as never);
    mockedMoodApi.logCheckin.mockResolvedValueOnce({} as never);
    render(<MoodChip initialMood={null} />);

    await user.click(screen.getByRole("button", { name: /Marcar tu ánimo/ }));
    await user.click(screen.getByRole("button", { name: "Bien" }));

    // The popover switches to the question instead of closing.
    await waitFor(() => {
      expect(
        screen.getByText("¿Fuiste amable contigo cuando algo salió mal?"),
      ).toBeInTheDocument();
    });

    // Answer on the 0-4 scale ("Bastante" = 3).
    await user.click(screen.getByRole("button", { name: "Bastante" }));
    await waitFor(() => {
      expect(mockedMoodApi.logCheckin).toHaveBeenCalledWith({
        itemKey: "compasion_amable",
        score: 3,
      });
    });
    expect(screen.getByText(/Gracias/)).toBeInTheDocument();
  });

  it("Etapa 2: 'Omitir por hoy' closes the question without posting", async () => {
    const user = userEvent.setup();
    mockedMoodApi.log.mockResolvedValueOnce({} as never);
    mockedMoodApi.nextCheckin.mockResolvedValueOnce({
      item: {
        key: "claridad_nombrar",
        axis: "claridad",
        text: "¿Pudiste ponerle nombre a lo que sentiste hoy?",
      },
    } as never);
    render(<MoodChip initialMood={null} />);

    await user.click(screen.getByRole("button", { name: /Marcar tu ánimo/ }));
    await user.click(screen.getByRole("button", { name: "Bien" }));
    await waitFor(() => {
      expect(
        screen.getByText("¿Pudiste ponerle nombre a lo que sentiste hoy?"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Omitir por hoy" }));
    expect(mockedMoodApi.logCheckin).not.toHaveBeenCalled();
  });
});
