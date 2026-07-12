import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { EcoSuggestion } from "@psico/types";
import { EcoSuggestions } from "./EcoSuggestions";

// Mock the API client at the import path the component uses.
jest.mock("@psico/api-client", () => ({
  ecoApi: {
    getSuggestions: jest.fn(),
  },
}));

import { ecoApi } from "@psico/api-client";

const mockedEco = ecoApi as jest.Mocked<typeof ecoApi>;

const SUGGESTIONS: EcoSuggestion[] = [
  {
    id: "continue-chapter",
    title: "Sigue tu lectura",
    prompt: "Estoy leyendo…",
    reason: "Vas por “Cómo aprendiste a sentir”",
    scope: { bookSlug: "emociones-en-construccion", chapterOrder: 2 },
  },
  {
    id: "after-reflection",
    title: "Lleva tu reflexión más lejos",
    prompt: "Escribí una reflexión…",
    reason: "Escribiste una reflexión hace poco",
    scope: null,
  },
];

describe("EcoSuggestions (mobile)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders a chip per suggestion once fetched", async () => {
    mockedEco.getSuggestions.mockResolvedValue({ suggestions: SUGGESTIONS });
    render(<EcoSuggestions onPick={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("Sigue tu lectura")).toBeTruthy(),
    );
    expect(screen.getByText("Lleva tu reflexión más lejos")).toBeTruthy();
    expect(screen.getByText(/Escribiste una reflexión/)).toBeTruthy();
  });

  it("calls onPick with the full suggestion (scope included)", async () => {
    mockedEco.getSuggestions.mockResolvedValue({ suggestions: SUGGESTIONS });
    const onPick = jest.fn();
    render(<EcoSuggestions onPick={onPick} />);
    await waitFor(() =>
      expect(screen.getByText("Sigue tu lectura")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Sigue tu lectura"));
    expect(onPick).toHaveBeenCalledWith(SUGGESTIONS[0]);
  });

  it("renders nothing when there are no suggestions", async () => {
    mockedEco.getSuggestions.mockResolvedValue({ suggestions: [] });
    const { toJSON } = render(<EcoSuggestions onPick={jest.fn()} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it("hides silently on a fetch failure", async () => {
    mockedEco.getSuggestions.mockRejectedValue(new Error("network"));
    const { toJSON } = render(<EcoSuggestions onPick={jest.fn()} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });
});
