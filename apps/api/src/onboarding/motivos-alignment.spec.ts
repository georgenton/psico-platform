import { describe, expect, it } from "vitest";
import { FIXTURE_AUTHOR_SLUGS } from "../catalog/authorship-sources";
import {
  FALLBACK_BOOK_SLUG,
  FALLBACK_REASON,
  KNOWN_ANCHOR_BOOK_SLUGS,
  MOTIVO_SEED_CATALOG,
  ONBOARDING_INTRO,
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

/**
 * El copy del onboarding no acredita a una identidad de fixture.
 *
 * Dos razones y el fallback abrían con el nombre de pila del autor de demo
 * —la misma identidad que el catálogo acreditaba como autora de una obra
 * real—, así que la atribución equivocada viajaba también en copy editorial.
 * El trinquete del seed ya prohíbe eso en la sinopsis del libro ancla; este
 * cubre la otra superficie que lo decía.
 *
 * Los nombres se derivan de `FIXTURE_AUTHOR_SLUGS`, no se escriben aquí: si
 * mañana se declara otra identidad de fixture, queda cubierta sola.
 */
describe("copy del onboarding ↔ identidades de fixture", () => {
  const forbidden = FIXTURE_AUTHOR_SLUGS.flatMap((slug) => slug.split("-"));

  const surfaces: ReadonlyArray<readonly [string, string]> = [
    ...Object.entries(RECOMMENDATION_REASON),
    ["FALLBACK_REASON", FALLBACK_REASON],
    ["ONBOARDING_INTRO.title", ONBOARDING_INTRO.title],
    ["ONBOARDING_INTRO.subtitle", ONBOARDING_INTRO.subtitle],
    ["ONBOARDING_INTRO.body", ONBOARDING_INTRO.body],
    ["ONBOARDING_INTRO.signature", ONBOARDING_INTRO.signature],
  ];

  it("hay nombres que vigilar y superficies donde vigilarlos", () => {
    // Guard the guard: si el conjunto quedara vacío, lo de abajo pasaría
    // sobre nada y el trinquete sería decorativo.
    expect(forbidden.length).toBeGreaterThan(0);
    expect(surfaces.length).toBeGreaterThan(5);
  });

  it("ninguna razón ni el fallback nombra a la identidad de fixture", () => {
    for (const [where, copy] of surfaces) {
      for (const name of forbidden) {
        expect(
          new RegExp(`\\b${name}\\b`, "i").test(copy),
          `'${where}' nombra a '${name}', que es una identidad de fixture`,
        ).toBe(false);
      }
    }
  });
});
