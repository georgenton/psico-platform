import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  seedTherapists,
  type TherapistSeedClient,
} from "../../prisma/seed-therapists";

/**
 * The seed must not overwrite a schedule somebody is operating.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * The availability pass used to be `deleteMany({ therapistId })` followed by
 * reinserting the eight canonical slots, in the name of idempotence. It IS
 * idempotent against the constants in the file, and destructive against
 * everything else — and the comment two lines above it said availability is
 * "tunable per therapist later via ops UI", so a rerun discarded exactly the
 * thing ops is expected to change.
 *
 * It survived review because the only observable signal was the row COUNT, and
 * the count is identical whether eight rows were preserved or deleted and
 * rewritten. So these tests watch the CALL SEQUENCE instead. `recorder()` has no
 * `deleteMany` at all — neither does `TherapistSeedClient` — so restoring the
 * old version fails to compile before it can fail a test.
 *
 * ── The deliberate gap ───────────────────────────────────────────────────
 *
 * A PARTIAL schedule (1..7 rows) is preserved too, not completed. There is no
 * metadata that distinguishes "an interrupted seed" from "ops deleted the Friday
 * afternoon slot", and guessing wrong in the completing direction silently
 * reinstates a slot somebody removed on purpose. Repairing a genuinely broken
 * schedule is a separate, explicit administrative operation. The test below pins
 * that choice so it stays a choice.
 */

type Call =
  | { readonly op: "therapist.upsert"; readonly id: string }
  | { readonly op: "availability.count"; readonly therapistId: string }
  | {
      readonly op: "availability.create";
      readonly therapistId: string;
      readonly dayOfWeek: number;
      readonly startMin: number;
      readonly endMin: number;
    };

/**
 * A client that records what it was asked to do.
 *
 * `existing` is how many availability rows each therapist already has — the one
 * input the preservation rule reads.
 */
function recorder(existing: Record<string, number> = {}) {
  const calls: Call[] = [];

  const client: TherapistSeedClient = {
    therapist: {
      async upsert(args: unknown) {
        const where = (args as { where: { id: string } }).where;
        calls.push({ op: "therapist.upsert", id: where.id });
        return {};
      },
    },
    therapistAvailability: {
      async count({ where }) {
        calls.push({
          op: "availability.count",
          therapistId: where.therapistId,
        });
        return existing[where.therapistId] ?? 0;
      },
      async create({ data }) {
        calls.push({
          op: "availability.create",
          therapistId: data.therapistId,
          dayOfWeek: data.dayOfWeek,
          startMin: data.startMin,
          endMin: data.endMin,
        });
        return {};
      },
    },
  };

  return { calls, client };
}

const createsFor = (calls: Call[], therapistId: string) =>
  calls.filter(
    (c) => c.op === "availability.create" && c.therapistId === therapistId,
  );

/** Every therapist the catalog defines, discovered rather than hardcoded. */
async function therapistIds(): Promise<string[]> {
  const { calls, client } = recorder();
  await seedTherapists(client);
  return calls.filter((c) => c.op === "therapist.upsert").map((c) => c.id);
}

describe("seed · therapist availability is preserved, not rewritten", () => {
  it("seeds the canonical schedule for a therapist who has none", () => {
    // The case the seed is actually for: a fresh database.
    const { calls, client } = recorder();
    return seedTherapists(client).then(() => {
      const created = createsFor(calls, "t_marina");
      expect(created).toHaveLength(8);

      // Mon/Wed/Fri morning + afternoon, Tue/Thu afternoon.
      expect(
        created.map((c) => [c.dayOfWeek, c.startMin, c.endMin]),
      ).toStrictEqual([
        [1, 540, 780],
        [1, 900, 1140],
        [3, 540, 780],
        [3, 900, 1140],
        [5, 540, 780],
        [5, 900, 1140],
        [2, 840, 1140],
        [4, 840, 1140],
      ]);
    });
  });

  it("writes nothing on a rerun — the second run is a no-op for availability", async () => {
    const ids = await therapistIds();
    expect(ids.length).toBeGreaterThan(0);

    // Second run: everyone already has the eight canonical rows.
    const { calls, client } = recorder(
      Object.fromEntries(ids.map((id) => [id, 8])),
    );
    await seedTherapists(client);

    expect(calls.filter((c) => c.op === "availability.create")).toHaveLength(0);
    // It still LOOKS at each one — the decision is made per therapist, from the
    // database, not from a flag or an environment guess.
    expect(calls.filter((c) => c.op === "availability.count")).toHaveLength(
      ids.length,
    );
  });

  it("preserves a schedule ops customized, exactly", async () => {
    // The regression that matters. Ops widened Marina's week to 12 slots; the
    // seed must not touch it, and must not "reconcile" it back to eight.
    const { calls, client } = recorder({ t_marina: 12 });
    await seedTherapists(client);

    expect(createsFor(calls, "t_marina")).toHaveLength(0);
    // And it is not a blanket skip: the others still get seeded.
    const others = (await therapistIds()).filter((id) => id !== "t_marina");
    for (const id of others) {
      expect(createsFor(calls, id)).toHaveLength(8);
    }
  });

  it("does NOT complete a partial schedule", async () => {
    // One row left — an interrupted seed, or ops pruning a week down to a single
    // slot. Indistinguishable from here, so it is left alone. If this ever flips
    // to "fill the gaps", it reinstates slots somebody deleted on purpose.
    for (const existing of [1, 3, 7]) {
      const { calls, client } = recorder({ t_marina: existing });
      await seedTherapists(client);
      expect(createsFor(calls, "t_marina")).toHaveLength(0);
    }
  });

  it("counts BEFORE it creates, for every therapist", async () => {
    const { calls, client } = recorder();
    await seedTherapists(client);

    // Ordering is the guarantee: a create that precedes its own count would be
    // writing before it had looked.
    for (const id of await therapistIds()) {
      const firstCount = calls.findIndex(
        (c) => c.op === "availability.count" && c.therapistId === id,
      );
      const firstCreate = calls.findIndex(
        (c) => c.op === "availability.create" && c.therapistId === id,
      );
      expect(firstCount).toBeGreaterThanOrEqual(0);
      expect(firstCreate).toBeGreaterThan(firstCount);
    }
  });

  it("upserts the therapist row itself on every run", async () => {
    // Deliberately NOT preserved: name, bio and specialties are curated catalog
    // content, which is what a catalog seed is for. Only the SCHEDULE is
    // operational state. Keeping the distinction visible is the point.
    const ids = await therapistIds();
    const { calls, client } = recorder(
      Object.fromEntries(ids.map((id) => [id, 8])),
    );
    await seedTherapists(client);

    expect(calls.filter((c) => c.op === "therapist.upsert")).toHaveLength(
      ids.length,
    );
  });
});

describe("seed · therapist availability source ratchet", () => {
  const RAW = readFileSync(
    fileURLToPath(new URL("../../prisma/seed-therapists.ts", import.meta.url)),
    "utf8",
  );

  /**
   * Comments stripped, so the ratchet reads CODE.
   *
   * The module documents the destructive version it replaced, by name, right
   * where the decision lives — which is where that explanation is worth most. A
   * ratchet that had to tolerate the word anywhere in the file would be a weaker
   * ratchet; one that cannot mention it in prose loses the rationale. Stripping
   * comments keeps it absolute on the executable text and free in the margin.
   */
  const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  /**
   * The negative control, as a ratchet.
   *
   * The tests above are the real guard: restoring `deleteMany` would make
   * "preserves a schedule ops customized" fail, because a delete would have to
   * go through a client that does not have one. This asserts the absence
   * directly as well, so the failure names the cause instead of surfacing as a
   * type error about a missing method.
   */
  it("contains no delete of any kind", () => {
    expect(SRC).not.toMatch(/deleteMany/);
    expect(SRC).not.toMatch(/\.delete\(/);
    // And the stripping is doing real work, not silently emptying the file.
    expect(SRC).toMatch(/seedTherapists/);
    expect(RAW).toMatch(/deleteMany/); // only in the explanation
  });

  it("decides from a count of existing rows", () => {
    expect(SRC).toMatch(/therapistAvailability\.count\(/);
    expect(SRC).toMatch(/existingSlots > 0/);
  });

  it("the narrowed client type offers no way to delete", () => {
    // The type-level half. A restored `deleteMany` does not compile against
    // `TherapistSeedClient`, so it cannot reach a test run at all.
    const iface = SRC.slice(
      SRC.indexOf("export interface TherapistSeedClient"),
      SRC.indexOf("export async function seedTherapists"),
    );
    expect(iface).not.toMatch(/delete/i);
    expect(iface).toMatch(/count\(/);
    expect(iface).toMatch(/create\(/);
  });
});
