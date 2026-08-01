import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGuideDiscovery } from "./use-guide-discovery";
import { EEC_PIN, PQP_PIN } from "./guide-test-fixtures";
import type * as ApiClientModule from "@psico/api-client";

/**
 * GR-4 — the reader asks; it never decides.
 *
 * Two properties carry the weight here. First, four of the five states are
 * "no guide": `loading` and `error` must NOT collapse into an available pin,
 * because the only thing worse than no guide is the wrong one. Second, a late
 * answer from a chapter the reader already left must be dropped — otherwise
 * walking Emociones → Parejas quickly enough would pin the guide of the
 * chapter behind them.
 */

const getGuideDiscovery = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: (...a: unknown[]) => getGuideDiscovery(...a),
    },
  };
});

const EEC_CTX = {
  enabled: true,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
};
const PQP_CTX = {
  enabled: true,
  bookSlug: "parejas-que-perduran",
  chapterOrder: 2,
};

function answerPin(pin: { guideKey: string; guideVersion: number }) {
  return {
    available: true,
    guideKey: pin.guideKey,
    guideVersion: pin.guideVersion,
  };
}

/** A promise plus the handles to settle it whenever the test wants. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGuideDiscovery", () => {
  it("stays idle and asks NOTHING when the surface is off", () => {
    const { result } = renderHook(() =>
      useGuideDiscovery({ ...EEC_CTX, enabled: false }),
    );
    expect(result.current).toEqual({ status: "idle" });
    expect(getGuideDiscovery).not.toHaveBeenCalled();
  });

  it("reports loading before the answer arrives", async () => {
    const d = deferred<unknown>();
    getGuideDiscovery.mockReturnValue(d.promise);
    const { result } = renderHook(() => useGuideDiscovery(EEC_CTX));

    expect(result.current).toEqual({ status: "loading" });
    d.resolve(answerPin(EEC_PIN));
    await waitFor(() =>
      expect(result.current).toEqual({ status: "available", pin: EEC_PIN }),
    );
  });

  it("carries the EXACT pin the server named", async () => {
    getGuideDiscovery.mockResolvedValue(answerPin(PQP_PIN));
    const { result } = renderHook(() => useGuideDiscovery(PQP_CTX));

    await waitFor(() =>
      expect(result.current).toEqual({ status: "available", pin: PQP_PIN }),
    );
    expect(getGuideDiscovery).toHaveBeenCalledWith("parejas-que-perduran", 2);
  });

  it("reports unavailable on an editorial no", async () => {
    getGuideDiscovery.mockResolvedValue({ available: false });
    const { result } = renderHook(() => useGuideDiscovery(PQP_CTX));
    await waitFor(() =>
      expect(result.current).toEqual({ status: "unavailable" }),
    );
  });

  it("FAILS CLOSED on a rejected request — never available", async () => {
    getGuideDiscovery.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useGuideDiscovery(EEC_CTX));
    await waitFor(() => expect(result.current).toEqual({ status: "error" }));
  });

  it.each([
    ["a missing key", { available: true, guideVersion: 1 }],
    ["a shouty key", { available: true, guideKey: "EEC", guideVersion: 1 }],
    [
      "version zero",
      { available: true, guideKey: "una-guia", guideVersion: 0 },
    ],
    [
      "a string version",
      { available: true, guideKey: "una-guia", guideVersion: "1" },
    ],
  ])("treats %s as an error, not a repairable pin", async (_why, payload) => {
    getGuideDiscovery.mockResolvedValue(payload);
    const { result } = renderHook(() => useGuideDiscovery(EEC_CTX));
    await waitFor(() => expect(result.current).toEqual({ status: "error" }));
  });

  it("STALE_RESPONSE_APPLIED=false — a late answer for the old chapter is dropped", async () => {
    const first = deferred<unknown>();
    getGuideDiscovery.mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(
      (props) => useGuideDiscovery(props),
      {
        initialProps: EEC_CTX,
      },
    );
    expect(result.current).toEqual({ status: "loading" });

    // The reader walks to the other book while the first request is in flight.
    getGuideDiscovery.mockResolvedValueOnce(answerPin(PQP_PIN));
    rerender(PQP_CTX);
    await waitFor(() =>
      expect(result.current).toEqual({ status: "available", pin: PQP_PIN }),
    );

    // …and only NOW does the abandoned request answer.
    first.resolve(answerPin(EEC_PIN));
    await Promise.resolve();
    expect(result.current).toEqual({ status: "available", pin: PQP_PIN });
  });

  it("drops a late answer that arrives after unmount", async () => {
    const d = deferred<unknown>();
    getGuideDiscovery.mockReturnValue(d.promise);
    const { unmount } = renderHook(() => useGuideDiscovery(EEC_CTX));

    unmount();
    d.resolve(answerPin(EEC_PIN));
    // React logs a warning if a setState lands on an unmounted tree; the
    // cleanup flag is what keeps this quiet.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("asks again when the chapter changes, and only then", async () => {
    getGuideDiscovery.mockResolvedValue(answerPin(EEC_PIN));
    const { rerender } = renderHook((p) => useGuideDiscovery(p), {
      initialProps: EEC_CTX,
    });
    await waitFor(() => expect(getGuideDiscovery).toHaveBeenCalledTimes(1));

    rerender({ ...EEC_CTX }); // same values, new object
    await waitFor(() => expect(getGuideDiscovery).toHaveBeenCalledTimes(1));

    rerender({ ...EEC_CTX, chapterOrder: 2 });
    await waitFor(() => expect(getGuideDiscovery).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["an empty slug", { ...EEC_CTX, bookSlug: "" }],
    ["chapter zero", { ...EEC_CTX, chapterOrder: 0 }],
    ["a fractional chapter", { ...EEC_CTX, chapterOrder: 1.5 }],
  ])("does not spend a request on %s", (_why, ctx) => {
    const { result } = renderHook(() => useGuideDiscovery(ctx));
    expect(result.current).toEqual({ status: "idle" });
    expect(getGuideDiscovery).not.toHaveBeenCalled();
  });

  it("NO_CLIENT_SIDE_INFERENCE — the slug alone never produces a pin", async () => {
    // Even for the book we ship a guide for, `available: false` is final.
    getGuideDiscovery.mockResolvedValue({ available: false });
    const { result } = renderHook(() => useGuideDiscovery(EEC_CTX));
    await waitFor(() =>
      expect(result.current).toEqual({ status: "unavailable" }),
    );
  });
});
