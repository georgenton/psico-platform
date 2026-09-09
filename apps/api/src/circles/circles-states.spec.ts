import { describe, expect, it } from "vitest";
import {
  CIRCLE_ACTIVITY_STATUSES,
  CIRCLE_ACTIVITY_TERMINAL_STATUSES,
  CIRCLE_ACTIVITY_TRANSITIONS,
  CIRCLE_PARTICIPANT_STATUSES,
  CIRCLE_PARTICIPANT_TERMINAL_STATUSES,
  CIRCLE_PARTICIPANT_TRANSITIONS,
} from "@psico/types";
import type {
  CircleActivityStatus,
  CircleParticipantStatus,
} from "@psico/types";

/**
 * The two state machines, checked as GRAPHS rather than as a list of cases.
 *
 * A transition table is easy to extend by accident: somebody adds an edge for
 * a product reason and nobody notices it also made a cancelled activity
 * reachable again. These tests assert the shape of the whole graph — what is
 * terminal, what is reachable, what is deterministic — so a new edge has to
 * survive the properties, not just compile.
 *
 * PR3 implements the transitions. This cut only fixes which ones exist.
 */

const activityEdges = (from: CircleActivityStatus) =>
  CIRCLE_ACTIVITY_TRANSITIONS.filter((t) => t.from === from);

describe("circles · activity state machine", () => {
  it("only references declared statuses", () => {
    for (const t of CIRCLE_ACTIVITY_TRANSITIONS) {
      expect(CIRCLE_ACTIVITY_STATUSES, t.trigger).toContain(t.from);
      expect(CIRCLE_ACTIVITY_STATUSES, t.trigger).toContain(t.to);
      expect(t.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("lets nothing leave a terminal state", () => {
    // The invariant that matters most here: a CANCELLED Dúo can never become
    // REVEALED. A withdrawal before reveal is final.
    for (const terminal of CIRCLE_ACTIVITY_TERMINAL_STATUSES) {
      expect(activityEdges(terminal), terminal).toEqual([]);
    }
  });

  it("treats INVITING as the only entry point", () => {
    expect(
      CIRCLE_ACTIVITY_TRANSITIONS.filter((t) => t.to === "INVITING"),
    ).toEqual([]);
  });

  it("is deterministic — one destination per (state, trigger)", () => {
    const seen = new Set<string>();
    for (const t of CIRCLE_ACTIVITY_TRANSITIONS) {
      const key = `${t.from}:${t.trigger}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("reaches every status from INVITING", () => {
    const reached = new Set<CircleActivityStatus>(["INVITING"]);
    for (let i = 0; i < CIRCLE_ACTIVITY_STATUSES.length; i++) {
      for (const t of CIRCLE_ACTIVITY_TRANSITIONS) {
        if (reached.has(t.from)) reached.add(t.to);
      }
    }
    expect([...reached].sort()).toEqual([...CIRCLE_ACTIVITY_STATUSES].sort());
  });

  it("makes reveal a server decision, never a command", () => {
    // Nobody can ask to be revealed. The only edge into REVEALED is the
    // barrier firing inside the transaction that saw the last confirmation.
    const intoRevealed = CIRCLE_ACTIVITY_TRANSITIONS.filter(
      (t) => t.to === "REVEALED",
    );
    expect(intoRevealed).toHaveLength(1);
    expect(intoRevealed[0].from).toBe("PREPARING");
    expect(intoRevealed[0].trigger).toBe("SYSTEM");
  });

  it("lets the organizer retract a pending invitation", () => {
    // Without this edge an activity could be created and then never leave
    // INVITING: the counterpart may simply never answer, and the organizer had
    // no way to take the invitation back. The retraction is terminal, reveals
    // nothing, and asks for no reason.
    const retract = activityEdges("INVITING").find(
      (t) => t.trigger === "WITHDRAW",
    );
    expect(retract).toBeDefined();
    expect(retract?.to).toBe("CANCELLED");
    // Terminal: nothing leaves CANCELLED, so a retracted invitation cannot be
    // revived into a running activity. Covered again by the terminal test.
    expect(activityEdges("CANCELLED")).toEqual([]);
  });

  it("gives WITHDRAW an explicit outcome at every stage", () => {
    // Three stages, three answers, none of them implicit:
    //   INVITING  → CANCELLED  the invitation is retracted before anyone accepted;
    //   PREPARING → CANCELLED  leaving destroys the pending envelopes;
    //   REVEALED  → CLOSED     only future access can be closed, because the
    //                          product must never promise to make another
    //                          person unsee something.
    const outcome = (from: CircleActivityStatus) =>
      activityEdges(from).find((t) => t.trigger === "WITHDRAW")?.to;

    expect(outcome("INVITING")).toBe("CANCELLED");
    expect(outcome("PREPARING")).toBe("CANCELLED");
    expect(outcome("REVEALED")).toBe("CLOSED");

    // And nowhere else: a WITHDRAW edge out of FOLLOW_UP or a terminal state
    // would be a fourth meaning nobody decided.
    const withdrawFrom = CIRCLE_ACTIVITY_TRANSITIONS.filter(
      (t) => t.trigger === "WITHDRAW",
    ).map((t) => t.from);
    expect([...withdrawFrom].sort()).toEqual([
      "INVITING",
      "PREPARING",
      "REVEALED",
    ]);
  });

  it("never lets a confirmation command reach the activity directly", () => {
    // CONFIRM_SHARE moves a PARTICIPANT. The activity moves only when the
    // barrier counts every required participant, which is why it is absent
    // from this table.
    expect(CIRCLE_ACTIVITY_TRANSITIONS.map((t) => t.trigger)).not.toContain(
      "CONFIRM_SHARE",
    );
  });
});

const participantEdges = (from: CircleParticipantStatus) =>
  CIRCLE_PARTICIPANT_TRANSITIONS.filter((t) => t.from === from);

describe("circles · participant state machine", () => {
  it("only references declared statuses and is deterministic", () => {
    const seen = new Set<string>();
    for (const t of CIRCLE_PARTICIPANT_TRANSITIONS) {
      expect(CIRCLE_PARTICIPANT_STATUSES).toContain(t.from);
      expect(CIRCLE_PARTICIPANT_STATUSES).toContain(t.to);
      const key = `${t.from}:${t.trigger}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("lets nothing leave a terminal state", () => {
    for (const terminal of CIRCLE_PARTICIPANT_TERMINAL_STATUSES) {
      expect(participantEdges(terminal), terminal).toEqual([]);
    }
  });

  it("reaches READY only by confirming, and only after accepting", () => {
    const intoReady = CIRCLE_PARTICIPANT_TRANSITIONS.filter(
      (t) => t.to === "READY",
    );
    expect(intoReady).toHaveLength(1);
    expect(intoReady[0]).toMatchObject({
      from: "ACCEPTED",
      trigger: "CONFIRM_SHARE",
    });
  });

  it("never returns anyone to INVITED", () => {
    // Re-inviting is a new invitation, not a rewind. A participant who
    // declined cannot be walked back into the flow.
    expect(
      CIRCLE_PARTICIPANT_TRANSITIONS.filter((t) => t.to === "INVITED"),
    ).toEqual([]);
  });

  it("lets a person leave from every non-terminal state", () => {
    // Leaving must not depend on how far along someone is. If a state existed
    // with no WITHDRAW edge, that state would trap a person inside an activity.
    for (const status of CIRCLE_PARTICIPANT_STATUSES) {
      if (CIRCLE_PARTICIPANT_TERMINAL_STATUSES.includes(status)) continue;
      const exits = participantEdges(status).filter(
        (t) => t.trigger === "WITHDRAW" || t.trigger === "DECLINE_INVITATION",
      );
      expect(exits.length, status).toBeGreaterThan(0);
    }
  });
});
