import { describe, expect, it } from "vitest";
import {
  DATA_EXPORT_COOLDOWN_DAYS,
  DATA_EXPORT_RETENTION_DAYS,
  DATA_EXPORT_STATUS,
  dataExportRetentionCutoff,
} from "./data-export-retention";

/**
 * The two clocks, and the one invariant between them.
 *
 * Retention and the request cooldown are a single decision wearing two names.
 * Described in a comment they were two numbers that happened to agree; asserted
 * here, changing one of them fails a test instead of stranding a user with no
 * file and no way to ask for another.
 */

describe("retention and the request cooldown are the same window", () => {
  it("expires the object exactly when a replacement becomes available", () => {
    // The failure this prevents: retention shorter than the cooldown leaves a
    // gap where the file is deleted and a new request is still refused. At 7
    // days against a 30-day cooldown, that gap is 23 days long.
    expect(DATA_EXPORT_RETENTION_DAYS).toBe(DATA_EXPORT_COOLDOWN_DAYS);
  });

  it("is 30 days, which is what the cooldown was built around", () => {
    expect(DATA_EXPORT_RETENTION_DAYS).toBe(30);
  });
});

describe("the cutoff", () => {
  it("is exactly the retention window behind the instant it is given", () => {
    const now = new Date("2026-11-01T03:30:00.000Z");
    expect(dataExportRetentionCutoff(now).toISOString()).toBe(
      "2026-10-02T03:30:00.000Z",
    );
  });

  it("takes `now` so a boundary can be stated instead of slept through", () => {
    const a = new Date("2026-01-01T00:00:00.000Z");
    const b = new Date("2026-06-01T00:00:00.000Z");
    expect(dataExportRetentionCutoff(a).getTime()).toBeLessThan(
      dataExportRetentionCutoff(b).getTime(),
    );
  });
});

describe("the status vocabulary", () => {
  it("carries EXPIRED alongside the original four", () => {
    // A plain String column, so these strings ARE the contract. Collected in one
    // place because the previous four were spelled inline at each use, which is
    // how a fifth state gets missed by a reader that only ever saw four.
    expect(Object.values(DATA_EXPORT_STATUS)).toEqual([
      "PENDING",
      "PROCESSING",
      "READY",
      "FAILED",
      "EXPIRED",
    ]);
  });
});
