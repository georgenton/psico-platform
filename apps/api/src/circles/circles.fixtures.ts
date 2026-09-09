/**
 * Test fixtures for the Círculos contract.
 *
 * TEST-ONLY, and deliberately synthetic. Nothing here is editorial copy, and
 * nothing here may be promoted into `PRODUCTION_CIRCLE_TEMPLATES`: a template a
 * reader could be offered needs editorial and safety approval, which a fixture
 * file cannot grant. The strings below are placeholders that exist to exercise
 * the validator, not writing anybody reviewed.
 *
 * ── Why this directory exists before the module does ───────────────────────
 *
 * PR1 of the Circles train is a CONTRACT cut: types, validator, catalog,
 * permission matrix, states, threat model. There is no Nest module, no
 * provider, no controller, no repository and no Prisma model yet — PR2 adds
 * those. The specs live here rather than in `packages/types` because that
 * package ships no test runner, and `apps/api` is both where the tests already
 * run in CI and where the module will land.
 *
 * `circles-scope.spec.ts` asserts that emptiness rather than trusting it.
 */

import type { CircleActivityDefinition } from "@psico/types";

/**
 * A structurally valid DUO_ADULT template.
 *
 * DRAFT on purpose: even a fixture should not model a publishable state by
 * default, so a copy-paste into a catalog would still be refused by preview
 * and instantiation.
 */
export const VALID_DUO_TEMPLATE: CircleActivityDefinition = {
  templateKey: "fixture-duo-template",
  templateVersion: 1,
  status: "DRAFT",
  audience: "DUO_ADULT",
  title: "Plantilla de prueba",
  summary:
    "Texto sintético para ejercitar el validador. No es contenido editorial.",
  estimatedMinutes: 20,
  source: {
    bookSlug: "libro-de-prueba",
    chapterOrder: 2,
  },
  participants: { min: 2, max: 2, required: 2 },
  privatePreparation: [
    {
      fieldKey: "campo-a",
      label: "Campo A",
      kind: "SHORT_TEXT",
      maxLength: 200,
    },
    { fieldKey: "campo-b", label: "Campo B", kind: "LONG_TEXT" },
  ],
  sharing: {
    allowedModes: ["SELECTED_FIELDS", "EDITED_SUMMARY", "KEEP_PRIVATE"],
  },
  reveal: { strategy: "ALL_CONFIRMED" },
  conversation: { turns: ["Turno uno.", "Turno dos."] },
  outcome: { kind: "AGREEMENT" },
  followUp: { afterHours: 168 },
  safety: {
    level: "LOW",
    privateGateRequired: false,
    doNotSuggestWhen: ["Situación sintética de prueba."],
  },
  ecoMode: "NONE",
};

/** The same template, PUBLISHED — for the paths that require a live one. */
export const PUBLISHED_DUO_TEMPLATE: CircleActivityDefinition = {
  ...VALID_DUO_TEMPLATE,
  templateKey: "fixture-duo-published",
  status: "PUBLISHED",
};

/** A REINFORCED template, which the validator requires to carry a private gate. */
export const REINFORCED_DUO_TEMPLATE: CircleActivityDefinition = {
  ...VALID_DUO_TEMPLATE,
  templateKey: "fixture-duo-reinforced",
  safety: {
    level: "REINFORCED",
    privateGateRequired: true,
    doNotSuggestWhen: ["Situación sintética que exige compuerta privada."],
  },
};

/**
 * Build a variant by replacing top-level keys. Returns a plain object typed as
 * `unknown` because the whole point is to hand the validator shapes the type
 * system would otherwise refuse to express.
 */
export function templateWith(
  overrides: Record<string, unknown>,
  base: CircleActivityDefinition = VALID_DUO_TEMPLATE,
): unknown {
  return { ...(base as unknown as Record<string, unknown>), ...overrides };
}

/** Build a variant with a top-level key removed. */
export function templateWithout(
  key: string,
  base: CircleActivityDefinition = VALID_DUO_TEMPLATE,
): unknown {
  const copy = { ...(base as unknown as Record<string, unknown>) };
  delete copy[key];
  return copy;
}
