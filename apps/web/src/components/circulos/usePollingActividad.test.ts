import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import {
  POLLING_INTERVAL_MS,
  usePollingActividad,
} from "./usePollingActividad";
import { CERRADA, ESPERANDO } from "./__fixtures__/actividad";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  setVisibility("visible");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(ESPERANDO), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setVisibility("visible");
});

describe("the room keeps up without becoming a background drip", () => {
  it("polls on a ten-second interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderHook(() => usePollingActividad("act-1", ESPERANDO));
    expect(POLLING_INTERVAL_MS).toBe(10_000);
    expect(fetchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS + 50);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("stops while the tab is hidden and resumes when it returns", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderHook(() => usePollingActividad("act-1", ESPERANDO));

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 3);
    // A phone in a pocket must not keep asking about somebody's activity.
    expect(fetchSpy).not.toHaveBeenCalled();

    setVisibility("visible");
    // Coming back refetches at once, so the first thing seen is current.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });

  it("stops for good once the activity is terminal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderHook(() => usePollingActividad("act-1", CERRADA));
    await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 5);

    // CLOSED does not change again; asking would be asking forever.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears its timer on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { unmount } = renderHook(() =>
      usePollingActividad("act-1", ESPERANDO),
    );
    unmount();

    await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("failures surface as the server's own code", () => {
  it("keeps the opaque code rather than inventing a reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "CIRCLE_FORBIDDEN" }), {
        status: 403,
      }),
    );

    const { result } = renderHook(() => usePollingActividad("act-1", null));
    await waitFor(() => expect(result.current.error).toBe("CIRCLE_FORBIDDEN"));
  });

  it("refuses a 200 whose body is not an activity, instead of crashing", async () => {
    // The room dereferences `you.status` to pick a stage. A 200 carrying
    // anything else would take it down to a blank screen, which is worse than
    // an honest refusal.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const { result } = renderHook(() => usePollingActividad("act-1", null));
    await waitFor(() =>
      expect(result.current.error).toBe("CIRCLE_UNAVAILABLE"),
    );
    expect(result.current.view).toBeNull();
  });
});
