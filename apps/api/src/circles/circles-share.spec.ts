import { describe, expect, it } from "vitest";
import type { CircleActivityDefinition } from "@psico/types";
import { CIRCLE_SHARE_LIMITS } from "@psico/types";
import {
  canonicalShareBody,
  parseShareBody,
  verifyDecryptedShare,
} from "./circles-share";

/**
 * What happens to a snapshot on the way OUT (PR3 · sections E and F).
 *
 * ── Authentic is not the same as valid ─────────────────────────────────────
 *
 * `open()` proves provenance: these bytes are ours, unmodified, and bound to
 * this exact circle, activity, seat, template pin, mode and field-key set.
 * That is a strong claim and it is not a claim about MEANING. A bug on the way
 * in, a template edited between deployments, or a key rotation that opened a
 * row written under an older shape all produce bytes that authenticate
 * perfectly and are not a valid answer to the question that was asked.
 *
 * Everything below is about the second half: a payload that passes the cipher
 * and still must not be served.
 */

const definition: CircleActivityDefinition = {
  templateKey: "tpl",
  templateVersion: 1,
  status: "PUBLISHED",
  title: "t",
  summary: "s",
  privatePreparation: [
    { fieldKey: "campo-a", prompt: "a", maxLength: 200 },
    { fieldKey: "campo-b", prompt: "b", maxLength: 200 },
  ],
  sharing: {
    allowedModes: ["SELECTED_FIELDS", "EDITED_SUMMARY", "KEEP_PRIVATE"],
  },
  conversation: { turns: 2 },
  outcome: { kind: "AGREEMENT" },
  followUp: null,
} as unknown as CircleActivityDefinition;

const row = (
  over: Partial<{ sharingMode: string | null; fieldKeys: string[] }> = {},
) => ({
  sharingMode: "SELECTED_FIELDS" as string | null,
  fieldKeys: ["campo-a"],
  ...over,
});

describe("circles · a decrypted body is rebuilt as a closed shape", () => {
  it("accepts the three canonical bodies this build produces", () => {
    for (const body of [
      { mode: "KEEP_PRIVATE" as const },
      { mode: "EDITED_SUMMARY" as const, summary: "algo" },
      {
        mode: "SELECTED_FIELDS" as const,
        fields: [{ fieldKey: "campo-a", value: "algo" }],
      },
    ]) {
      expect(parseShareBody(canonicalShareBody(body)), body.mode).toEqual(body);
    }
  });

  it("refuses an extra key on any variant", () => {
    const bodies = [
      { mode: "KEEP_PRIVATE", reason: "no quise" },
      { mode: "KEEP_PRIVATE", privateDraft: "lo que iba a decir" },
      { mode: "EDITED_SUMMARY", summary: "ok", privateDraft: "borrador" },
      { mode: "EDITED_SUMMARY", summary: "ok", extra: 1 },
      {
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: "v" }],
        summary: "no va aquí",
      },
      {
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: "v", note: "extra" }],
      },
    ];
    for (const b of bodies) {
      expect(parseShareBody(JSON.stringify(b)), JSON.stringify(b)).toBeNull();
    }
  });

  it("refuses duplicates, empties and anything past a limit", () => {
    const bodies = [
      // The same question answered twice: whichever a reader picks is
      // arbitrary, so there is no safe reading.
      {
        mode: "SELECTED_FIELDS",
        fields: [
          { fieldKey: "campo-a", value: "uno" },
          { fieldKey: "campo-a", value: "dos" },
        ],
      },
      { mode: "SELECTED_FIELDS", fields: [] },
      { mode: "SELECTED_FIELDS", fields: [{ fieldKey: "", value: "v" }] },
      {
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: " " }],
      },
      {
        mode: "SELECTED_FIELDS",
        fields: [
          {
            fieldKey: "campo-a",
            value: "x".repeat(CIRCLE_SHARE_LIMITS.maxFieldLength + 1),
          },
        ],
      },
      {
        mode: "SELECTED_FIELDS",
        fields: Array.from(
          { length: CIRCLE_SHARE_LIMITS.maxFields + 1 },
          (_, i) => ({ fieldKey: `k${i}`, value: "v" }),
        ),
      },
      { mode: "EDITED_SUMMARY", summary: "" },
      {
        mode: "EDITED_SUMMARY",
        summary: "x".repeat(CIRCLE_SHARE_LIMITS.maxSummaryLength + 1),
      },
    ];
    for (const b of bodies) {
      expect(
        parseShareBody(JSON.stringify(b)),
        JSON.stringify(b).slice(0, 60),
      ).toBeNull();
    }
  });

  it("refuses a non-object, an array and unparseable bytes", () => {
    for (const raw of ['"KEEP_PRIVATE"', "7", "null", "[]", "{", ""]) {
      expect(parseShareBody(raw), raw).toBeNull();
    }
  });
});

describe("circles · a decrypted body is re-checked against template and row", () => {
  const body = canonicalShareBody({
    mode: "SELECTED_FIELDS",
    fields: [{ fieldKey: "campo-a", value: "algo" }],
  });

  it("passes when body, template and row all agree", () => {
    expect(verifyDecryptedShare(body, definition, row())).toEqual({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value: "algo" }],
    });
  });

  it("refuses a field key the pinned template does not declare", () => {
    // The row and the AAD would both agree with this — the template is the
    // only thing that says the question was never asked.
    const foreign = canonicalShareBody({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-ajeno", value: "algo" }],
    });
    expect(
      verifyDecryptedShare(
        foreign,
        definition,
        row({ fieldKeys: ["campo-ajeno"] }),
      ),
    ).toBeNull();
  });

  it("refuses a mode the template does not offer", () => {
    const narrowed = {
      ...definition,
      sharing: { allowedModes: ["KEEP_PRIVATE"] },
    } as unknown as CircleActivityDefinition;
    expect(verifyDecryptedShare(body, narrowed, row())).toBeNull();
  });

  it("refuses when the body's mode disagrees with the stored row", () => {
    // The row and the envelope disagreeing about what somebody confirmed is
    // not a situation with a safe winner.
    expect(
      verifyDecryptedShare(
        body,
        definition,
        row({ sharingMode: "EDITED_SUMMARY" }),
      ),
    ).toBeNull();
    expect(
      verifyDecryptedShare(body, definition, row({ sharingMode: null })),
    ).toBeNull();
  });

  it("refuses when the field keys disagree with the stored row", () => {
    expect(
      verifyDecryptedShare(body, definition, row({ fieldKeys: [] })),
    ).toBeNull();
    expect(
      verifyDecryptedShare(body, definition, row({ fieldKeys: ["campo-b"] })),
    ).toBeNull();
    expect(
      verifyDecryptedShare(
        body,
        definition,
        row({ fieldKeys: ["campo-a", "campo-b"] }),
      ),
    ).toBeNull();
  });

  it("compares field keys as a set, not as a literal ordering", () => {
    const two = canonicalShareBody({
      mode: "SELECTED_FIELDS",
      fields: [
        { fieldKey: "campo-b", value: "b" },
        { fieldKey: "campo-a", value: "a" },
      ],
    });
    expect(
      verifyDecryptedShare(
        two,
        definition,
        row({ fieldKeys: ["campo-b", "campo-a"] }),
      ),
      "row order must not matter",
    ).not.toBeNull();
  });
});
