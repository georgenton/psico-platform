import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EXPERIENCE_BINDING_SHAPE } from "./experience-binding-schema";
import {
  bindingLockKeys,
  preIdentityLockKeys,
  bridgeBindingLockKeys,
  chapterBindingLockKey,
  globalBindingLockKey,
  EXPERIENCE_BINDING_PROTOCOL,
} from "./experience-binding-lock";
import {
  C3C_C4_STATE,
  EXPERIENCE_IDENTITY_BARRIER,
  READER_ANCHOR_BARRIER_ANTECEDENTS,
  PUBLIC_READER_ANCHOR_CONSUMER,
  PUBLIC_READER_ANCHOR_SOURCE,
  READER_ANCHOR_IDENTITY_TASK,
} from "./experience-identity-barrier";
import { BACKFILL_ANOMALY } from "./experience-reservation-backfill";

/**
 * C.3A (#639) — ratchets around the parts of the binding protocol that are
 * only correct because two binaries derive them identically.
 *
 * A lock is not a mechanism you can half-have. If one writer hashes a different
 * string, or takes the keys in a different order, or stops taking one of them,
 * nothing fails loudly — the guarantee simply stops existing. So the derivation
 * lives in one module, and this file pins the module rather than trusting every
 * caller to have copied it right.
 */

const SERVICE = join(
  process.cwd(),
  "src/experience/experience-admin.service.ts",
);
const LOCKS = join(process.cwd(), "src/experience/experience-binding-lock.ts");
const IDENTITY = join(
  process.cwd(),
  "src/experience/experience-chapter-identity.ts",
);
const BACKFILL = join(
  process.cwd(),
  "src/experience/experience-reservation-backfill.ts",
);

const read = (p: string) => readFileSync(p, "utf8");

/**
 * The file with its comments removed.
 *
 * These ratchets assert what the code DOES. A prose block explaining why
 * `ON CONFLICT DO NOTHING` would be wrong must not be mistaken for using it —
 * the whole value of an absence check is that it means what it says.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe("ratchet · the lock protocol", () => {
  it("names the protocol this binary speaks", () => {
    expect(EXPERIENCE_BINDING_PROTOCOL).toBe("experience-binding-v2");
  });

  it("V2 drops the global key and keeps the chapter one", () => {
    // The same narrowing C.0B3 did to the start lock, for the same reason: the
    // global key existed so the backfill could exclude every writer, and once
    // that has run it only serialises unrelated chapters against each other.
    expect(bindingLockKeys("unit_1")).toEqual([
      "experience:binding:chapter:unit_1",
    ]);
  });

  it("V1's sequence is RETAINED so a mixed fleet can be modelled", () => {
    // Not dead code: the mixed-fleet spec must model the binary being replaced
    // with the derivation it actually used, and the chapter key must be
    // byte-identical in both — that shared key is what makes V1+V2 safe.
    expect(bridgeBindingLockKeys("unit_1")).toEqual([
      "experience:binding:global",
      "experience:binding:chapter:unit_1",
    ]);
    expect(bridgeBindingLockKeys("unit_1")[1]).toBe(
      bindingLockKeys("unit_1")[0],
    );
  });

  it("derives keys byte for byte, so two binaries can share them", () => {
    expect(globalBindingLockKey()).toBe("experience:binding:global");
    expect(chapterBindingLockKey("unit_1")).toBe(
      "experience:binding:chapter:unit_1",
    );
  });

  it("the chapter key is derived from the STABLE unit, never from placement", () => {
    const src = code(LOCKS);
    expect(src).toMatch(/chapterBindingLockKey = \(contentUnitId: string\)/);
    // No placement anywhere in the half of the module that DERIVES keys.
    // `enterBindingProtocol` below it necessarily takes a `chapterOrder` — it
    // is the locator being resolved — but nothing that becomes a key may.
    const derivation = src.slice(0, src.indexOf("enterBindingProtocol"));
    expect(derivation).toMatch(/globalBindingLockKey/);
    expect(derivation).not.toMatch(/chapterOrder/);
    expect(src).not.toMatch(/binding:chapter:\$\{[^}]*chapterOrder/);
  });

  it("uses the same advisory mechanism and seed as the Guide lifecycle", () => {
    // `hashtextextended(key, 42)` and the xact-scoped variant. The seed is part
    // of the protocol: two binaries only serialise if they hash identically.
    expect(read(LOCKS)).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(\$\{key\}, 42\)\)/,
    );
  });

  it("boot surfaces the marker, so a fleet can be PROVEN drained", () => {
    const main = read(join(process.cwd(), "src/main.ts"));
    expect(main).toMatch(
      /EXPERIENCE_BINDING_PROTOCOL=\$\{EXPERIENCE_BINDING_PROTOCOL\}/,
    );
    expect(main).toMatch(/REPLICA=\$\{process\.env\.RAILWAY_REPLICA_ID/);
  });
});

describe("ratchet · identity before anything else", () => {
  it("every binding mutation goes through the one helper", () => {
    const src = read(SERVICE);
    // Create, save, publish and the next-draft clone. A fifth mutation added
    // without `withBinding` would take no lock and reserve nothing.
    const guarded = src.match(/this\.withBinding\(/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(4);
  });

  it("locks, resolves under the edition lock, then locks the chapter", () => {
    // The order IS the guarantee, and it is not the obvious one. Resolving
    // first — which is what this used to assert — reads the manifest with
    // nothing held, so a reorder committing a moment later leaves a row bound
    // to the unit that used to be at that position. The chapter key cannot be
    // taken any earlier, because its name is the answer.
    const body = code(LOCKS).slice(
      code(LOCKS).indexOf("export async function enterBindingProtocol"),
    );
    const pre = body.indexOf("preIdentityLockKeys()");
    const resolve = body.indexOf("resolveChapterIdentity(");
    const post = body.indexOf("postIdentityLockKeys(");
    expect(pre).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(pre);
    expect(post).toBeGreaterThan(resolve);
    // And the resolution genuinely holds the edition row.
    expect(body).toMatch(/lock:\s*"for-update"/);
  });

  it("a write never resolves identity without the edition lock", () => {
    // The one exported way to get a resolved chapter for a WRITE is the
    // protocol helper. A new command that called the resolver directly with
    // `lock: "none"` would reintroduce the race silently, so the service is
    // pinned to entering through the helper.
    const src = code(SERVICE);
    expect(src).toMatch(/enterBindingProtocol\(tx, where\)/);
    // The only direct resolution left in the service is the READ path, and it
    // is explicitly unlocked.
    const direct = [...src.matchAll(/resolveChapterIdentity\(/g)];
    expect(direct.length).toBe(1);
    expect(src).toMatch(/lock:\s*"none"/);
  });

  it("the edition lock is the one Content Core already takes", () => {
    // Not a new advisory namespace: the SAME row, by the same predicate, that
    // `lockEditionTx` and `lockEditionForBookSlugTx` take for every publish,
    // reorder, ingest and discard. A second, private mechanism would serialise
    // binding writes against each other and against nothing else.
    const src = code(IDENTITY);
    expect(src).toMatch(
      /SELECT "id", "publishedRevisionId" FROM "Edition" WHERE "slug" = \$\{bookSlug\} FOR UPDATE/,
    );
    const core = code(
      join(process.cwd(), "src/content-core/revision-lifecycle.ts"),
    );
    expect(core).toMatch(
      /FROM "Edition" WHERE "id" = \$\{editionId\} FOR UPDATE/,
    );
    expect(core).toMatch(
      /FROM "Edition" WHERE "slug" = \$\{bookSlug\} FOR UPDATE/,
    );
  });

  it("identity comes from the manifest, and never falls back to order", () => {
    const src = code(IDENTITY);
    expect(src).toMatch(/revisionUnit\.findFirst/);
    // `chapterOrder` is an INPUT to the lookup; it is never the answer.
    expect(src).not.toMatch(/contentUnitId:\s*[^,\n]*chapterOrder/);
    // The unadopted classes refuse rather than resolving to something.
    expect(src).toMatch(/"UNSYNCED_LEGACY"/);
    expect(src).toMatch(/"NOT_PLACED"/);
  });

  it("a client-supplied contentUnitId is checked, never trusted", () => {
    expect(code(IDENTITY)).toMatch(
      /input\.expectedContentUnitId !== placed\.unit\.id[\s\S]{0,120}"CLIENT_MISMATCH"/,
    );
  });
});

describe("ratchet · the backfill's own guarantees", () => {
  it("takes the GLOBAL lock before it reads", () => {
    const src = read(BACKFILL);
    const body = src.slice(
      src.indexOf("export async function applyReservations"),
    );
    const lockAt = body.indexOf(
      "acquireBindingLock(tx, globalBindingLockKey())",
    );
    const readAt = body.indexOf("planReservations(tx)");
    expect(lockAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(lockAt);
  });

  it("never hides a conflicting owner behind ON CONFLICT", () => {
    const src = code(BACKFILL);
    expect(src).not.toMatch(/ON CONFLICT DO NOTHING/i);
    expect(src).not.toMatch(/skipDuplicates/);
    // A replay is an exact match; anything else aborts.
    expect(src).toMatch(/existing\.guideKey !== group\.guideKey/);
  });

  it("never rewrites an editorial binding", () => {
    const src = code(BACKFILL);
    // It fills columns and inserts reservations…
    expect(src).toMatch(/contentUnitId: group\.contentUnitId,/);
    // …and `definitionJson` is only ever SELECTED and READ.
    expect(src).toMatch(/definitionJson: true/);
    expect(src).toMatch(/validateExperienceDefinition\(row\.definitionJson\)/);
    // Never inside a write payload. `data: { … definitionJson … }` in this file
    // would mean the backfill had decided what an editor meant.
    expect(src).not.toMatch(/data:\s*\{[^}]*definitionJson/);
  });

  it("only ever writes to rows that are STILL fully legacy", () => {
    const src = code(BACKFILL);
    // The guard is in the WHERE, not only in the plan. A row a bridge writer
    // materialised between planning and writing must not be overwritten, and
    // the count check turns "matched nothing" into an abort rather than a
    // silently smaller result.
    // Raw SQL now: this binary's client may be generated from the cutover
    // schema, where `contentUnitId` is NOT NULL and `contentUnitId: null` is
    // not a filter it will send. The guard is the point of the statement.
    // One UPDATE in the whole file, so these three are statements about it.
    expect([
      ...src.matchAll(/UPDATE "ChapterExperienceVersion"/g),
    ]).toHaveLength(1);
    expect(src).toMatch(/AND "contentUnitId" IS NULL\s*AND "guideKey" IS NULL/);
    expect(src).toMatch(/id" = ANY\(\$\{group\.legacyRowIds\}::text\[\]\)/);
    expect(src).toMatch(/updated !== group\.legacyRowIds\.length/);
    // Materialised rows are verified and left alone.
    expect(src).not.toMatch(/materialisedRowIds[\s\S]{0,120}updateMany/);
  });

  it("code-owned definitions are placed by IDENTITY, and never materialised", () => {
    const src = code(BACKFILL);
    // By stable unit, not by number. Both sides of the collision check used to
    // key on `(bookSlug, chapterOrder)` — and a stored row's number is the
    // position it was CREATED at, so after a reorder the check compared a
    // shipped definition placed today against a row placed months ago.
    expect(src).toMatch(/codeOwnedClaimsByUnit\(db\)/);
    expect(src).toMatch(/byUnit\.get\(g\.contentUnitId\)/);
    expect(src).not.toMatch(/listPublishedForChapter/);
    expect(src).toMatch(/codeOwnedCollision/);
    // A reservation is the record of an editorial decision; a shipped
    // definition is a fact about the build. Writing one into the table would
    // put a row there that no CMS action accounts for and a deploy could
    // invalidate.
    const collisions = src.slice(
      src.indexOf("async function codeOwnedCollisions"),
    );
    expect(collisions.slice(0, collisions.indexOf("\n}"))).not.toMatch(
      /experienceGuideReservation\.create/,
    );
  });

  it("never reports a driver error, only canonical codes", () => {
    const src = code(BACKFILL);
    expect(src).toMatch(/class BackfillFailure/);
    expect(src).toMatch(/canonicalFailureCode/);
    // Prisma's codes are mapped; its messages are not forwarded.
    expect(src).not.toMatch(/err\.message|String\(err\)|\$\{err\}/);
  });

  it("reports without quoting content or driver text", () => {
    const cli = code(
      join(process.cwd(), "src/experience/reservation-backfill-cli.ts"),
    );
    expect(cli).not.toMatch(/definitionJson|err\.message|\.stack/);
  });

  it("the CLI builds its client with the pg adapter, and not at import time", () => {
    // This ratchet exists because a source check is exactly what MISSED the
    // original bug: the file said `new PrismaClient()` with no adapter and
    // threw before running, while the only test naming it read its text.
    //
    // So this pins the two things text can honestly speak to, and the
    // BEHAVIOUR is covered where it belongs — `reservation-backfill-cli.spec.ts`
    // drives the real entry point, and `reservation-backfill-cli.pg-spec.ts`
    // spawns the literal npm command against a real database.
    const cli = code(
      join(process.cwd(), "src/experience/reservation-backfill-cli.ts"),
    );
    expect(cli).toMatch(
      /new PrismaClient\(\{ adapter: new PrismaPg\(pool\) \}\)/,
    );
    // Never the bare form that cannot construct under a driver adapter.
    expect(cli).not.toMatch(/new PrismaClient\(\)/);
    // Nothing is built at module load; the factory is a function.
    expect(cli).toMatch(
      /export const createBackfillClient: BackfillClientFactory = \(\) =>/,
    );
    // And `process.exit` never truncates the pool drain.
    expect(cli).not.toMatch(/process\.exit\(/);
  });

  it("the retired positional counter is gone from the report, not zeroed", () => {
    // Keeping `ROWS_ADOPTING_CURRENT_POSITION=0` for compatibility would state
    // that adoption is a thing that happens and did not happen this time. It
    // is not a thing that happens any more.
    const cli = code(
      join(process.cwd(), "src/experience/reservation-backfill-cli.ts"),
    );
    expect(cli).not.toMatch(/ROWS_ADOPTING_CURRENT_POSITION/);
    expect(cli).toMatch(/POSITION_USED_AS_IDENTITY=false/);
    expect(cli).toMatch(/ROWS_IDENTITY_FROM_GUIDE_CONTEXT/);
  });

  it("the guide resolver has no client to escape the transaction TO", () => {
    // A negative control that dropped the `db` argument from `resolve` did not
    // discriminate, and the reason is worth writing down rather than papering
    // over: `contextResolver(db)` constructs `LearningCatalogResolver` WITH the
    // transaction, so `db ?? this.prisma` is the transaction either way. The
    // escape is impossible by construction, not by remembering an argument.
    //
    // What this ratchet protects is that construction. An ambient client here —
    // the module's own PrismaClient, an injected service — would reintroduce a
    // fallback that silently reads outside the caller's snapshot the moment a
    // call site forgot the argument.
    const src = code(
      join(process.cwd(), "src/experience/experience-code-owned-identity.ts"),
    );
    const fn = src.slice(src.indexOf("function contextResolver"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(
      /new LearningCatalogResolver\(\s*db as unknown as PrismaService,?\s*\)/,
    );
    // Nothing else may be constructed or imported as a client in this module.
    expect(src).not.toMatch(/new PrismaClient\(/);
    expect(src).not.toMatch(/PrismaService\s*\)\s*\{[\s\S]{0,80}this\.prisma/);
  });

  it("legacy identity is never taken from the resolved position", () => {
    const src = code(BACKFILL);
    // The exact assignment that used to place a legacy row on whatever unit
    // sat at its number.
    expect(src).not.toMatch(/contentUnitId:\s*resolvedForPosition/);
    // What it is taken from instead, resolved with the caller's transaction.
    expect(src).toMatch(/resolveUnitForGuidePin\(db, pin, catalog\)/);
    // Both halves of the pin, so a key-only lookup cannot creep back.
    expect(
      code(
        join(process.cwd(), "src/experience/experience-code-owned-identity.ts"),
      ),
    ).toMatch(/catalog\.guideFor\(pin\.guideKey, pin\.guideVersion\)/);
  });
});

describe("ratchet · forward compatibility with ARCHIVED", () => {
  it("editing requires DRAFT positively, never 'not PUBLISHED'", () => {
    const src = read(SERVICE);
    // The old shape — `row.status === "PUBLISHED"` as the only gate — would let
    // a status this binary has never seen through.
    expect(src).toMatch(/if \(row\.status !== "DRAFT"\)/);
    expect(src).toMatch(/if \(current\.status !== "DRAFT"\)/);
  });

  it("the listed status is the COLUMN, not the definition's", () => {
    const src = code(SERVICE);
    expect(src).toMatch(/status: row\.status,/);
    // The old derivation lived inside `rowOf`, where it decided the status of
    // every database row. It is gone from there; the only remaining use is the
    // code-owned branch, which genuinely has no row to read.
    const rowOf = src.slice(src.indexOf("function rowOf("));
    expect(rowOf.slice(0, rowOf.indexOf("\n}"))).not.toMatch(/def\.status/);
  });
});

describe("ratchet · the C.3A migration is atomic", () => {
  const MIGRATION = join(
    process.cwd(),
    "prisma/migrations/20260820000000_c3a_experience_guide_reservation/migration.sql",
  );

  /**
   * The file's EFFECTIVE statements: comments stripped, split on `;`, blanks
   * dropped, whitespace collapsed.
   *
   * Position is the whole point. Checking only that `BEGIN;` appears somewhere
   * would pass a file that ran DDL before it — which is precisely the shape
   * that leaves residue behind after a failure, and precisely the shape a
   * careless edit produces.
   */
  const statements = (sql: string): string[] =>
    sql
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);

  it("opens with BEGIN, closes with COMMIT, and has nothing outside them", () => {
    // Measured with the real runner on PostgreSQL 18.4: `prisma migrate deploy`
    // does NOT wrap a migration file, and DOES honour an explicit BEGIN/COMMIT.
    // A deliberate failure before the COMMIT left zero residue; without the
    // transaction the same failure left columns, a table, indexes and a foreign
    // key behind, with `_prisma_migrations` unfinished and every later deploy
    // blocked on P3009.
    //
    // That measurement is evidence about THIS revision. What keeps the property
    // true afterwards is this ratchet, which is a structural assertion about
    // the file — not a second run of the runner. Re-running `migrate deploy` in
    // CI to re-prove atomicity would buy nothing the file text does not already
    // pin, and would add another database to the known infrastructure race.
    const stmts = statements(read(MIGRATION));
    expect(stmts.filter((s) => s === "BEGIN")).toHaveLength(1);
    expect(stmts.filter((s) => s === "COMMIT")).toHaveLength(1);
    // First and last, by position — not merely present, and not merely ordered.
    expect(stmts[0]).toBe("BEGIN");
    expect(stmts[stmts.length - 1]).toBe("COMMIT");
    // No ROLLBACK, no savepoints, no second transaction hiding in the middle.
    expect(
      stmts.filter((s) => /^(ROLLBACK|SAVEPOINT|START TRANSACTION)\b/i.test(s)),
    ).toHaveLength(0);
    // And the work really is between them.
    const body = stmts.slice(1, -1);
    expect(body.length).toBeGreaterThan(1);
    for (const stmt of ["ALTER TABLE", "CREATE TABLE", "CREATE UNIQUE INDEX"]) {
      expect(body.some((s) => s.startsWith(stmt))).toBe(true);
    }
  });

  it("the tokeniser it relies on really does catch a statement before BEGIN", () => {
    // The negative control, run against the tokeniser itself rather than by
    // editing the file: a `SET` or a stray `ALTER TABLE` ahead of the BEGIN is
    // outside the transaction, survives a rollback, and would leave exactly the
    // residue this ratchet exists to forbid.
    const smuggled = statements(
      `ALTER TABLE "x" ADD COLUMN "y" TEXT;\nBEGIN;\nCREATE TABLE "z" ();\nCOMMIT;\n`,
    );
    expect(smuggled[0]).not.toBe("BEGIN");
    const trailing = statements(
      `BEGIN;\nCREATE TABLE "z" ();\nCOMMIT;\nVACUUM;`,
    );
    expect(trailing[trailing.length - 1]).not.toBe("COMMIT");
  });
});

describe("ratchet · measure and apply are different commands", () => {
  it("measure is READ ONLY, and it is the first statement", () => {
    const src = code(BACKFILL);
    const measure = src.slice(
      src.indexOf("export async function measureReservations"),
    );
    const body = measure.slice(0, measure.indexOf("\n}"));
    expect(body).toMatch(
      /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/,
    );
    // First, because PostgreSQL refuses the SET once anything else has run.
    const setAt = body.indexOf("SET TRANSACTION");
    const planAt = body.indexOf("planReservations");
    expect(setAt).toBeGreaterThan(-1);
    expect(planAt).toBeGreaterThan(setAt);
    // No advisory key: a report that blocked the writes it describes would be
    // its own small outage.
    expect(body).not.toMatch(/acquireBindingLock/);
  });

  it("apply takes the global key, then every Edition, THEN reads", () => {
    const src = code(BACKFILL);
    const apply = src.slice(
      src.indexOf("export async function applyReservations"),
    );
    const global = apply.indexOf("globalBindingLockKey()");
    const editions = apply.indexOf('FROM "Edition" ORDER BY "id" FOR UPDATE');
    const plan = apply.indexOf("planReservations(tx)");
    expect(global).toBeGreaterThan(-1);
    expect(editions).toBeGreaterThan(global);
    expect(plan).toBeGreaterThan(editions);
  });

  it("the plan never takes a row lock of its own", () => {
    // Under measure the transaction is READ ONLY and PostgreSQL would refuse
    // it; under apply the editions are already locked, in id order. Acquiring
    // more as a side effect of resolution would take them in whatever order the
    // rows arrive in, which is the shape deadlocks come in.
    const src = code(BACKFILL);
    const plan = src.slice(src.indexOf("async function planReservations"));
    const body = plan.slice(0, plan.indexOf("\n}\n"));
    expect(body).toMatch(/lock: "none"/);
    expect(body).not.toMatch(/for-update/);
  });
});

describe("ratchet · a stored pin is never recomputed from a number", () => {
  it("save and next-draft do not consult the positional guide catalog", () => {
    // `getExactContext(bookSlug, chapterOrder)` answers "which guide does this
    // NUMBER publish". A stored row's number is the position it was CREATED at,
    // so asking it again on save is asking about a chapter the draft may no
    // longer be in.
    const src = code(SERVICE);
    const method = (name: string): string => {
      const from = src.indexOf(`async ${name}(`);
      expect(from).toBeGreaterThan(-1);
      const rest = src.slice(from);
      const end = rest.indexOf("\n  /**");
      return end === -1 ? rest : rest.slice(0, end);
    };

    // TWO legitimate uses, both about a CHAPTER rather than about a stored row:
    // `createDraft`, which has no stored pin to keep, and `listForChapter`,
    // which reports what a NEW experience here would bind to. A third would
    // have to justify itself.
    expect([...src.matchAll(/getExactContext\(/g)]).toHaveLength(2);
    expect(method("createDraft")).toMatch(/getExactContext\(/);
    expect(method("listForChapter")).toMatch(/getExactContext\(/);

    // And neither command that HAS a stored pin recomputes one.
    expect(method("saveDraft")).not.toMatch(/getExactContext\(/);
    expect(method("createNextDraft")).not.toMatch(/getExactContext\(/);
    expect(method("saveDraft")).toMatch(/storedPin/);
    expect(method("createNextDraft")).toMatch(/source\.guidePin/);
  });
});

describe("ratchet · the rebind is a MOVE, not an acquire", () => {
  it("never asks `reserveFor` for permission to change its own binding", () => {
    // The bug this pins. `reserveFor` asserts BOTH halves of the bijection, and
    // the second half — "this lineage already holds another guide" — is exactly
    // what a rebind is asking to change. Calling it made the whole operation
    // unreachable: the lineage's own claim refused the lineage's own move.
    const src = code(SERVICE);
    const body = src.slice(src.indexOf("async rebindDraft("));
    const rebind = body.slice(0, body.indexOf("\n  async "));
    expect(rebind).not.toMatch(/this\.reserveFor\(/);
    expect(rebind).toMatch(/moveReservation\(tx, \{/);
  });

  it("moves ONE row rather than deleting and recreating", () => {
    const src = code(
      join(process.cwd(), "src/experience/experience-binding-reservation.ts"),
    );
    const move = src.slice(
      src.indexOf("export async function moveReservation"),
    );
    const body = move.slice(0, move.indexOf("\n}"));
    // A delete would be refused by RESTRICT while a version references it, and
    // two reservations cannot coexist under the primary key. An update is the
    // only shape with no window.
    expect(body).not.toMatch(/\.delete\(|\.deleteMany\(/);
    expect(body).toMatch(/experienceGuideReservation\.update\(/);
    // Same pin is a replay, not a conflict and not a write.
    expect(body).toMatch(/existing\.guideKey === input\.toGuideKey/);
  });

  it("rewrites every unpublished version, and no archived one", () => {
    const src = code(SERVICE);
    const body = src.slice(src.indexOf("async rebindDraft("));
    const rebind = body.slice(0, body.indexOf("\n  async "));
    // `ON UPDATE CASCADE` moves the columns of every referencing row; a
    // definition left naming the old pin would be the divergence it cannot fix.
    expect(rebind).toMatch(/status: "DRAFT",/);
    expect(rebind).toMatch(/for \(const sibling of siblings\)/);
  });
});

describe("ratchet · the CMS can actually perform what the server offers", () => {
  const WEB = join(
    process.cwd(),
    "../web/src/app/dashboard/admin/experiencias",
  );

  it("rebind has a visual consumer", () => {
    // `rebindDraftAction` shipped with no component calling it, which meant the
    // one operation C.4 adds to the CMS could not be performed by an editor.
    const card = read(
      join(WEB, "[bookSlug]/[chapterOrder]/borrador/[id]/GuideBindingCard.tsx"),
    );
    expect(card).toMatch(/rebindDraftAction\(/);
    const page = read(
      join(WEB, "[bookSlug]/[chapterOrder]/borrador/[id]/page.tsx"),
    );
    expect(page).toMatch(/<GuideBindingCard/);
  });

  it("archive keeps its explicit confirmation", () => {
    const actions = read(
      join(WEB, "[bookSlug]/[chapterOrder]/ExperienceRowActions.tsx"),
    );
    expect(actions).toMatch(/confirmingArchive/);
    expect(actions).toMatch(/archiveDraftAction\(/);
  });

  it("the chapter page says so when no guide could be chosen", () => {
    // With the current catalog a chapter can have exactly one guide and a
    // definition the build ships already holding it. Offering «Nueva
    // experiencia» there promises an operation that cannot complete.
    const button = read(
      join(WEB, "[bookSlug]/[chapterOrder]/NewExperienceButton.tsx"),
    );
    expect(button).toMatch(/bindableGuides === 0/);
    expect(button).toMatch(/new-experience-no-guide/);
    const page = read(join(WEB, "[bookSlug]/[chapterOrder]/page.tsx"));
    expect(page).toMatch(/bindableGuides=\{bindableGuides\}/);
  });
});

describe("ratchet · the published contract describes what comes back", () => {
  const CONTROLLER = join(
    process.cwd(),
    "src/experience/experience-admin.controller.ts",
  );

  it("the C.4 endpoints declare response schemas and deliberate statuses", () => {
    // Nest infers request bodies and infers NOTHING about responses. An
    // endpoint that returns JSON with no declared schema reaches
    // `openapi-typescript` as `content?: never` — a generated client that types
    // the answer as "no body", which is not thin, it is wrong.
    const src = read(CONTROLLER);
    expect(src).toMatch(/type: SelectableGuideOptionDto,\s*\n\s*isArray: true/);
    expect(src).toMatch(
      /@ApiOkResponse\(\{ type: RebindExperienceDraftResultDto \}\)/,
    );
    expect(src).toMatch(
      /@ApiOkResponse\(\{ type: ArchiveExperienceDraftResultDto \}\)/,
    );
    // `@Post` defaults to 201 Created, and archiving creates nothing.
    const archive = src.slice(src.indexOf('@Post("drafts/:id/archive")'));
    expect(archive.slice(0, archive.indexOf("archiveDraft("))).toMatch(
      /@HttpCode\(200\)/,
    );
  });

  it("the generated client types those responses", () => {
    const generated = read(
      join(process.cwd(), "../../packages/api-client/src/generated.ts"),
    );
    expect(generated).toMatch(/SelectableGuideOptionDto/);
    expect(generated).toMatch(/RebindExperienceDraftResultDto/);
    expect(generated).toMatch(/ArchiveExperienceDraftResultDto/);
  });
});

describe("ratchet · the reader anchor barrier", () => {
  /**
   * The one ordering constraint this train cannot enforce with a constraint.
   *
   * After a reorder the CMS binds by identity and the reader gates by position.
   * C.3A may deploy anyway — it adds no editorial choice, so the disagreement
   * stays unreachable. C.3C+C.4 may NOT merge before the reader is closed,
   * because that is where an editor gains the ability to produce a binding the
   * reader will refuse to open.
   *
   * Recorded as assertions rather than as a paragraph, because a paragraph in a
   * merged pull request stops being read.
   */
  const REPO_ROOT = join(process.cwd(), "..", "..");

  it("declares both identities and which phase each one gates", () => {
    expect(EXPERIENCE_IDENTITY_BARRIER).toEqual({
      CODE_OWNED_BINDING_IDENTITY:
        "contentUnitId derivado por GuideTargetContext",
      PUBLIC_READER_ANCHOR: "veredicto del servidor por contentUnitId (C.3R)",
      C3A_DEPLOY_BLOCKED_BY_POSITIONAL_READER: false,
      READER_ANCHOR_IDENTITY_CLOSED_IN_TREE: true,
      READER_ANCHOR_IDENTITY_DEPLOYED: true,
      // Open: C.3R is merged AND deployed, so the ordering constraint this
      // flag encoded no longer has anything to protect.
      C3C_C4_MERGE_BLOCKED_UNTIL_READER_ANCHOR_IDENTITY_CLOSED: false,
    });
  });

  it("the barrier cannot be lowered without ALL FOUR antecedents", () => {
    // The ratchet that gives the lowered flag its meaning. Anyone can flip a
    // boolean; this makes flipping it require editing the four facts it rests
    // on, where a reviewer can see them — and makes deleting one of those facts
    // fail the build rather than quietly widen what the flag permits.
    const antecedents = Object.entries(READER_ANCHOR_BARRIER_ANTECEDENTS);
    expect(antecedents).toHaveLength(4);
    if (
      EXPERIENCE_IDENTITY_BARRIER.C3C_C4_MERGE_BLOCKED_UNTIL_READER_ANCHOR_IDENTITY_CLOSED ===
      false
    ) {
      for (const [name, value] of antecedents) {
        expect(value, `antecedente ${name}`).toBe(true);
      }
    }
    // And the deployed fact has to agree with the tree fact: a reader that is
    // positional in the tree cannot be identity-based in production.
    if (EXPERIENCE_IDENTITY_BARRIER.READER_ANCHOR_IDENTITY_DEPLOYED) {
      expect(
        EXPERIENCE_IDENTITY_BARRIER.READER_ANCHOR_IDENTITY_CLOSED_IN_TREE,
      ).toBe(true);
    }
  });

  it("lowered is NOT authorised — the three decisions stay apart", () => {
    // The distinction the barrier exists to preserve. Collapsing them is how a
    // gate becomes a formality: "the barrier is down" would start to read as
    // "someone approved the merge", which nobody did.
    expect(C3C_C4_STATE).toEqual({
      MERGE_BARRIER: false,
      MERGE_AUTHORIZED: false,
      DEPLOYED: false,
      C5_AUTHORIZED: false,
    });
    expect(C3C_C4_STATE.MERGE_BARRIER).toBe(
      EXPERIENCE_IDENTITY_BARRIER.C3C_C4_MERGE_BLOCKED_UNTIL_READER_ANCHOR_IDENTITY_CLOSED,
    );
  });

  it("the reader really has STOPPED being positional — measured, not remembered", () => {
    // The inverse of what this ratchet used to assert, and it flipped because
    // the code did. C.3R deleted the positional decision instead of deprecating
    // it: a fallback that still worked would keep giving a confident wrong
    // answer on a reordered book.
    const anchor = read(join(REPO_ROOT, PUBLIC_READER_ANCHOR_SOURCE));
    expect(anchor).not.toContain("export function anchorAppliesTo");
    // And no surface consumes it, because there is nothing to consume.
    expect(read(join(REPO_ROOT, PUBLIC_READER_ANCHOR_CONSUMER))).not.toContain(
      "anchorAppliesTo",
    );
    const shell = read(
      join(
        REPO_ROOT,
        "apps/web/src/components/dashboard/lector/LectorShell.tsx",
      ),
    );
    // The shell may still EXPLAIN what it stopped doing; what it may not do is
    // call it. A comment is not a decision.
    expect(shell).not.toMatch(/^\s*(?!\s*\*).*anchorAppliesTo\(/m);
    // What it does instead: read the server's word for the pin being run.
    expect(shell).toContain("serverVerdictFor");
    expect(shell).toContain('"APPLIES"');
  });

  it("the barrier is decided by which phase this binary IS", () => {
    // The two flags are not independent opinions; each rests on a fact about
    // the code in the tree, and the fact differs by phase. So the assertion
    // reads the protocol marker and checks the claim that actually applies —
    // which also means this ratchet keeps biting on the stacked branch, where
    // it matters most, instead of quietly describing the branch below.
    const service = code(SERVICE);
    const editorial = ["rebindDraft", "archiveDraft", "listGuideOptions"];

    if (EXPERIENCE_BINDING_PROTOCOL === "experience-binding-bridge-v1") {
      // C.3A. The `false` rests on this: nothing here lets an editor pick,
      // move or release a guide, so no editor can produce a binding the
      // positional reader would refuse to open.
      for (const op of editorial) expect(service).not.toContain(op);
      expect(
        EXPERIENCE_IDENTITY_BARRIER.C3A_DEPLOY_BLOCKED_BY_POSITIONAL_READER,
      ).toBe(false);
    } else {
      // C.3C+C.4. The editorial surface exists — the condition the merge gate
      // was written for. The gate is now open, and what makes that legitimate
      // is not this branch's opinion of itself: it is that the reader's
      // identity anchor is deployed, asserted here against the same flag.
      expect(editorial.some((op) => service.includes(op))).toBe(true);
      expect(EXPERIENCE_IDENTITY_BARRIER.READER_ANCHOR_IDENTITY_DEPLOYED).toBe(
        true,
      );
      expect(
        EXPERIENCE_IDENTITY_BARRIER.C3C_C4_MERGE_BLOCKED_UNTIL_READER_ANCHOR_IDENTITY_CLOSED,
      ).toBe(false);
    }
  });

  it("names what closed it, and that merging is still a separate decision", () => {
    expect(READER_ANCHOR_IDENTITY_TASK).toContain("anchorAppliesTo");
    expect(READER_ANCHOR_IDENTITY_TASK).toContain("contentUnitId");
    // The task now records a closure, so what must be said instead is that
    // lowering the barrier did not authorise anything.
    expect(READER_ANCHOR_IDENTITY_TASK).toContain("gate");
  });
});

describe("ratchet · claims this PR makes in prose are anchored in code", () => {
  const RESERVATION = join(
    process.cwd(),
    "src/experience/experience-binding-reservation.ts",
  );

  it("the anomaly catalogue is fifteen, and each one is reachable", () => {
    // The pull request describes this list. Pinning the count here is what
    // stops the description and the code drifting apart — two of these
    // (`ROW_IDENTITY_UNKNOWN_UNIT`, `ROW_BOOK_HAS_NO_EDITION`) were added after
    // the first description was written, and nothing noticed.
    const kinds = Object.values(BACKFILL_ANOMALY);
    expect(kinds).toHaveLength(15);
    expect(new Set(kinds).size).toBe(15);
    expect(kinds).toContain("ROW_IDENTITY_UNKNOWN_UNIT");
    expect(kinds).toContain("ROW_BOOK_HAS_NO_EDITION");
    // C.3B identity: the two that replaced CHAPTER_IDENTITY_UNRESOLVED, which
    // existed only because a legacy row's position had to resolve.
    expect(kinds).toContain("ROW_GUIDE_CONTEXT_UNRESOLVED");
    expect(kinds).toContain("ROW_GUIDE_CONTEXT_IDENTITY_MISMATCH");
    expect(kinds).not.toContain("CHAPTER_IDENTITY_UNRESOLVED");
    // Every one of them is actually raised somewhere in the backfill.
    const backfill = read(BACKFILL);
    for (const kind of Object.keys(BACKFILL_ANOMALY)) {
      expect(backfill).toContain(`BACKFILL_ANOMALY.${kind}`);
    }
  });

  it("never claims RESTRICT traps an unreferenced code-owned reservation", () => {
    // It does not: `RESTRICT` refuses a delete only while something REFERENCES
    // the row, and a reservation nothing references deletes fine. The reason
    // code-owned claims are not materialised is ownership plus reconciliation
    // from the shipped set — and that is the ONLY explanation the module gives,
    // rather than a wrong one followed by a retraction.
    const doc = read(RESERVATION);
    const block = doc.slice(
      doc.indexOf("Definitions this build SHIPS"),
      doc.indexOf("codeOwned?:"),
    );
    expect(block.length).toBeGreaterThan(200);
    expect(block).not.toMatch(/RESTRICT/);
    expect(block).not.toMatch(/impossible to delete/i);
    expect(block).not.toMatch(/was (simply )?wrong/i);
    expect(block).toMatch(/ownership/);
    expect(block).toMatch(/codeOwnedClaimsForUnit/);
  });
});

describe("ratchet · there is no lock ORDER left to get wrong", () => {
  it("V2 takes exactly ONE advisory key, and it is the chapter's", () => {
    // Worth pinning precisely because it makes a whole class of control
    // inexpressible: "invert the lock order" cannot change anything when the
    // sequence has one element. That is a property of the code, not an
    // omission in the tests — and it stops being true the moment V2 takes a
    // second key, which is what this catches.
    //
    // C.3B is why: once every legacy row carried its identity there was
    // nothing left that needed every chapter serialised behind a global key.
    expect(preIdentityLockKeys()).toEqual([]);
    const keys = bindingLockKeys("unit_x");
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(chapterBindingLockKey("unit_x"));
    // And the helper walks the sequence as given — no sort, no reverse.
    const lock = code(
      join(process.cwd(), "src/experience/experience-binding-lock.ts"),
    );
    expect(lock).toMatch(/for \(const key of keys\) await acquireBindingLock/);
    expect(lock).not.toMatch(/keys\.(reverse|sort)\(/);
  });
});

describe("ratchet · the CMS asks the authority on the RIGHT client", () => {
  const ADMIN = join(
    process.cwd(),
    "src/experience/experience-admin.service.ts",
  );

  it("every call to the target authority threads the transaction client", () => {
    // Stated at the source, and worth saying why that is the instrument here.
    //
    // Under READ COMMITTED the ambient client and the transaction's client
    // return the same rows for almost any interleaving, so a behavioural test
    // for "it used the wrong client" would pass for the wrong reason nearly
    // always and fail on a timing accident. What the ambient client really
    // loses is the transaction: the answer stops being covered by the lock
    // this write already holds, and a republish committing in between is read
    // by one and not protected by the other.
    //
    // So this is a source ratchet, deliberately — a weaker instrument than a
    // failing assertion about behaviour, and named as such rather than dressed
    // up as one.
    const src = code(ADMIN);
    const calls = [...src.matchAll(/resolveMany\(([^)]*)\)/g)].map(
      (m) => m[1] as string,
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) {
      expect(args).toMatch(/,\s*tx\s*$/);
    }
  });
});

describe("ratchet · the cutover migrations say what they do", () => {
  const MIGRATIONS = join(process.cwd(), "prisma/migrations");

  it("this branch adds exactly TWO migrations, and names both", () => {
    // Two facts, and the second is what makes the first mean anything.
    //
    // The COUNT stops a third migration arriving unnoticed — including one
    // restacked in from the base branch, which is the specific accident this
    // PR is exposed to: it now sits on C.3R, and a migration reappearing from
    // there would deploy a schema change nobody reviewed as part of C.3C+C.4.
    //
    // The NAMES stop the count being satisfied by a different pair.
    const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const own = dirs.filter((d) => d.includes("_c3c_"));
    expect(own).toEqual([
      "20260820010000_c3c_experience_archived_status",
      "20260820020000_c3c_experience_binding_shape",
    ]);
    // 59 on `main` (C.3A's included), plus these two. C.3R adds none at all.
    expect(dirs).toHaveLength(61);
    expect(dirs.filter((d) => d.includes("c3r"))).toEqual([]);
  });

  /**
   * The migration with its `--` comments removed.
   *
   * Same reason `code()` exists: these files EXPLAIN why `IF NOT EXISTS` and
   * `NOT VALID` are absent, and a prose block naming them must not be mistaken
   * for using them. An absence check is worth exactly as much as its ability to
   * mean what it says.
   */
  const sql = (p: string) => read(p).replace(/^\s*--.*$/gm, "");

  it("the ARCHIVED value is added without IF NOT EXISTS", () => {
    // `IF NOT EXISTS` would absorb a drift silently: if something other than
    // this migration put the value there — a hand-applied hotfix, a restored
    // dump, a branch deployed and rolled back — the deploy would succeed and
    // leave a schema nobody can account for looking exactly like a migrated
    // one. The cutover inherits whatever the deploy hides.
    const statements = sql(
      join(
        MIGRATIONS,
        "20260820010000_c3c_experience_archived_status/migration.sql",
      ),
    );
    expect(statements).toMatch(
      /ALTER TYPE "ExperienceVersionStatus" ADD VALUE 'ARCHIVED';/,
    );
    expect(statements).not.toMatch(/IF NOT EXISTS/);
    // ONE statement, so no transaction to ask for: there is nothing it could
    // be atomic with. Wrapping a single statement would only add a way for the
    // file to be wrong.
    expect(statements).not.toMatch(/BEGIN;|COMMIT;/);
    expect(
      statements.split(";").filter((part) => part.trim().length > 0),
    ).toHaveLength(1);
  });

  it("NOT NULL and the CHECK land in ONE migration", () => {
    // The detector calls the half-applied shape FAIL_CLOSED. Splitting them
    // would make that state observable by a live replica rather than only
    // inside a failed migration.
    const statements = sql(
      join(
        MIGRATIONS,
        "20260820020000_c3c_experience_binding_shape/migration.sql",
      ),
    );
    expect(statements).toMatch(/ALTER COLUMN "contentUnitId" SET NOT NULL/);
    expect(statements).toMatch(
      /ADD CONSTRAINT "ChapterExperienceVersion_binding_shape_check"/,
    );
    // Validated, not NOT VALID: a constraint that proves nothing about the rows
    // already stored is the ambiguity the whole gate exists to remove.
    expect(statements).not.toMatch(/NOT VALID/);
    // And in ONE transaction. The runner gives none, so the likely failure here
    // — the CHECK rejecting a row the backfill missed — would otherwise leave
    // the column already NOT NULL and the constraint absent: the half-applied
    // shape the detector calls FAIL_CLOSED, needing a hand-written
    // `DROP NOT NULL` before anything could be retried.
    expect([...statements.matchAll(/^\s*BEGIN;\s*$/gm)]).toHaveLength(1);
    expect([...statements.matchAll(/^\s*COMMIT;\s*$/gm)]).toHaveLength(1);
    const inside = statements.slice(
      statements.indexOf("BEGIN;"),
      statements.indexOf("COMMIT;"),
    );
    expect(inside).toMatch(/SET NOT NULL/);
    expect(inside).toMatch(/ADD CONSTRAINT/);
  });

  it("the CHECK the migration writes is the one the detector recognises", () => {
    // Two independent statements of the same rule would drift. The detector
    // pins the RENDERED expression; this pins that the migration's source
    // mentions both halves it renders from.
    const statements = sql(
      join(
        MIGRATIONS,
        "20260820020000_c3c_experience_binding_shape/migration.sql",
      ),
    );
    expect(statements).toMatch(
      /"status" = 'ARCHIVED'[\s\S]{0,80}"guideKey" IS NULL/,
    );
    expect(statements).toMatch(
      /"status" <> 'ARCHIVED'[\s\S]{0,80}"guideKey" IS NOT NULL/,
    );
    expect(EXPERIENCE_BINDING_SHAPE.finalCheckDefinition).toContain(
      `("guideKey" IS NOT NULL)`,
    );
  });
});
