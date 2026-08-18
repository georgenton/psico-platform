import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { guideStartLockKeys } from "./guide-active-capability";

/**
 * C.0A — ratchet: every Guide command transaction STATES its isolation level.
 *
 * The cross-lineage idempotency contract depends on it. Two STARTs for
 * different guides share no start lock, so they are resolved by the receipt's
 * `UNIQUE(userId, idempotencyKey)`: the loser blocks on the index, then
 * re-reads the row the winner committed and raises the canonical conflict.
 * That re-read only sees the winner's row under READ COMMITTED, where each
 * statement takes a fresh snapshot. Under REPEATABLE READ the loser would read
 * its own older snapshot, find nothing, and report a storage failure instead —
 * still fail-closed, but a different public contract.
 *
 * Nothing in the code requested a level before C.0A, so that contract rested
 * on whatever the engine or a pooler defaulted to. A normative promise should
 * not be one server parameter away from meaning something else.
 *
 * The receipt key is transversal across command types, so this covers BOTH
 * transactions — a STEP and a CANCEL sharing a key race exactly like two
 * STARTs do.
 */

const SERVICE = join(process.cwd(), "src/guide/guide-lifecycle.service.ts");

const source = () => readFileSync(SERVICE, "utf8");

describe("ratchet · Guide command transaction isolation", () => {
  it("the lifecycle opens exactly two interactive transactions", () => {
    // Five commands, two transactions: START owns one, and the shared
    // `mutate()` helper owns the other for step-complete, recall, cancel and
    // session-complete. A third would be an uncovered command.
    const opens = source().match(/this\.prisma\.\$transaction\(/g) ?? [];
    expect(opens).toHaveLength(2);
  });

  it("both request ReadCommitted explicitly", () => {
    const stated =
      source().match(
        /isolationLevel:\s*Prisma\.TransactionIsolationLevel\.ReadCommitted/g,
      ) ?? [];
    expect(stated).toHaveLength(2);
  });

  it("Prisma is imported as a VALUE, so the level is not erased at build", () => {
    // `import type { Prisma }` compiles and then vanishes: the option would be
    // silently undefined at runtime and the transaction would fall back to the
    // server default — the exact thing this ratchet exists to prevent.
    expect(source()).not.toMatch(
      /import type \{ Prisma \} from "@prisma\/client"/,
    );
    expect(source()).toMatch(/import \{ Prisma \} from "@prisma\/client"/);
  });
});

describe("ratchet · the arbitrary ACTIVE read is gone", () => {
  it("no caller asks for 'the' active session of a user", () => {
    // `findActive(userId)` was an unordered `findFirst` over rows the database
    // was assumed to hold at most one of. Once two lineages can be ACTIVE it
    // returns an arbitrary one, and START would cancel whichever came back.
    const repo = readFileSync(
      join(process.cwd(), "src/guide/guide-session.repository.ts"),
      "utf8",
    );
    expect(repo).not.toMatch(/async findActive\(/);
    expect(source()).not.toMatch(/sessions\.findActive\(/);
  });

  it("the cardinality check cannot be weakened by its caller", () => {
    const repo = readFileSync(
      join(process.cwd(), "src/guide/guide-session.repository.ts"),
      "utf8",
    );
    // A caller-supplied limit of 1 would hide the second row and turn the
    // corruption check into a lie, so the bound belongs to the operation.
    expect(repo).toMatch(/async activeOwnCardinality\(\s*userId: string,/);
    expect(repo).not.toMatch(/activeOwnCardinality\([^)]*limit/);
    expect(repo).toMatch(/take: 2/);
  });
});

describe("ratchet · both start locks, in order", () => {
  it("the start sequence is the lineage key alone", () => {
    // Order is still the deadlock-freedom argument — every actor acquires along
    // the same total order, `lineage < session`, so no pair can build a wait
    // cycle. Since C.0B3 the sequence is one key, and it is asserted on the
    // shared authority because that is what `start()` walks.
    const keys = guideStartLockKeys("u-1", "g-1");
    expect([...keys]).toEqual(["guide:start:u-1:g-1"]);
    // The V0 compatibility key is gone: taking it would re-serialise
    // independent journeys against each other for no remaining reason.
    expect([...keys]).not.toContain("guide:start:u-1");
  });

  it("the capability is read per transaction, never cached", () => {
    const src = source();
    expect(src).toMatch(/readGuideActiveCapability\(tx\)/);
    // A cached authority is a feature flag re-invented: it can disagree with
    // the schema, which is the one thing this design refuses to allow.
    expect(src).not.toMatch(/capabilityCache|cachedCapability/);
  });
});

describe("ratchet · the start-lock sequence has ONE authority", () => {
  const capability = () =>
    readFileSync(
      join(process.cwd(), "src/guide/guide-active-capability.ts"),
      "utf8",
    );

  it("start() walks guideStartLockKeys instead of inlining the keys", () => {
    // A test that rebuilds the sequence by hand proves the hand-built list
    // behaves; it says nothing about production. Iterating the shared
    // authority is what makes the mixed-fleet pg-spec evidence about `start()`.
    const src = source();
    expect(src).toMatch(
      /guideStartLockKeys\(user\.userId, command\.guideKey\)/,
    );
    expect(src).not.toMatch(/this\.lock\(tx, globalStartLockKey\(/);
    expect(src).not.toMatch(/this\.lock\(tx, lineageStartLockKey\(/);
  });

  it("the mixed-fleet pg-spec models each version with its own authority", () => {
    // Since C.0B3, V2 is production (`guideStartLockKeys`) and V1 is the binary
    // being replaced (`c0aStartLockKeys`, retained for exactly this). Both come
    // from real derivations, so "they share the lineage key" is a claim about
    // two functions rather than about a list somebody retyped.
    const spec = readFileSync(
      join(process.cwd(), "src/guide/guide-rolling-deploy-locks.pg-spec.ts"),
      "utf8",
    );
    expect(spec).toMatch(
      /const V1 = \(guideKey: string\) => \[\s*\.\.\.c0aStartLockKeys/,
    );
    expect(spec).toMatch(
      /const V2 = \(guideKey: string\) => \[\s*\.\.\.guideStartLockKeys/,
    );
  });

  it("the authority yields the lineage key, and nothing else", () => {
    const src = capability();
    expect(src).toMatch(
      /guideStartLockKeys[\s\S]{0,400}?\[lineageStartLockKey\(userId, guideKey\)\]/,
    );
  });

  it("the lineage-v2 marker names the protocol this sequence implements", () => {
    // The marker is what the C.0B3 drain gate reads. If the sequence gained a
    // second lock or lost its only one, `lineage-v2` would be a false claim
    // about a deployed box — so the two live in one module and are pinned
    // together.
    expect(capability()).toMatch(
      /GUIDE_START_LOCK_PROTOCOL = "lineage-v2" as const/,
    );
    expect([...guideStartLockKeys("u", "g")]).toHaveLength(1);
  });
});

describe("ratchet · the degraded capability is reported", () => {
  it("start() emits the signal when the schema is odd", () => {
    // Authority and health are separate values precisely so a degraded state
    // keeps serving. Consuming only `effectiveMode` would make that state
    // invisible, and a leftover invalid index can persist for days.
    const src = source();
    expect(src).toMatch(/capability\.degraded/);
    expect(src).toMatch(/GUIDE_ACTIVE_CAPABILITY_DEGRADED/);
  });

  it("the signal carries closed enum values only", () => {
    const src = source();
    const line =
      src.match(/`GUIDE_ACTIVE_CAPABILITY_DEGRADED[^`]*`/)?.[0] ?? "";
    expect(line).toContain("effectiveMode=");
    expect(line).toContain("globalHealth=");
    expect(line).toContain("lineageHealth=");
    // No actor, no catalog key, no statement.
    expect(line).not.toMatch(/userId|guideKey|SELECT|pg_index/);
  });

  it("telemetry cannot break the command", () => {
    // Everything the reporter does is inside a catch: a broken logger must
    // degrade observability and nothing else.
    const src = source();
    const body =
      src.match(/private reportDegradedCapability[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(body).toMatch(/try \{/);
    expect(body).toMatch(/\} catch \{/);
  });
});

describe("ratchet · the capability query is not unsafe-raw", () => {
  it("uses the tagged template, so nothing can be interpolated", () => {
    const src = readFileSync(
      join(process.cwd(), "src/guide/guide-active-capability.ts"),
      "utf8",
    );
    // The call, not the word: the comment above it names the unsafe variant
    // precisely to say why it is not used.
    expect(src).not.toMatch(/\$queryRawUnsafe\(/);
    expect(src).toMatch(/\$queryRaw<IndexRow\[\]>`/);
  });
});

describe("ratchet · the advisory-lock mechanism itself", () => {
  it("uses pg_advisory_xact_lock over hashtextextended with seed 42", () => {
    // Sharing the KEY STRING with V0 is only half the guarantee. Two versions
    // also have to hash it the same way and take the same kind of lock: a
    // different function, a different seed, or a session-scoped lock instead
    // of a transaction-scoped one, and the mixed fleet silently stops
    // serialising while every string still matches.
    //
    // A source ratchet rather than a moved helper: the point is that changing
    // any of these three is a deliberate protocol change, not a refactor.
    const src = source();
    expect(src).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(\$\{key\}, 42\)\)/,
    );
    // Transaction-scoped only: a session lock would outlive the transaction
    // and leak across pooled connections.
    expect(src).not.toMatch(/pg_advisory_lock\(/);
    expect(src).not.toMatch(/pg_try_advisory/);
  });

  it("the mixed-fleet pg-spec locks the same way", () => {
    // If the spec hashed differently it would prove serialisation between two
    // things neither of which is production.
    const spec = readFileSync(
      join(process.cwd(), "src/guide/guide-rolling-deploy-locks.pg-spec.ts"),
      "utf8",
    );
    expect(spec).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(\$1, 42\)\)/,
    );
  });
});
