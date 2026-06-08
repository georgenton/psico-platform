import { describe, expect, it } from "vitest";
import {
  isUserLocalHour,
  isValidTimezone,
  userLocalHour,
  userLocalWeekday,
} from "./timezone";

/**
 * Sprint S53 — timezone helper tests.
 *
 * Reference instants: we use deterministic UTC timestamps and check
 * that `Intl.DateTimeFormat` resolves the user's local hour/weekday as
 * expected. No live `Date.now()` — all timestamps are explicit.
 */
describe("timezone helpers", () => {
  describe("isValidTimezone", () => {
    it("accepts canonical IANA names", () => {
      expect(isValidTimezone("America/Guayaquil")).toBe(true);
      expect(isValidTimezone("Europe/Madrid")).toBe(true);
      expect(isValidTimezone("Asia/Tokyo")).toBe(true);
      expect(isValidTimezone("UTC")).toBe(true);
    });

    it("rejects obvious garbage", () => {
      expect(isValidTimezone("")).toBe(false);
      expect(isValidTimezone("Not/A_Real_Tz")).toBe(false);
      expect(isValidTimezone("x".repeat(200))).toBe(false);
    });

    it("rejects non-strings without throwing", () => {
      // @ts-expect-error — runtime defensive path: non-strings hit early-return
      expect(isValidTimezone(null)).toBe(false);
      // @ts-expect-error — runtime defensive path
      expect(isValidTimezone(undefined)).toBe(false);
      // @ts-expect-error — runtime defensive path
      expect(isValidTimezone(123)).toBe(false);
    });
  });

  describe("userLocalHour", () => {
    it("falls back to UTC hour when timezone is null", () => {
      // 2026-06-08 10:00:00 UTC
      const now = new Date(Date.UTC(2026, 5, 8, 10, 0, 0));
      expect(userLocalHour(now, null)).toBe(10);
      expect(userLocalHour(now, undefined)).toBe(10);
    });

    it("computes local hour for America/Guayaquil (UTC-5)", () => {
      // 2026-06-08 12:00 UTC === 2026-06-08 07:00 Guayaquil
      const now = new Date(Date.UTC(2026, 5, 8, 12, 0, 0));
      expect(userLocalHour(now, "America/Guayaquil")).toBe(7);
    });

    it("computes local hour for Asia/Tokyo (UTC+9) with day rollover", () => {
      // 2026-06-08 22:00 UTC === 2026-06-09 07:00 Tokyo
      const now = new Date(Date.UTC(2026, 5, 8, 22, 0, 0));
      expect(userLocalHour(now, "Asia/Tokyo")).toBe(7);
    });

    it("falls back to UTC on bogus timezone (defensive)", () => {
      const now = new Date(Date.UTC(2026, 5, 8, 15, 0, 0));
      expect(userLocalHour(now, "Not/A_Real_Tz")).toBe(15);
    });
  });

  describe("userLocalWeekday", () => {
    it("falls back to UTC weekday when timezone is null", () => {
      // 2026-06-08 is a Monday in UTC
      const monday = new Date(Date.UTC(2026, 5, 8, 12, 0, 0));
      expect(userLocalWeekday(monday, null)).toBe(1);
    });

    it("rolls over the day boundary for Asia/Tokyo", () => {
      // Sunday 22:00 UTC === Monday 07:00 Tokyo
      const sunday22Utc = new Date(Date.UTC(2026, 5, 7, 22, 0, 0));
      expect(userLocalWeekday(sunday22Utc, null)).toBe(0); // Sun UTC
      expect(userLocalWeekday(sunday22Utc, "Asia/Tokyo")).toBe(1); // Mon JST
    });

    it("rolls back for America/Guayaquil", () => {
      // Monday 02:00 UTC === Sunday 21:00 Guayaquil (UTC-5)
      const monday02Utc = new Date(Date.UTC(2026, 5, 8, 2, 0, 0));
      expect(userLocalWeekday(monday02Utc, null)).toBe(1); // Mon UTC
      expect(userLocalWeekday(monday02Utc, "America/Guayaquil")).toBe(0); // Sun ECT
    });
  });

  describe("isUserLocalHour", () => {
    it("is true at the target hour, false at all other hours", () => {
      const now = new Date(Date.UTC(2026, 5, 8, 12, 0, 0)); // 07:00 ECT
      expect(isUserLocalHour(now, "America/Guayaquil", 7)).toBe(true);
      expect(isUserLocalHour(now, "America/Guayaquil", 8)).toBe(false);
      expect(isUserLocalHour(now, "America/Guayaquil", 6)).toBe(false);
    });
  });
});
