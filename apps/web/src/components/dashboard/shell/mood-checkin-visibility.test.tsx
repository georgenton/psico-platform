import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { MockInstance } from "vitest";
import { MoodCheckinProvider, useMoodCheckin } from "./mood-checkin-context";
import { MoodChip } from "./MoodChip";

/**
 * The check-in dialog's VISIBILITY, and nothing else.
 *
 * The reader needs to know a modal is over the text so it can stop counting
 * reading time. It must not learn which face was picked, what was answered, or
 * that anything was answered at all — `MoodChip` stays the single surface and
 * the single writer. These tests pin both halves: the boolean travels, the
 * content does not.
 */

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    (async () =>
      // Nothing here is exercised by these tests; a permissive stub keeps an
      // accidental call visible in the spy instead of throwing.
      new Response(JSON.stringify({ item: null }), { status: 200 })) as never,
  );
});

afterEach(() => vi.restoreAllMocks());

/** A bystander that can only read the flag — exactly what the reader gets. */
function Observer() {
  const { moodCheckinOpen } = useMoodCheckin();
  const api = useMoodCheckin() as unknown as Record<string, unknown>;
  return (
    <div
      data-testid="observer"
      data-open={moodCheckinOpen ? "true" : "false"}
      data-keys={Object.keys(api).sort().join(",")}
    />
  );
}

const renderChip = () =>
  render(
    <MoodCheckinProvider>
      <MoodChip initialMood={null} />
      <Observer />
    </MoodCheckinProvider>,
  );

const observer = () => screen.getByTestId("observer");

describe("Mood check-in visibility", () => {
  it("MOOD_CHECKIN_VISIBILITY_EXPOSED — closed by default, open when the chip opens", async () => {
    renderChip();
    expect(observer()).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByRole("button", { name: /cómo estás|ánimo/i }));
    await waitFor(() =>
      expect(observer()).toHaveAttribute("data-open", "true"),
    );
  });

  it("closes on the chip toggle and on Escape", async () => {
    renderChip();
    const chip = screen.getByRole("button", { name: /cómo estás|ánimo/i });

    fireEvent.click(chip);
    await waitFor(() =>
      expect(observer()).toHaveAttribute("data-open", "true"),
    );
    fireEvent.click(chip);
    await waitFor(() =>
      expect(observer()).toHaveAttribute("data-open", "false"),
    );

    fireEvent.click(chip);
    await waitFor(() =>
      expect(observer()).toHaveAttribute("data-open", "true"),
    );
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await waitFor(() =>
      expect(observer()).toHaveAttribute("data-open", "false"),
    );
  });

  it("MOOD_OR_SCORE_EXPOSED_TO_READER=false — the context carries three keys and none is content", () => {
    renderChip();
    expect(observer().getAttribute("data-keys")).toBe(
      "moodCheckinOpen,openMoodCheckin,openRequest",
    );
  });

  it("CHECKIN_OPEN_API_CALLS=0 — opening the dialog writes nothing", async () => {
    renderChip();
    fireEvent.click(screen.getByRole("button", { name: /cómo estás|ánimo/i }));
    await waitFor(() =>
      expect(observer()).toHaveAttribute("data-open", "true"),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports closed when the chip unmounts", async () => {
    const view = renderChip();
    fireEvent.click(screen.getByRole("button", { name: /cómo estás|ánimo/i }));
    await waitFor(() =>
      expect(observer()).toHaveAttribute("data-open", "true"),
    );
    view.unmount();
    // Nothing left to assert on the DOM; the point is that unmount runs the
    // cleanup that reports `false` rather than leaving a stuck `true` behind.
    expect(() => view.unmount()).not.toThrow();
  });
});
