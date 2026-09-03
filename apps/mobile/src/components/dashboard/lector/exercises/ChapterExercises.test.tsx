import { render, screen, fireEvent } from "@testing-library/react-native";
import { chapterExercises, type MythsLensExercise } from "@psico/types";
import { ChapterExercises } from "./ChapterExercises";

/**
 * The chapter's activities on mobile, including the book's own.
 *
 * `myths_lens` renders as the functional fallback: the five steps in full, so
 * the activity is doable on a phone, plus the same explicit route into the
 * encrypted diary. What is asserted here is that the fallback is complete —
 * a partial version would be worse than the text.
 */

const EXERCISE = chapterExercises("emociones-en-construccion", 1).find(
  (e): e is MythsLensExercise => e.kind === "myths_lens",
)!;

describe("ChapterExercises · mobile", () => {
  const props = {
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    onReflect: jest.fn(),
    onBreathe: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists the chapter's activities, the book's own included", () => {
    render(<ChapterExercises {...props} />);
    expect(screen.getByText(EXERCISE.title)).toBeTruthy();
    expect(screen.getByText("Ver los pasos →")).toBeTruthy();
  });

  it("keeps the steps hidden until the reader asks", () => {
    render(<ChapterExercises {...props} />);
    expect(screen.queryByTestId(`myths-steps-${EXERCISE.id}`)).toBeNull();
    fireEvent.press(screen.getByText("Ver los pasos →"));
    expect(screen.getByTestId(`myths-steps-${EXERCISE.id}`)).toBeTruthy();
  });

  it("shows every step, so the activity is complete on a phone", () => {
    render(<ChapterExercises {...props} />);
    fireEvent.press(screen.getByText("Ver los pasos →"));
    for (const [i, step] of EXERCISE.fallbackSteps.entries()) {
      expect(screen.getByText(`${i + 1}. ${step}`)).toBeTruthy();
    }
  });

  it("offers the encrypted diary as an explicit act, not automatically", () => {
    render(<ChapterExercises {...props} />);
    expect(screen.queryByText("🪷 Escribirlo en mi diario")).toBeNull();
    fireEvent.press(screen.getByText("Ver los pasos →"));
    fireEvent.press(screen.getByText("🪷 Escribirlo en mi diario"));
    expect(props.onReflect).toHaveBeenCalledWith(EXERCISE.betterQuestionPrompt);
  });

  it("says where what the reader writes stays", () => {
    render(<ChapterExercises {...props} />);
    fireEvent.press(screen.getByText("Ver los pasos →"));
    expect(screen.getByText(/se cifra de extremo a extremo/)).toBeTruthy();
  });

  it("still opens a reflection for the reflect activity", () => {
    render(<ChapterExercises {...props} />);
    fireEvent.press(screen.getByText("Escribir mi respuesta →"));
    expect(props.onReflect).toHaveBeenCalled();
  });
});
