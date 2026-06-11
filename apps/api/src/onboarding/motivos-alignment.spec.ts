import { describe, expect, it } from "vitest";
import {
  FALLBACK_BOOK_SLUG,
  FALLBACK_REASON,
  KNOWN_ANCHOR_BOOK_SLUGS,
  MOTIVO_SEED_CATALOG,
  RECOMMENDATION_BY_MOTIVO,
  RECOMMENDATION_REASON,
} from "./constants";

/**
 * Enforces that:
 *
 *   - Every seeded motivo has a recommendation pointing to a known book.
 *   - Every recommended book slug is in the closed set of anchor books.
 *   - FALLBACK_BOOK_SLUG is a known book.
 *   - RECOMMENDATION_REASON keys match the (motivo, book) shape, and every
 *     such key references known IDs.
 *   - FALLBACK_REASON is a non-empty string.
 *
 * If this test fails, you forgot to update one side when adding/renaming a
 * motivo or anchor book. Update both:
 *   - SEED catalog: apps/api/src/onboarding/constants.ts (MOTIVO_SEED_CATALOG).
 *   - Recos map:    apps/api/src/onboarding/constants.ts
 *                   (RECOMMENDATION_BY_MOTIVO + RECOMMENDATION_REASON).
 *   - Books seed:   apps/api/prisma/seed.ts (and KNOWN_ANCHOR_BOOK_SLUGS).
 */
describe("motivos seed ↔ recommendation map alignment", () => {
  it("seed has at least one motivo", () => {
    expect(MOTIVO_SEED_CATALOG.length).toBeGreaterThan(0);
  });

  it("every motivo has a recommendation", () => {
    for (const m of MOTIVO_SEED_CATALOG) {
      expect(
        RECOMMENDATION_BY_MOTIVO[m.id],
        `motivo '${m.id}' has no RECOMMENDATION_BY_MOTIVO entry`,
      ).toBeDefined();
    }
  });

  it("every recommended book is a known anchor slug", () => {
    for (const [motivoId, bookSlug] of Object.entries(
      RECOMMENDATION_BY_MOTIVO,
    )) {
      expect(
        KNOWN_ANCHOR_BOOK_SLUGS.includes(bookSlug),
        `motivo '${motivoId}' recommends unknown book '${bookSlug}'`,
      ).toBe(true);
    }
  });

  it("RECOMMENDATION_BY_MOTIVO has no orphan keys (no motivo without a seed row)", () => {
    const seedIds = new Set(MOTIVO_SEED_CATALOG.map((m) => m.id));
    for (const motivoId of Object.keys(RECOMMENDATION_BY_MOTIVO)) {
      expect(
        seedIds.has(motivoId),
        `RECOMMENDATION_BY_MOTIVO has orphan key '${motivoId}' (not in seed)`,
      ).toBe(true);
    }
  });

  it("FALLBACK_BOOK_SLUG is a known anchor slug", () => {
    expect(KNOWN_ANCHOR_BOOK_SLUGS).toContain(FALLBACK_BOOK_SLUG);
  });

  it("FALLBACK_REASON is a non-empty string", () => {
    expect(typeof FALLBACK_REASON).toBe("string");
    expect(FALLBACK_REASON.length).toBeGreaterThan(0);
  });

  it("RECOMMENDATION_REASON keys follow `motivo:book` shape with known IDs", () => {
    const seedIds = new Set(MOTIVO_SEED_CATALOG.map((m) => m.id));
    for (const key of Object.keys(RECOMMENDATION_REASON)) {
      expect(key, `'${key}' is missing the colon separator`).toContain(":");
      const [motivoId, bookSlug] = key.split(":");
      expect(
        seedIds.has(motivoId),
        `RECOMMENDATION_REASON key '${key}' references unknown motivo '${motivoId}'`,
      ).toBe(true);
      expect(
        KNOWN_ANCHOR_BOOK_SLUGS.includes(bookSlug),
        `RECOMMENDATION_REASON key '${key}' references unknown book '${bookSlug}'`,
      ).toBe(true);
    }
  });

  it("every (motivo, recommended book) pair has a tailored reason", () => {
    // Soft invariant: if we have RECOMMENDATION_BY_MOTIVO[m] = book, then the
    // tailored copy `${m}:${book}` should exist. If a tailored reason is
    // missing the service falls back to FALLBACK_REASON, which is acceptable
    // but signals incomplete editorial work.
    for (const [motivoId, bookSlug] of Object.entries(
      RECOMMENDATION_BY_MOTIVO,
    )) {
      const key = `${motivoId}:${bookSlug}`;
      expect(
        RECOMMENDATION_REASON[key],
        `tailored reason missing for '${key}' — will fall back to FALLBACK_REASON`,
      ).toBeDefined();
    }
  });

  it("seed `order` is 1-indexed contiguous", () => {
    const orders = MOTIVO_SEED_CATALOG.map((m) => m.order).sort(
      (a, b) => a - b,
    );
    expect(orders).toEqual(
      Array.from({ length: MOTIVO_SEED_CATALOG.length }, (_, i) => i + 1),
    );
  });

  it("seed ids are unique", () => {
    const ids = MOTIVO_SEED_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("seed icons are non-empty strings", () => {
    for (const m of MOTIVO_SEED_CATALOG) {
      expect(m.icon).toBeTruthy();
      expect(typeof m.icon).toBe("string");
    }
  });
});
