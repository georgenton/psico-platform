import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHeartbeat } from "./use-heartbeat";

/**
 * Tests for the useHeartbeat hook.
 *
 * The hook fires `PATCH /api/lector/session` every 5 seconds while the
 * tab is focused. These tests cover the contract:
 *
 *   1. No fetch on mount — first beat is after one tick.
 *   2. Each tick reads the latest snapshot and posts it.
 *   3. PATCH payload shape matches the API DTO.
 *   4. `document.hidden` gates the beat (no fetch when tab is in background).
 *   5. `read()` returning null short-circuits.
 *   6. Network errors are swallowed silently.
 *   7. `onProgress` callback fires with the server-returned progressPct.
 *   8. The interval is cleared on unmount.
 *
 * We use `vi.useFakeTimers()` to drive the setInterval deterministically
 * and spy on the global `fetch`. The hook receives `apiBase`/`token`/
 * `bookId`/`chapterOrder` as props from the parent so we pass stubs.
 */

const apiBase = "https://api.example/api";
const token = "bearer-stub";
const bookId = "book-1";
const chapterOrder = 1;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom defaults document.hidden to false. Re-affirm so other tests
  // that flip it can't leak across files.
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mountHook(opts: {
  read?: () => { lastBlockId: string; progressPct: number } | null;
  onProgress?: (n: number) => void;
}) {
  return renderHook(() =>
    useHeartbeat({
      apiBase,
      token,
      bookId,
      chapterOrder,
      onProgress: opts.onProgress,
      read: opts.read ?? (() => ({ lastBlockId: "b-1", progressPct: 0.25 })),
    }),
  );
}

describe("useHeartbeat — basic loop", () => {
  it("does NOT fire on mount — the first beat waits for the interval", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mountHook({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fires PATCH every 5 seconds while document is visible", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    mountHook({});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("sends the expected PATCH payload shape", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    mountHook({
      read: () => ({ lastBlockId: "b-42", progressPct: 0.7 }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${apiBase}/lector/session`);
    const req = init as RequestInit;
    expect(req.method).toBe("PATCH");
    expect(req.keepalive).toBe(true);
    expect((req.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${token}`,
    );
    const body = JSON.parse(req.body as string);
    expect(body.bookId).toBe(bookId);
    expect(body.chapterOrder).toBe(chapterOrder);
    expect(body.lastBlockId).toBe("b-42");
    expect(body.progressPct).toBe(0.7);
    expect(typeof body.timeSpentDeltaSec).toBe("number");
    // timeSpentDeltaSec is clamped at 60 server-side; client honors that
    // bound and the first tick is exactly ~5s so we expect ~5.
    expect(body.timeSpentDeltaSec).toBeLessThanOrEqual(60);
  });
});

describe("useHeartbeat — gating", () => {
  it("does NOT fetch when document.hidden is true", async () => {
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mountHook({});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT fetch when read() returns null", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mountHook({ read: () => null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("useHeartbeat — error tolerance", () => {
  it("swallows network errors silently — no throw, no rejection bubbling up", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const onProgress = vi.fn();
    mountHook({ onProgress });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    // No assertion of throw — if the hook didn't swallow, vitest would
    // surface the unhandled rejection and fail the test.
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("useHeartbeat — onProgress callback", () => {
  it("fires onProgress with the server-returned progressPct on each successful beat", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ progressPct: 0.92 }), { status: 200 }),
    );
    const onProgress = vi.fn();
    mountHook({ onProgress });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(onProgress).toHaveBeenCalledWith(0.92);
  });

  it("does NOT call onProgress when the server returns non-OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate-limited", { status: 429 }),
    );
    const onProgress = vi.fn();
    mountHook({ onProgress });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("useHeartbeat — cleanup", () => {
  it("clears the interval on unmount so the hook stops firing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { unmount } = mountHook({});
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
