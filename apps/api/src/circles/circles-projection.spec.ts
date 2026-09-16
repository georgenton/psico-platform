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
    others: [
      {
        participant: seat({
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
        position: 2,
        // Even if a caller wrongly decrypted it, the projection must not use
        // it.
        body: JSON.stringify({
          mode: "SELECTED_FIELDS",
          fields: [{ fieldKey: "campo-a", value: SECRET }],
        }),
      },
    ],
    readyCount: 1,
    artifact: null,
    selfBody: null,
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
      others: [
        { participant: seat({ id: "p-other" }), position: 2, body: null },
      ],
      readyCount: 1,
      artifact: null,
      selfBody: JSON.stringify({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: "lo mio" }],
      }),
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
    others: [
      {
        participant: seat({ id: "p-other", status: "READY" }),
        position: 2,
        body: JSON.stringify({
          mode: "SELECTED_FIELDS",
          fields: [{ fieldKey: "campo-a", value: SECRET }],
        }),
      },
    ],
    readyCount: 2,
    artifact: null,
    selfBody: JSON.stringify({ mode: "KEEP_PRIVATE" }),
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
      others: [
        {
          participant: seat({ id: "p-other", status: "READY" }),
          position: 2,
          body: JSON.stringify({ mode: "KEEP_PRIVATE" }),
        },
      ],
      readyCount: 2,
      artifact: null,
      selfBody: null,
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
      others: [
        {
          participant: seat({ id: "p-other", status: "READY" }),
          position: 2,
          body: JSON.stringify({
            mode: "SELECTED_FIELDS",
            fields: [{ fieldKey: "campo-a", value: SECRET }],
          }),
        },
      ],
      readyCount: 1,
      artifact: null,
      selfBody: null,
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
      others: [{ participant: other, position: 2, body: counterpartBody }],
      readyCount: 2,
      artifact,
      selfBody: null,
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

describe("circles projection · a room of more than two", () => {
  const revealedActivity = activity({
    status: "REVEALED",
    revealedAt: new Date(),
    requiredParticipants: 4,
  });

  /** Three other seats, labelled by their roster position. */
  const room = (bodies: readonly (string | null)[]) =>
    bodies.map((body, index) => ({
      participant: seat({ id: `p-other-${index}`, status: "READY" as const }),
      // The actor holds position 2; the others are 1, 3 and 4.
      position: index === 0 ? 1 : index + 2,
      body,
    }));

  const share = (value: string) =>
    JSON.stringify({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value }],
    });

  it("labels every other seat, and never calls one of them the counterpart", () => {
    const view = projectActivity({
      activity: revealedActivity,
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "READY" }),
      others: room([share("de uno"), share("de tres"), share("de cuatro")]),
      readyCount: 4,
      artifact: null,
      selfBody: JSON.stringify({ mode: "KEEP_PRIVATE" }),
    });

    expect(view.revealed?.participants).toHaveLength(3);
    expect(view.revealed?.participants.map((p) => p.label)).toEqual([
      "Participante 1",
      "Participante 3",
      "Participante 4",
    ]);
    // There is no counterpart in a room of four. A field naming one would have
    // to pick a protagonist out of three people.
    expect(view.revealed?.counterpart).toBeUndefined();
    expect("counterpart" in (view.revealed ?? {})).toBe(false);
  });

  it("keeps the Dúo's counterpart field exactly where it was", () => {
    // The same function, one other seat: the shape a Dúo has always read.
    const view = projectActivity({
      activity: activity({ status: "REVEALED", revealedAt: new Date() }),
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "READY" }),
      others: [
        {
          participant: seat({ id: "p-other", status: "READY" }),
          position: 2,
          body: share("lo del otro"),
        },
      ],
      readyCount: 2,
      artifact: null,
      selfBody: null,
    });
    expect(view.revealed?.counterpart).toEqual({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value: "lo del otro" }],
    });
    expect(view.revealed?.participants).toHaveLength(1);
  });

  it("reports the room by its least advanced seat, not seat by seat", () => {
    // Before the reveal, a list of per-seat statuses is a list of who is late.
    // One value says the only thing anybody can act on.
    const waiting = projectActivity({
      activity: activity({ requiredParticipants: 4 }),
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "READY" }),
      others: [
        {
          participant: seat({ id: "p-a", status: "READY" }),
          position: 1,
          body: null,
        },
        {
          participant: seat({ id: "p-b", status: "ACCEPTED" }),
          position: 3,
          body: null,
        },
        {
          participant: seat({ id: "p-c", status: "READY" }),
          position: 4,
          body: null,
        },
      ],
      readyCount: 3,
      artifact: null,
      selfBody: null,
    });
    expect(waiting.counterpart).toEqual({ status: "ACCEPTED" });
    // One key. Not a list, not a count of who is done, not a name.
    expect(Object.keys(waiting.counterpart)).toEqual(["status"]);
    expect(JSON.stringify(waiting)).not.toContain("p-b");
  });

  it("does not report the room as withdrawn because one person left", () => {
    // A seat that stepped out is not a seat the room is waiting for, and
    // ranking it first would tell everybody else that somebody left.
    const view = projectActivity({
      activity: activity({ requiredParticipants: 3 }),
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "ACCEPTED" }),
      others: [
        {
          participant: seat({ id: "p-a", status: "WITHDRAWN" }),
          position: 1,
          body: null,
        },
        {
          participant: seat({ id: "p-b", status: "ACCEPTED" }),
          position: 3,
          body: null,
        },
      ],
      readyCount: 0,
      artifact: null,
      selfBody: null,
    });
    expect(view.counterpart.status).toBe("ACCEPTED");
  });

  it("suppresses the whole room for a seat that may not read it", () => {
    for (const status of ["ACCEPTED", "WITHDRAWN", "INVITED"] as const) {
      const view = projectActivity({
        activity: revealedActivity,
        definition: DEFINITION,
        self: seat({ id: "p-self", status }),
        others: room([share("de uno"), share("de tres"), share("de cuatro")]),
        readyCount: 3,
        artifact: null,
        selfBody: null,
      });
      // Not "three empty entries" and not a length to count: no `revealed`.
      expect(view.revealed, status).toBeNull();
      expect(JSON.stringify(view), status).not.toContain("de tres");
    }
  });

  it("omits a seat it could not read rather than reporting an empty one", () => {
    // One unreadable envelope in a room of four must not become a labelled
    // entry with nothing in it — that would say "Participante 3 shared
    // something you cannot see", which is not true and not anybody's business.
    const view = projectActivity({
      activity: revealedActivity,
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "READY" }),
      others: room([share("de uno"), null, share("de cuatro")]),
      readyCount: 4,
      artifact: null,
      selfBody: null,
    });
    expect(view.revealed?.participants.map((p) => p.label)).toEqual([
      "Participante 1",
      "Participante 4",
    ]);
  });

  it("carries no forbidden key for a room of four", () => {
    const view = projectActivity({
      activity: revealedActivity,
      definition: DEFINITION,
      self: seat({ id: "p-self", status: "READY" }),
      others: room([share("de uno"), share("de tres"), share("de cuatro")]),
      readyCount: 4,
      artifact: null,
      selfBody: null,
    });
    const keys = allKeys(JSON.parse(JSON.stringify(view)));
    for (const forbidden of CIRCLE_VIEW_FORBIDDEN_KEYS) {
      expect([...keys], forbidden).not.toContain(forbidden);
    }
    // And no seat id, which is not on that list because a Dúo never had a
    // place to put one.
    expect(JSON.stringify(view)).not.toContain("p-other-0");
  });
});
