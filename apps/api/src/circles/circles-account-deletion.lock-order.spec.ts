import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CirclesAccountDeletionService } from "./circles-account-deletion.service";

/**
 * The canonical lock order, pinned as a SEQUENCE.
 *
 * The real-PostgreSQL spec proves the deletion serialises against a concurrent
 * guest command — it waits rather than corrupting anything. What it cannot
 * prove is the ORDER the locks are taken in: PostgreSQL row locks make the two
 * transactions queue whether or not this service asks for them in the agreed
 * sequence, so removing a lock entirely leaves that test green.
 *
 * Order is what buys deadlock freedom, and deadlock needs two parties
 * disagreeing — which is precisely what a single test cannot stage
 * deterministically without inverting one side itself and guaranteeing the
 * deadlock it claims to detect.
 *
 * So it is pinned here instead, at the only place it is unambiguous: the
 * sequence of lock acquisitions. The repositories are recorders, the
 * transaction is a stub, and the assertion is the documented order:
 *
 *   1 CircleMember → 2 CircleInvitation → 3 CircleGuestSession → 4 CircleActivity
 *
 * This is the inversion that actually happened once: the first cut took the
 * ACTIVITY first and only then invitations and guest sessions, which deadlocks
 * against a guest redeeming an invitation.
 *
 * ── Steps 2 and 3 moved, and the assertion moved with them ────────────────
 *
 * Those two sets are now taken by `lockActivityAccessRows`, the one place
 * that order is written down and the same call the sweep and the
 * participation service make. So this pins the SET acquisitions rather than a
 * per-row loop, and "lowest id first" is asserted where it now lives: the
 * repositories\' `ORDER BY "id"`, checked below against the SQL itself.
 */

type Acquisition = { kind: string; id: string };

function buildService() {
  const order: Acquisition[] = [];
  const record = (kind: string) => async (id: string) => {
    order.push({ kind, id });
    // The activity lock is the only one whose return value is read.
    return kind === "activity"
      ? { id, circleId: "circle-1", status: "PREPARING" }
      : { id };
  };

  const members = { lockById: record("member") };
  const invitations = {
    // The SET, in one statement, ordered by the repository's own SQL.
    lockForActivity: record("invitation"),
    // Not part of the ordering assertion; present so the method can proceed.
    cancelOpenForActivity: async () => 0,
  };
  const guestSessions = {
    lockForActivity: record("guestSession"),
    revokeForActivity: async () => 0,
  };
  const activities = {
    lockById: record("activity"),
    close: async () => undefined,
    cancel: async () => undefined,
  };
  const participants = {
    // `withdraw` returning false ends the method right after the locks, which
    // is all this test is about — and keeps the stub honest rather than
    // pretending to carry out an end-to-end teardown.
    withdraw: async () => false,
  };
  const events = { append: async () => undefined };

  const service = new CirclesAccountDeletionService(
    participants as never,
    activities as never,
    events as never,
    members as never,
    invitations as never,
    guestSessions as never,
  );

  // The service no longer reads these itself — the repositories do, inside
  // their locking statement — but the stub keeps them so a regression that
  // reintroduces a service-side read fails loudly rather than silently.
  const tx = {
    circleInvitation: {
      findMany: async () => [{ id: "inv-a" }, { id: "inv-b" }],
    },
    circleGuestSession: {
      findMany: async () => [{ id: "ses-a" }, { id: "ses-b" }],
    },
  };

  return { service, order, tx };
}

/** `endOne` is private; the order it takes is the public promise. */
function endOne(service: CirclesAccountDeletionService, tx: unknown) {
  const seat = {
    id: "seat-1",
    activityId: "act-1",
    memberId: "mem-1",
    activity: { id: "act-1", circleId: "circle-1", status: "PREPARING" },
  };
  return (
    service as unknown as {
      endOne: (s: typeof seat, t: unknown) => Promise<unknown>;
    }
  ).endOne(seat, tx);
}

describe("the deletion takes locks in the canonical order", () => {
  it("takes member → invitations → guest sessions → activity", async () => {
    const { service, order, tx } = buildService();

    await endOne(service, tx);

    expect(order.map((a) => a.kind)).toEqual([
      "member",
      "invitation",
      "guestSession",
      "activity",
    ]);
    // Each set is asked for BY ACTIVITY, in one statement — not row by row
    // from a list the service assembled.
    expect(order.filter((a) => a.kind !== "member").map((a) => a.id)).toEqual([
      "act-1",
      "act-1",
      "act-1",
    ]);
  });

  it("never takes the activity before an invitation or a guest session", async () => {
    const { service, order, tx } = buildService();

    await endOne(service, tx);

    const activityAt = order.findIndex((a) => a.kind === "activity");
    const lastInvitation = order.map((a) => a.kind).lastIndexOf("invitation");
    const lastSession = order.map((a) => a.kind).lastIndexOf("guestSession");

    // The inversion that deadlocks against a guest redeeming an invitation:
    // this transaction holding the activity while it wants an invitation, and
    // the guest holding the invitation while it wants the activity.
    expect(activityAt).toBeGreaterThan(lastInvitation);
    expect(activityAt).toBeGreaterThan(lastSession);
  });

  it("takes each set lowest id first, so two deletions queue instead of interleaving", () => {
    // Now a property of the repositories' locking statement rather than of a
    // loop here: `ORDER BY "id"` is what makes two transactions walk the same
    // rows the same way. Asserted against the SQL because that is where it
    // is, and because a mock cannot reorder rows it never returns.
    const sqlOf = (file: string) => readFileSync(join(__dirname, file), "utf8");
    for (const file of [
      "circle-invitation.repository.ts",
      "circle-guest-session.repository.ts",
    ]) {
      const source = sqlOf(file);
      // A window rather than brace-matching: the statement is a tagged
      // template, so the first `}` inside it belongs to an interpolation.
      const at = source.indexOf("async lockForActivity");
      const body = source.slice(at, at + 900);
      expect(body, `${file} locks a whole activity`).toContain(
        'WHERE "activityId"',
      );
      expect(body, `${file} takes them in id order`).toContain('ORDER BY "id"');
      expect(body, `${file} actually locks`).toContain("FOR UPDATE");
    }
  });
});
