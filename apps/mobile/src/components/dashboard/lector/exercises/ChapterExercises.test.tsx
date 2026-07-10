import { fireEvent, render, screen } from "@testing-library/react-native";
import { ChapterExercises } from "./ChapterExercises";

/**
 * Tests for the interactive chapter activities section (mobile).
 *
 * Asserts: curated exercises render, unknown chapters render nothing, and the
 * CTA routes reflect → onReflect(prompt) and breathe → onBreathe(exercise).
 */
const noop = () => undefined;

describe("ChapterExercises (mobile)", () => {
  it("renders nothing for a chapter with no curated exercises", () => {
    const { toJSON } = render(
      <ChapterExercises
        bookSlug="emociones-en-construccion"
        chapterOrder={99}
        onReflect={noop}
        onBreathe={noop}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders the curated exercises for a known chapter", () => {
    render(
      <ChapterExercises
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        onReflect={noop}
        onBreathe={noop}
      />,
    );
    expect(screen.getByText("Actividades de este capítulo")).toBeOnTheScreen();
    expect(screen.getByText("Respira antes de seguir")).toBeOnTheScreen();
    expect(
      screen.getByText("El cuerpo antes que la palabra"),
    ).toBeOnTheScreen();
  });

  it("fires onBreathe with the exercise when 'Empezar' is tapped", () => {
    const onBreathe = jest.fn();
    render(
      <ChapterExercises
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        onReflect={noop}
        onBreathe={onBreathe}
      />,
    );
    fireEvent.press(screen.getByText(/Empezar/));
    expect(onBreathe).toHaveBeenCalledTimes(1);
    expect(onBreathe.mock.calls[0][0]).toMatchObject({ kind: "breathe" });
  });

  it("fires onReflect with the prompt when 'Escribir mi respuesta' is tapped", () => {
    const onReflect = jest.fn();
    render(
      <ChapterExercises
        bookSlug="emociones-en-construccion"
        chapterOrder={2}
        onReflect={onReflect}
        onBreathe={noop}
      />,
    );
    fireEvent.press(screen.getByText(/Escribir mi respuesta/));
    expect(onReflect).toHaveBeenCalledTimes(1);
    expect(typeof onReflect.mock.calls[0][0]).toBe("string");
  });
});
