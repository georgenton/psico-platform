import { describe, expect, it } from "vitest";
import { CIRCLE_VIEW_FORBIDDEN_KEYS } from "@psico/types";
import type { CircleActivityDefinition } from "@psico/types";
import type { CircleActivityRow } from "./circle-activity.repository";
import type { CircleParticipantRow } from "./circle-participant.repository";
import { projectActivity } from "./circles-projection";

/**
 * The filtered read, checked on the SERIALIZED object.
 *
 * Asserting on the projection's return value would miss the thing that matters:
 * a property can be `undefined` in TypeScript and still be a key somebody added
 * to the type. What reaches the other person is JSON, so JSON is what these
 * tests walk — every key, at every depth, at every stage.
 *
 * The property being defended is stronger than "hidden": before the reveal, the
 * counterpart's selection is ABSENT. Not `null`, not an empty array, not a
 * count. `{ counterpartShare: null }` would tell a reader that such a thing
 * exists, that this is the response without it, and — as the shape grows —
 * roughly how much there is. None of that was consented to.
 */

const DEFINITION: CircleActivityDefinition = {
  templateKey: "fixture-projection",
  templateVersion: 1,
  status: "PUBLISHED",
  audience: "DUO_ADULT",
  title: "Plantilla",
  summary: "Resumen sintetico.",
  estimatedMinutes: 20,
  source: { bookSlug: "libro", chapterOrder: 1 },
  participants: { min: 2, max: 2, required: 2 },
  privatePreparation: [
    { fieldKey: "campo-a", label: "A", kind: "SHORT_TEXT", maxLength: 100 },
  ],
  sharing: { allowedModes: ["SELECTED_FIELDS", "KEEP_PRIVATE"] },
  reveal: { strategy: "ALL_CONFIRMED" },
  conversation: { turns: ["Uno."] },
  outcome: { kind: "AGREEMENT" },
  safety: { level: "LOW", privateGateRequired: false, doNotSuggestWhen: [] },
  ecoMode: "NONE",
};

const activity = (
  over: Partial<CircleActivityRow> = {},
): CircleActivityRow => ({
  id: "act-1",
  circleId: "c-1",
  templateKey: DEFINITION.templateKey,
  templateVersion: 1,
  status: "PREPARING",
  requiredParticipants: 2,
  revealedAt: null,
  followUpDueAt: null,
  closedAt: null,
  cancelledAt: null,
  ...over,
});

const seat = (
  over: Partial<CircleParticipantRow> = {},
): CircleParticipantRow => ({
  id: "p-1",
  activityId: "act-1",
  circleId: "c-1",
  memberId: "m-1",
  invitationId: null,
  status: "ACCEPTED",
  sharingMode: null,
  fieldKeys: [],
  ciphertext: null,
  nonce: null,
  keyVersion: null,
  payloadHash: null,
  readyAt: null,
  followUpDecision: null,
  ...over,
});

/** Every key in the serialized object, at every depth. */
function allKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, found);
    return found;
  }
  if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      allKeys(v, found);
    }
  }
  return found;
}

const SECRET = "lo que la otra persona escribió";

describe("circles projection · before the reveal", () => {
  const view = projectActivity({
    activity: activity(),
    definition: DEFINITION,
    self: seat({ id: "p-self" }),
    counterpart: seat({
      id: "p-other",
      status: "READY",
      sharingMode: "SELECTED_FIELDS",
      fieldKeys: ["campo-a"],
      ciphertext: "ct",
      nonce: "n",
      keyVersion: 1,
      payloadHash: "hash",
      readyAt: new Date(),
    }),
    readyCount: 1,
    artifact: null,
    selfBody: null,
    // Even if a caller wrongly decrypted it, the projection must not use it.
    counterpartBody: JSON.stringify({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value: SECRET }],
    }),
  });
  const json = JSON.parse(JSON.stringify(view));

  it("does not serialize the counterpart's content, even when handed it", () => {
    // The stronger property: the facade does not decrypt it, AND the projection
    // would not use it if it did. Two independent gates on the one promise.
    expect(JSON.stringify(json)).not.toContain(SECRET);
    expect(json.revealed).toBeNull();
  });

  it("says only whether the counterpart has finished", () => {
    expect(json.counterpart).toEqual({ status: "READY" });
    // Not when, not how many fields, not how long.
    expect(Object.keys(json.counterpart)).toEqual(["status"]);
  });

  it("carries none of the forbidden keys, at any depth", () => {
    const keys = allKeys(json);
    for (const forbidden of CIRCLE_VIEW_FORBIDDEN_KEYS) {
      expect([...keys], forbidden).not.toContain(forbidden);
    }
  });

  it("lets the actor read back their OWN confirmed selection", () => {
    // The barrier is about the other person's answer, not about your own.
    const own = projectActivity({
      activity: activity(),
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "READY" }),
      counterpart: seat({ id: "p-other" }),
      readyCount: 1,
      artifact: null,
      selfBody: JSON.stringify({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: "lo mio" }],
      }),
      counterpartBody: null,
    });
    expect(own.you.confirmed).toEqual({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value: "lo mio" }],
    });
  });
});

describe("circles projection · after the reveal", () => {
  const revealed = projectActivity({
    activity: activity({ status: "REVEALED", revealedAt: new Date() }),
    definition: DEFINITION,
    self: seat({ id: "p-self", status: "READY" }),
    counterpart: seat({ id: "p-other", status: "READY" }),
    readyCount: 2,
    artifact: null,
    selfBody: JSON.stringify({ mode: "KEEP_PRIVATE" }),
    counterpartBody: JSON.stringify({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value: SECRET }],
    }),
  });

  it("delivers the counterpart's content to a participant still in it", () => {
    expect(revealed.revealed?.counterpart).toEqual({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value: SECRET }],
    });
  });

  it("still carries none of the forbidden keys", () => {
    const keys = allKeys(JSON.parse(JSON.stringify(revealed)));
    for (const forbidden of CIRCLE_VIEW_FORBIDDEN_KEYS) {
      expect([...keys], forbidden).not.toContain(forbidden);
    }
  });

  it("reports KEEP_PRIVATE as a fact with no reason attached", () => {
    const view = projectActivity({
      activity: activity({ status: "REVEALED", revealedAt: new Date() }),
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "READY" }),
      counterpart: seat({ id: "p-other", status: "READY" }),
      readyCount: 2,
      artifact: null,
      selfBody: null,
      counterpartBody: JSON.stringify({ mode: "KEEP_PRIVATE" }),
    });
    expect(view.revealed?.counterpart).toEqual({
      mode: "KEEP_PRIVATE",
      sharedNothing: true,
    });
    // Exactly two keys: what happened, and nothing else. No `reason`, no
    // `message`, no `at`.
    expect(Object.keys(view.revealed!.counterpart)).toEqual([
      "mode",
      "sharedNothing",
    ]);
  });

  it("stops serving revealed content to somebody who withdrew", () => {
    const view = projectActivity({
      activity: activity({ status: "CLOSED", revealedAt: new Date() }),
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "WITHDRAWN" }),
      counterpart: seat({ id: "p-other", status: "READY" }),
      readyCount: 1,
      artifact: null,
      selfBody: null,
      counterpartBody: JSON.stringify({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: SECRET }],
      }),
    });
    // Leaving revokes FUTURE access, and "future" includes the next read. It
    // cannot un-see what was already read, and nothing here pretends it can.
    expect(view.revealed).toBeNull();
    expect(JSON.stringify(view)).not.toContain(SECRET);
  });
});

describe("circles projection · entitlement is decided from the seat's own row", () => {
  const revealed = activity({ status: "REVEALED", revealedAt: new Date() });
  const other = seat({
    id: "p-other",
    status: "READY",
    sharingMode: "SELECTED_FIELDS",
    fieldKeys: ["campo-a"],
    ciphertext: "ct",
    nonce: "n",
    keyVersion: 1,
    payloadHash: "hash",
    readyAt: new Date(),
  });
  const counterpartBody = JSON.stringify({
    mode: "SELECTED_FIELDS",
    fields: [{ fieldKey: "campo-a", value: SECRET }],
  });
  const artifact = {
    id: "art-1",
    version: 1,
    status: "PROPOSED" as const,
    body: "el resultado compartido",
    confirmations: 1,
    confirmedByYou: false,
  };

  /**
   * Every case below hands the projection bodies it should NOT serve.
   *
   * That is deliberate and it is the whole point of these tests. In production
   * the facade refuses to decrypt for an unentitled seat, so `counterpartBody`
   * arrives `null` — which means a bug in the facade would go unnoticed by any
   * test that mirrors the facade's own behaviour. The projection is the last
   * thing between a decrypted sentence and the network, so it is asked the
   * hostile question directly: given the plaintext, do you still refuse?
   */
  const project = (self: CircleParticipantRow) =>
    projectActivity({
      activity: revealed,
      definition: DEFINITION,
      self,
      counterpart: other,
      readyCount: 2,
      artifact,
      selfBody: null,
      counterpartBody,
    });

  it("serves the reveal and the artifact to a READY seat", () => {
    const view = project(seat({ id: "p-self", status: "READY" }));
    expect(JSON.stringify(view)).toContain(SECRET);
    expect(view.artifact?.body).toBe("el resultado compartido");
  });

  it("suppresses both for a WITHDRAWN seat, even handed the plaintext", () => {
    const view = project(seat({ id: "p-self", status: "WITHDRAWN" }));
    expect(view.revealed, "no counterpart share").toBeNull();
    expect(view.artifact, "and no shared result either").toBeNull();
    expect(
      JSON.stringify(view),
      "the sentence appears nowhere in the response",
    ).not.toContain(SECRET);
    expect(JSON.stringify(view)).not.toContain("el resultado compartido");
  });

  it("suppresses both for an ACCEPTED seat that never confirmed", () => {
    // The reveal is a trade. `ACCEPTED` after the barrier means a seat with
    // no confirmed snapshot — it either never confirmed, or its envelope was
    // purged when the counterpart withdrew. Reading the other person's answer
    // from that position is receiving without giving.
    const view = project(seat({ id: "p-self", status: "ACCEPTED" }));
    expect(view.revealed).toBeNull();
    expect(view.artifact).toBeNull();
    expect(JSON.stringify(view)).not.toContain(SECRET);
  });

  it("suppresses both for INVITED and DECLINED seats", () => {
    for (const status of ["INVITED", "DECLINED"] as const) {
      const view = project(seat({ id: "p-self", status }));
      expect(view.revealed, status).toBeNull();
      expect(view.artifact, status).toBeNull();
      expect(JSON.stringify(view), status).not.toContain(SECRET);
    }
  });

  it("leaks no forbidden key in any of those states", () => {
    for (const status of [
      "READY",
      "ACCEPTED",
      "WITHDRAWN",
      "INVITED",
      "DECLINED",
    ] as const) {
      const keys = allKeys(
        JSON.parse(JSON.stringify(project(seat({ id: "p-self", status })))),
      );
      for (const forbidden of CIRCLE_VIEW_FORBIDDEN_KEYS) {
        expect(keys.has(forbidden), `${status}: ${forbidden}`).toBe(false);
      }
    }
  });
});
