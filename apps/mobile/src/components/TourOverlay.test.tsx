import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { TourOverlay } from "./TourOverlay";

// Mock the API client at the import path the component uses.
jest.mock("@psico/api-client", () => ({
  onboardingApi: {
    getTour: jest.fn(),
    completeTour: jest.fn(),
  },
}));

import { onboardingApi } from "@psico/api-client";

const STEPS = [
  { order: 1, target: "inicio", title: "Tu Inicio", body: "Aquí encuentras…" },
  { order: 2, target: "diario", title: "Tu Diario", body: "Cifrado E2E…" },
  { order: 3, target: "eco", title: "Eco", body: "Tu compañero…" },
];

const mockedOnboarding = onboardingApi as jest.Mocked<typeof onboardingApi>;

describe("TourOverlay (mobile)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedOnboarding.completeTour.mockResolvedValue({ ok: true } as never);
  });

  it("renders the first step after fetching the catalog", async () => {
    mockedOnboarding.getTour.mockResolvedValue({ steps: STEPS } as never);
    render(<TourOverlay onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Tu Inicio")).toBeOnTheScreen();
    });
    expect(screen.getByText(/PASO 1 DE 3/i)).toBeOnTheScreen();
    expect(screen.getByText(/Siguiente/i)).toBeOnTheScreen();
    // Not the last step → no Terminar button yet.
    expect(screen.queryByText(/Terminar/i)).toBeNull();
  });

  it("advances to the next step on Siguiente", async () => {
    mockedOnboarding.getTour.mockResolvedValue({ steps: STEPS } as never);
    render(<TourOverlay onClose={jest.fn()} />);
    await waitFor(() => screen.getByText("Tu Inicio"));

    fireEvent.press(screen.getByText("Siguiente"));

    expect(screen.getByText("Tu Diario")).toBeOnTheScreen();
    expect(screen.getByText(/PASO 2 DE 3/i)).toBeOnTheScreen();
    expect(screen.getByText("Anterior")).toBeOnTheScreen();
  });

  it("renders Terminar on the last step that POSTs steps.length", async () => {
    mockedOnboarding.getTour.mockResolvedValue({ steps: STEPS } as never);
    const onClose = jest.fn();
    render(<TourOverlay onClose={onClose} />);
    await waitFor(() => screen.getByText("Tu Inicio"));
    fireEvent.press(screen.getByText("Siguiente"));
    fireEvent.press(screen.getByText("Siguiente"));

    fireEvent.press(screen.getByText("Terminar"));

    await waitFor(() => {
      expect(mockedOnboarding.completeTour).toHaveBeenCalledWith({
        stepsCompleted: 3,
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses with stepsCompleted = current index when Saltar tour is pressed", async () => {
    mockedOnboarding.getTour.mockResolvedValue({ steps: STEPS } as never);
    const onClose = jest.fn();
    render(<TourOverlay onClose={onClose} />);
    await waitFor(() => screen.getByText("Tu Inicio"));
    // Advance one step so stepsCompleted reports 1, not 0.
    fireEvent.press(screen.getByText("Siguiente"));

    fireEvent.press(screen.getByText("Saltar tour"));

    await waitFor(() => {
      expect(mockedOnboarding.completeTour).toHaveBeenCalledWith({
        stepsCompleted: 1,
      });
    });
  });

  it("calls onClose silently when the catalog is empty", async () => {
    mockedOnboarding.getTour.mockResolvedValue({ steps: [] } as never);
    const onClose = jest.fn();
    render(<TourOverlay onClose={onClose} />);

    // The component should call onClose internally via finish(0) — wait
    // for the side effect.
    await waitFor(() => {
      expect(mockedOnboarding.completeTour).toHaveBeenCalledWith({
        stepsCompleted: 0,
      });
    });
    expect(onClose).toHaveBeenCalled();
    // The dialog dialog never rendered.
    expect(screen.queryByText(/PASO/i)).toBeNull();
  });
});
