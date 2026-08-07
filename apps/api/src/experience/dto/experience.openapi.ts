/**
 * GR-6 — the published shape of the experience discovery response.
 *
 * Hand-written rather than inferred, for the same reason the Guide's schemas
 * are: the generator would document `type: object` for a scene and the
 * contract would stop saying which twelve panels exist. A closed `oneOf` keyed
 * on `kind` IS the contract; anything looser is a description of it.
 */

import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

const SCENE_BASE = {
  sceneKey: { type: "string" },
  order: { type: "integer", minimum: 1 },
  completesGuideStepKey: { type: "string" },
};

/**
 * The scene payload: everything a renderer needs, and nothing more.
 *
 * `correctOptionKey` is absent by construction — it is not modelled here, so a
 * schema change alone could never start publishing it.
 */
export const EXPERIENCE_SCENE_PAYLOAD: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["title", "body"],
  properties: {
    title: { type: "string" },
    body: { type: "array", items: { type: "string" } },
    note: { type: "string" },
    actionLabel: { type: "string" },
    placeholder: { type: "string" },
    anchorKey: { type: "string" },
    conceptKey: { type: "string" },
    mediaKind: {
      type: "string",
      enum: ["AUDIOBOOK", "PODCAST", "VIDEO"],
    },
    question: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["optionKey", "label"],
        properties: {
          optionKey: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
};

export const EXPERIENCE_SCENE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["sceneKey", "order", "kind", "payload"],
  properties: {
    sceneKey: { type: "string" },
    order: { type: "integer", minimum: 1 },
    kind: {
      type: "string",
      enum: [
        "INTRO",
        "PASSAGE",
        "CONCEPT",
        "EXAMPLE",
        "AUDIO",
        "VIDEO",
        "PRACTICE",
        "REFLECTION",
        "QUESTION",
        "RECALL",
        "SUMMARY",
        "RESONANCE",
      ],
    },
    completesGuideStepKey: { type: "string" },
    payload: EXPERIENCE_SCENE_PAYLOAD,
  },
};

export const EXPERIENCE_DEFINITION: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "experienceKey",
    "experienceVersion",
    "title",
    "guidePin",
    "scenes",
  ],
  properties: {
    experienceKey: { type: "string" },
    experienceVersion: { type: "integer", minimum: 1 },
    title: { type: "string" },
    summary: { type: "string" },
    estimatedMinutes: { type: "integer", minimum: 1 },
    guidePin: {
      type: "object",
      additionalProperties: false,
      required: ["guideKey", "guideVersion"],
      properties: {
        guideKey: { type: "string" },
        guideVersion: { type: "integer", minimum: 1 },
      },
    },
    scenes: { type: "array", items: EXPERIENCE_SCENE },
  },
};

export const EXPERIENCE_DISCOVERY_RESPONSE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: { type: "array", items: EXPERIENCE_DEFINITION },
  },
};
