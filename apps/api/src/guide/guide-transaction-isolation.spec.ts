import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  it("START takes the global compatibility lock before the lineage lock", () => {
    const src = source();
    const global = src.indexOf("globalStartLockKey(user.userId)");
    const lineage = src.indexOf("lineageStartLockKey(user.userId");
    expect(global).toBeGreaterThan(-1);
    expect(lineage).toBeGreaterThan(-1);
    // Order is the deadlock-freedom argument: every actor acquires along the
    // same total order, so no pair can build a wait cycle.
    expect(global).toBeLessThan(lineage);
  });

  it("the capability is read per transaction, never cached", () => {
    const src = source();
    expect(src).toMatch(/readGuideActiveCapability\(tx\)/);
    // A cached authority is a feature flag re-invented: it can disagree with
    // the schema, which is the one thing this design refuses to allow.
    expect(src).not.toMatch(/capabilityCache|cachedCapability/);
  });
});
