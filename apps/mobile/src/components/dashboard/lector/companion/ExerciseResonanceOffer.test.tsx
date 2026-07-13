import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { ExerciseResonanceOffer } from "./ExerciseResonanceOffer";

jest.mock("@psico/api-client", () => ({
  resonancesApi: {
    confirm: jest.fn(),
  },
}));

import { resonancesApi } from "@psico/api-client";

const mockedResonances = resonancesApi as jest.Mocked<typeof resonancesApi>;

const CONCEPT = {
  key: "eec-cuerpo-antes-que-mente",
  label: "El cuerpo sabe antes que la mente",
};

describe("ExerciseResonanceOffer (mobile)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the offer with the chapter concept label", () => {
    render(
      <ExerciseResonanceOffer
        concept={CONCEPT}
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
      />,
    );
    expect(screen.getByText(/El cuerpo sabe antes que la mente/)).toBeTruthy();
    expect(screen.getByText(/añadir a mi mapa/i)).toBeTruthy();
  });

  it("confirms as a resonance with source 'exercise' and shows the done state", async () => {
    mockedResonances.confirm.mockResolvedValue({} as never);
    render(
      <ExerciseResonanceOffer
        concept={CONCEPT}
        bookSlug="emociones-en-construccion"
        chapterOrder={2}
      />,
    );
    fireEvent.press(screen.getByText(/añadir a mi mapa/i));

    expect(mockedResonances.confirm).toHaveBeenCalledWith({
      conceptKey: CONCEPT.key,
      conceptLabel: CONCEPT.label,
      bookSlug: "emociones-en-construccion",
      chapterOrder: 2,
      source: "exercise",
    });
    await waitFor(() =>
      expect(screen.getByText(/Añadido a tu mapa/)).toBeTruthy(),
    );
  });

  it("surfaces an inline error when confirm fails", async () => {
    mockedResonances.confirm.mockRejectedValue(new Error("network"));
    render(
      <ExerciseResonanceOffer
        concept={CONCEPT}
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
      />,
    );
    fireEvent.press(screen.getByText(/añadir a mi mapa/i));
    await waitFor(() =>
      expect(screen.getByText(/No pudimos guardarlo/)).toBeTruthy(),
    );
  });
});
