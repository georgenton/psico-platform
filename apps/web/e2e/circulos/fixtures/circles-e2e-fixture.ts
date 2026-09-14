// Imported from the package by name so this file typechecks WHERE IT LIVES —
// `apps/web`'s tsconfig includes `**/*.ts`, and a relative import written for
// the destination would be a broken module here and fail the Web build.
// `stack.mjs` rewrites this one line to `./circles` as it copies the file into
// `packages/types/src/`, where a package cannot import itself by name.
import type { CircleActivityDefinition } from "@psico/types";

/**
 * The one synthetic template the end-to-end walk runs on.
 *
 * ── This file is NEVER part of a shipped build ─────────────────────────────
 *
 * It lives under `apps/web/e2e/` and is COPIED into `packages/types/src/` only
 * inside the throwaway tree the stack script builds. The catalog in the real
 * repository stays empty, and `circulos-alcance.test.ts` plus the scope specs
 * keep asserting that.
 *
 * There is deliberately no runtime switch, no environment variable and no
 * injection endpoint that could reach a published build. The only way this
 * template exists anywhere is that a script literally rewrote two source files
 * in a temporary copy and rebuilt it.
 *
 * ── The content is deliberately inert ──────────────────────────────────────
 *
 * Nothing here is editorial. The prompts are placeholders that say so, so a
 * screenshot from the walk cannot be mistaken for approved copy and nobody is
 * tempted to promote it.
 *
 * ── It names a real Experience pin ─────────────────────────────────────────
 *
 * `source.experiencePin` is the standalone guide route's own pin, because
 * eligibility requires the catalog mapping and the template to AGREE. Pointing
 * it at a made-up experience would make the mapping unresolvable and the CTA
 * would never render — which is the resolver working, not a fixture problem.
 */
export const E2E_DUO_TEMPLATE: CircleActivityDefinition = {
  templateKey: "e2e-duo-sintetica",
  templateVersion: 1,
  status: "PUBLISHED",
  audience: "DUO_ADULT",
  title: "Actividad sintética de prueba",
  summary:
    "Contenido de prueba automatizada. No es material editorial y no debe publicarse.",
  estimatedMinutes: 15,
  source: {
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    experiencePin: {
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
    },
  },
  participants: { min: 2, max: 2, required: 2 },
  privatePreparation: [
    {
      fieldKey: "campo-uno",
      label: "Campo de prueba uno",
      kind: "SHORT_TEXT",
      maxLength: 200,
    },
    {
      fieldKey: "campo-dos",
      label: "Campo de prueba dos",
      kind: "LONG_TEXT",
      maxLength: 1000,
    },
  ],
  sharing: {
    allowedModes: ["SELECTED_FIELDS", "EDITED_SUMMARY", "KEEP_PRIVATE"],
  },
  reveal: { strategy: "ALL_CONFIRMED" },
  conversation: {
    turns: ["Turno sintético uno.", "Turno sintético dos."],
  },
  outcome: { kind: "AGREEMENT" },
  followUp: { afterHours: 168 },
  safety: {
    level: "LOW",
    privateGateRequired: false,
    doNotSuggestWhen: ["Situación sintética de prueba automatizada."],
  },
  ecoMode: "NONE",
};
