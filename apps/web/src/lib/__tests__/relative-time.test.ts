import { describe, expect, it } from "vitest";
import { relativeTime } from "../relative-time";

const NOW = new Date("2026-06-11T12:00:00Z");

describe("relativeTime", () => {
  it("returns null for null/undefined", () => {
    expect(relativeTime(null, NOW)).toBeNull();
    expect(relativeTime(undefined, NOW)).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(relativeTime("not-a-date", NOW)).toBeNull();
  });

  it("renders 'hace un momento' for < 1 minute", () => {
    const t = new Date("2026-06-11T11:59:30Z");
    expect(relativeTime(t, NOW)).toBe("hace un momento");
  });

  it("renders minute granularity in singular/plural", () => {
    expect(relativeTime(new Date("2026-06-11T11:59:00Z"), NOW)).toBe(
      "hace 1 minuto",
    );
    expect(relativeTime(new Date("2026-06-11T11:55:00Z"), NOW)).toBe(
      "hace 5 minutos",
    );
  });

  it("renders hour granularity", () => {
    expect(relativeTime(new Date("2026-06-11T09:00:00Z"), NOW)).toBe(
      "hace 3 horas",
    );
  });

  it("renders 'ayer' for exactly 1 day ago", () => {
    expect(relativeTime(new Date("2026-06-10T12:00:00Z"), NOW)).toBe("ayer");
  });

  it("renders 'hace N días' for 2-6 days", () => {
    expect(relativeTime(new Date("2026-06-08T12:00:00Z"), NOW)).toBe(
      "hace 3 días",
    );
  });

  it("renders weeks for 7-29 days", () => {
    expect(relativeTime(new Date("2026-06-04T12:00:00Z"), NOW)).toBe(
      "hace 1 semana",
    );
    expect(relativeTime(new Date("2026-05-28T12:00:00Z"), NOW)).toBe(
      "hace 2 semanas",
    );
  });

  it("renders months for 30-364 days", () => {
    expect(relativeTime(new Date("2026-05-11T12:00:00Z"), NOW)).toBe(
      "hace 1 mes",
    );
    expect(relativeTime(new Date("2026-02-11T12:00:00Z"), NOW)).toBe(
      "hace 4 meses",
    );
  });

  it("renders years for >= 1 year", () => {
    expect(relativeTime(new Date("2025-06-11T12:00:00Z"), NOW)).toBe(
      "hace 1 año",
    );
    expect(relativeTime(new Date("2024-06-11T12:00:00Z"), NOW)).toBe(
      "hace 2 años",
    );
  });

  it("accepts ISO strings, not just Date instances", () => {
    expect(relativeTime("2026-06-08T12:00:00Z", NOW)).toBe("hace 3 días");
  });
});
