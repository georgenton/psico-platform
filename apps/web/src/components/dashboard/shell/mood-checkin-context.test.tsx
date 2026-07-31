import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodCheckinProvider, useMoodCheckin } from "./mood-checkin-context";
import { MoodChip } from "./MoodChip";

/**
 * GR-3 — asking for the check-in is not reporting a mood.
 *
 * The guided-reading panel offers «Registrar mi momento». These tests pin the
 * two things that must be true of that offer: the dialog opens where it lives
 * (no navigation, no second surface), and nothing is written until the person
 * picks a face themselves.
 */

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});

/** A stand-in for any surface that wants the check-in — here, one button. */
function Requester() {
  const { openMoodCheckin } = useMoodCheckin();
  return (
    <button type="button" onClick={openMoodCheckin}>
      Registrar mi momento
    </button>
  );
}

function renderShellish() {
  return render(
    <MoodCheckinProvider>
      <MoodChip initialMood={null} />
      <Requester />
    </MoodCheckinProvider>,
  );
}

describe("MoodCheckinContext", () => {
  it("opens the existing check-in surface, and writes nothing on the way", async () => {
    const user = userEvent.setup();
    renderShellish();

    // The popover lives in the DOM and opens by class, so "open" is a state,
    // not a mount.
    const popover = screen.getByRole("dialog");
    expect(popover.className).not.toContain("open");

    await user.click(
      screen.getByRole("button", { name: "Registrar mi momento" }),
    );

    // The topbar's own popover — not a second check-in built for the guide.
    await waitFor(() => expect(popover.className).toContain("open"));
    // Opening a dialog is not a report: nothing has been sent.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preselects nothing — no face is pressed until the person presses one", async () => {
    const user = userEvent.setup();
    renderShellish();
    await user.click(
      screen.getByRole("button", { name: "Registrar mi momento" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog").className).toContain("open"),
    );

    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a second request re-opens it after a manual close", async () => {
    const user = userEvent.setup();
    renderShellish();
    const ask = screen.getByRole("button", { name: "Registrar mi momento" });

    const popover = screen.getByRole("dialog");

    await user.click(ask);
    await waitFor(() => expect(popover.className).toContain("open"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(popover.className).not.toContain("open"));

    // A counter, not a boolean: asking twice works.
    await user.click(ask);
    await waitFor(() => expect(popover.className).toContain("open"));
  });

  it("outside the provider the request is a no-op, not a crash", async () => {
    const user = userEvent.setup();
    render(<Requester />);
    await user.click(
      screen.getByRole("button", { name: "Registrar mi momento" }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("MoodCheckinContext — focus", () => {
  it("focus lands INSIDE the dialog, on a mood button that is not pressed", async () => {
    const user = userEvent.setup();
    renderShellish();
    await user.click(
      screen.getByRole("button", { name: "Registrar mi momento" }),
    );

    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.className).toContain("open"));

    // The assertion is on the real focus owner, not on a class.
    await waitFor(() => {
      const active = document.activeElement as HTMLElement | null;
      expect(active).not.toBeNull();
      expect(dialog.contains(active)).toBe(true);
    });

    const active = document.activeElement as HTMLElement;
    // Focusing a face is not choosing one.
    expect(active.getAttribute("aria-pressed")).not.toBe("true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
