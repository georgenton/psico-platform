import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChapterExercises } from "./ChapterExercises";

/**
 * Tests for the interactive chapter activities section (backlog).
 *
 * Asserts: curated exercises render as cards, unknown chapters render nothing,
 * and the CTA routes reflect → onReflect(prompt) and breathe → onBreathe(ex).
 */
describe("ChapterExercises", () => {
  it("renders nothing for a chapter with no curated exercises", () => {
    const { container } = render(
      <ChapterExercises
        bookSlug="emociones-en-construccion"
        chapterOrder={99}
        onReflect={vi.fn()}
        onBreathe={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the curated exercises for a known chapter", () => {
    render(
      <ChapterExercises
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        onReflect={vi.fn()}
        onBreathe={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Actividades de este capítulo"),
    ).toBeInTheDocument();
    // Chapter 1 has a breathe + a reflect exercise.
    expect(screen.getByText("Respira antes de seguir")).toBeInTheDocument();
    expect(
      screen.getByText("El cuerpo antes que la palabra"),
    ).toBeInTheDocument();
  });

  it("calls onBreathe with the exercise when a breathing card is tapped", () => {
    const onBreathe = vi.fn();
    render(
      <ChapterExercises
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        onReflect={vi.fn()}
        onBreathe={onBreathe}
      />,
    );
    fireEvent.click(screen.getByText(/Empezar/));
    expect(onBreathe).toHaveBeenCalledTimes(1);
    expect(onBreathe.mock.calls[0][0]).toMatchObject({ kind: "breathe" });
  });

  it("calls onReflect with the prompt when a reflect card is tapped", () => {
    const onReflect = vi.fn();
    render(
      <ChapterExercises
        bookSlug="emociones-en-construccion"
        chapterOrder={2}
        onReflect={onReflect}
        onBreathe={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Escribir mi respuesta/));
    expect(onReflect).toHaveBeenCalledTimes(1);
    expect(typeof onReflect.mock.calls[0][0]).toBe("string");
    expect(onReflect.mock.calls[0][0].length).toBeGreaterThan(10);
  });
});
