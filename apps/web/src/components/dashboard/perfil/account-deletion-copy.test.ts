import { describe, expect, it } from "vitest";
import {
  accountDeletionDateLabel,
  accountDeletionNotice,
  cancelAccountDeletionErrorCopy,
} from "@psico/types";

/**
 * The sentence web and mobile both print. Lives here because `@psico/types` has
 * no runner of its own.
 *
 * Every expectation names its zone, so it holds whatever `TZ` the process runs
 * under — which is the property: the machine that paints has no say.
 */
describe("the day an account goes away, as a person reads it", () => {
  const at = "2026-12-25T02:05:00.000Z";

  it("is told in the person's zone, not in the machine's", () => {
    expect(accountDeletionDateLabel(at, "America/Guayaquil")).toBe(
      "24 de diciembre de 2026 a las 21:05",
    );
    expect(accountDeletionDateLabel(at, "Europe/Madrid")).toBe(
      "25 de diciembre de 2026 a las 03:05",
    );
  });

  it("without a valid zone counts in UTC and says so", () => {
    for (const zone of [null, undefined, "", "Quito/Ecuador"]) {
      expect(accountDeletionDateLabel(at, zone)).toBe(
        "25 de diciembre de 2026 a las 02:05 (hora UTC)",
      );
    }
  });

  it("carries the year of that zone, across a year end", () => {
    expect(
      accountDeletionDateLabel("2027-01-01T03:00:00.000Z", "America/Guayaquil"),
    ).toBe("31 de diciembre de 2026 a las 22:00");
    expect(accountDeletionDateLabel("2027-01-01T03:00:00.000Z", "UTC")).toBe(
      "1 de enero de 2027 a las 03:00",
    );
  });

  it("prints no day at all rather than a wrong one", () => {
    for (const nothing of [null, undefined, "", "no es una fecha"]) {
      expect(accountDeletionDateLabel(nothing, "America/Guayaquil")).toBeNull();
      expect(accountDeletionNotice(nothing, "America/Guayaquil")).toBe(
        "Tu cuenta está programada para eliminarse.",
      );
    }
  });

  it("says until when it can be undone, and sends nobody to support", () => {
    const notice = accountDeletionNotice(at, "America/Guayaquil");
    expect(notice).toBe(
      "Tu cuenta se eliminará el 24 de diciembre de 2026 a las 21:05. Puedes cancelarlo hasta ese momento.",
    );
    expect(notice).not.toMatch(/soporte/i);
  });

  it("has one sentence per outcome, and never claims a refusal it did not get", () => {
    expect(cancelAccountDeletionErrorCopy(409)).toMatch(/pasó el plazo/);
    expect(cancelAccountDeletionErrorCopy(410)).toMatch(/ya se eliminó/);
    expect(cancelAccountDeletionErrorCopy(429)).toMatch(/Espera un momento/);
    // Unknown, or no answer: it may have worked, so it is «could not confirm».
    for (const status of [null, 404, 500, 503]) {
      expect(cancelAccountDeletionErrorCopy(status)).toBe(
        "No pudimos confirmar la cancelación. Inténtalo de nuevo.",
      );
    }
  });
});
