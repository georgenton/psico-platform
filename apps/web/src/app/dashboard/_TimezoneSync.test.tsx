import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("@/actions/timezone", () => ({
  setTimezoneAction: vi.fn().mockResolvedValue(undefined),
}));

import { setTimezoneAction } from "@/actions/timezone";
import { TimezoneSync } from "./_TimezoneSync";

describe("TimezoneSync", () => {
  beforeEach(() => {
    vi.mocked(setTimezoneAction).mockClear();
  });

  it("calls the server action with the browser timezone when needsProbe=true", async () => {
    render(<TimezoneSync needsProbe={true} />);
    await waitFor(() => {
      expect(setTimezoneAction).toHaveBeenCalledTimes(1);
    });
    const [arg] = vi.mocked(setTimezoneAction).mock.calls[0]!;
    expect(typeof arg).toBe("string");
    expect((arg as string).length).toBeGreaterThan(0);
  });

  it("does NOT call the server action when needsProbe=false", async () => {
    render(<TimezoneSync needsProbe={false} />);
    // Wait one tick so the effect would have fired if it were going to.
    await new Promise((r) => setTimeout(r, 10));
    expect(setTimezoneAction).not.toHaveBeenCalled();
  });

  it("only fires once even on re-render", async () => {
    const { rerender } = render(<TimezoneSync needsProbe={true} />);
    await waitFor(() => {
      expect(setTimezoneAction).toHaveBeenCalledTimes(1);
    });
    rerender(<TimezoneSync needsProbe={true} />);
    rerender(<TimezoneSync needsProbe={true} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(setTimezoneAction).toHaveBeenCalledTimes(1);
  });
});
