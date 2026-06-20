import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

vi.mock("@psico/api-client", () => ({
  moodApi: { log: vi.fn() },
}));

import { moodApi } from "@psico/api-client";
import { MoodChip } from "./MoodChip";

const mockedMoodApi = vi.mocked(moodApi);

describe("MoodChip", () => {
  beforeEach(() => {
    mockedMoodApi.log.mockReset();
  });

  it("renders the empty state when initialMood is null", () => {
    render(<MoodChip initialMood={null} />);
    expect(screen.getByText("¿Cómo estás?")).toBeInTheDocument();
  });

  it("renders the active mood label when initialMood is set", () => {
    render(<MoodChip initialMood="calma" />);
    expect(screen.getByText(/Hoy: Calma/)).toBeInTheDocument();
  });

  it("opens the popover on click and lists every mood swatch", async () => {
    const user = userEvent.setup();
    render(<MoodChip initialMood={null} />);
    await user.click(screen.getByRole("button", { name: /Cómo estás/ }));
    expect(
      screen.getByRole("dialog", { name: /estado de ánimo/i }),
    ).toBeInTheDocument();
    // 7 swatch buttons inside the popover.
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(8);
  });

  it("logs the picked mood + closes the popover + fires onMoodChange", async () => {
    const user = userEvent.setup();
    mockedMoodApi.log.mockResolvedValueOnce({} as never);
    const onChange = vi.fn();
    render(<MoodChip initialMood={null} onMoodChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Cómo estás/ }));
    await user.click(screen.getByRole("button", { name: "Calma" }));

    await waitFor(() => {
      expect(mockedMoodApi.log).toHaveBeenCalledWith({ mood: "calma" });
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("calma");
    });
    expect(screen.getByText(/Hoy: Calma/)).toBeInTheDocument();
  });

  it("rolls back optimistic state when the API call fails", async () => {
    const user = userEvent.setup();
    mockedMoodApi.log.mockRejectedValueOnce(new Error("boom"));
    render(<MoodChip initialMood={null} />);

    await user.click(screen.getByRole("button", { name: /Cómo estás/ }));
    await user.click(screen.getByRole("button", { name: "Calma" }));

    await waitFor(() => {
      expect(screen.getByRole("alert", { name: undefined })).toHaveTextContent(
        /No se pudo guardar/,
      );
    });
    // The chip rolls back to the empty state.
    expect(screen.getByText("¿Cómo estás?")).toBeInTheDocument();
  });
});
