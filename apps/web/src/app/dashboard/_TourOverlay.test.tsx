import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TourOverlay } from "./_TourOverlay";

vi.mock("@psico/api-client", () => ({
  onboardingApi: {
    getTour: vi.fn(),
    completeTour: vi.fn(),
  },
}));

import { onboardingApi } from "@psico/api-client";

const STEPS = [
  { order: 1, target: "inicio", title: "Tu Inicio", body: "Aquí encuentras…" },
  { order: 2, target: "diario", title: "Tu Diario", body: "Cifrado E2E…" },
  { order: 3, target: "eco", title: "Eco", body: "Tu compañero…" },
];

describe("TourOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onboardingApi.completeTour).mockResolvedValue({ ok: true });
  });

  it("renders the first step after fetching the catalog", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
    render(<TourOverlay />);
    await waitFor(() => {
      expect(screen.getByText("Tu Inicio")).toBeInTheDocument();
    });
    expect(screen.getByText(/Paso 1 de 3/i)).toBeInTheDocument();
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
    await waitFor(() => screen.getByText("Tu Inicio"));

    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    expect(screen.getByText("Tu Diario")).toBeInTheDocument();
    expect(screen.getByText(/Paso 2 de 3/i)).toBeInTheDocument();
    // Now an Anterior button exists.
    expect(
      screen.getByRole("button", { name: /Anterior/i }),
    ).toBeInTheDocument();
  });

  it("renders a Terminar button on the last step that POSTs steps.length", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
    render(<TourOverlay />);
    await waitFor(() => screen.getByText("Tu Inicio"));
    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    const terminar = screen.getByRole("button", { name: /Terminar/i });
    expect(terminar).toBeInTheDocument();
    await userEvent.click(terminar);

    await waitFor(() => {
      expect(onboardingApi.completeTour).toHaveBeenCalledWith({
        stepsCompleted: 3,
      });
    });
  });

  it("dismisses with stepsCompleted = current index when Saltar tour is pressed", async () => {
    vi.mocked(onboardingApi.getTour).mockResolvedValue({ steps: STEPS });
    render(<TourOverlay />);
    await waitFor(() => screen.getByText("Tu Inicio"));
    // Advance one step so stepsCompleted reports 1, not 0.
    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    await userEvent.click(screen.getByRole("button", { name: /Saltar tour/i }));

    await waitFor(() => {
      expect(onboardingApi.completeTour).toHaveBeenCalledWith({
        stepsCompleted: 1,
      });
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
