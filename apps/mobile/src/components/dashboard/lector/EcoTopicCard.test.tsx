import { fireEvent, render, screen } from "@testing-library/react-native";
import { EcoTopicCard } from "./EcoTopicCard";
import { consumeEcoReaderHandoff } from "@/lib/eco/reader-handoff";

/**
 * Tests for the EcoTopicCard chapter invitation (Sprint B — Eco contextual).
 *
 * Asserts: a curated topic title renders, the CTA seeds the reader→Eco
 * handoff + navigates to the Eco tab, and the dismiss "×" hides the card.
 * The router is mocked; the handoff singleton is real so we can read back
 * what the CTA stashed.
 */

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  mockPush.mockClear();
  // Drain any handoff a prior test left behind.
  consumeEcoReaderHandoff();
});

describe("EcoTopicCard", () => {
  it("renders the curated topic title for a known chapter", () => {
    render(
      <EcoTopicCard
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        chapterTitle="El cuerpo sabe antes que la mente"
      />,
    );
    expect(screen.getByText("CONVERSA CON ECO")).toBeOnTheScreen();
    expect(
      screen.getByText("El cuerpo sabe antes que la mente"),
    ).toBeOnTheScreen();
    expect(screen.getByText(/Explorar este tema/)).toBeOnTheScreen();
  });

  it("seeds the handoff + navigates to Eco when the CTA is tapped", () => {
    render(
      <EcoTopicCard
        bookSlug="emociones-en-construccion"
        chapterOrder={2}
        chapterTitle="Cómo aprendiste a sentir"
      />,
    );
    fireEvent.press(screen.getByText(/Explorar este tema/));

    expect(mockPush).toHaveBeenCalledWith("/eco");

    const handoff = consumeEcoReaderHandoff();
    expect(handoff).not.toBeNull();
    expect(handoff?.source).toEqual({
      bookSlug: "emociones-en-construccion",
      chapterOrder: 2,
      kind: "topic",
    });
    // Curated prompt for chapter 2.
    expect(handoff?.text).toContain("cultura y la familia");
  });

  it("falls back to a generic topic for an uncurated chapter", () => {
    render(
      <EcoTopicCard
        bookSlug="emociones-en-construccion"
        chapterOrder={99}
        chapterTitle="Un capítulo sin curar"
      />,
    );
    expect(screen.getByText("Llévalo a tu vida")).toBeOnTheScreen();
  });

  it("hides the card after the dismiss button is tapped", () => {
    render(
      <EcoTopicCard
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        chapterTitle="El cuerpo sabe antes que la mente"
      />,
    );
    fireEvent.press(screen.getByLabelText("Ocultar sugerencia"));
    expect(screen.queryByText("CONVERSA CON ECO")).toBeNull();
  });
});
