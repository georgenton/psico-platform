import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bridgeBindingLockKeys,
  chapterBindingLockKey,
  globalBindingLockKey,
  EXPERIENCE_BINDING_PROTOCOL,
} from "./experience-binding-lock";

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
    expect(EXPERIENCE_BINDING_PROTOCOL).toBe("experience-binding-bridge-v1");
  });

  it("derives keys byte for byte, so two binaries can share them", () => {
    expect(globalBindingLockKey()).toBe("experience:binding:global");
    expect(chapterBindingLockKey("unit_1")).toBe(
      "experience:binding:chapter:unit_1",
    );
  });

  it("the bridge sequence is global THEN chapter", () => {
    // Order is the deadlock argument. A pair acquiring them the other way round
    // could build a cycle with a pair acquiring them this way.
    expect(bridgeBindingLockKeys("unit_1")).toEqual([
      "experience:binding:global",
      "experience:binding:chapter:unit_1",
    ]);
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
    expect(src).toMatch(
      /id: \{ in: group\.legacyRowIds \},[\s\S]{0,200}contentUnitId: null,[\s\S]{0,40}guideKey: null,/,
    );
    expect(src).toMatch(/updated\.count !== group\.legacyRowIds\.length/);
    // Materialised rows are verified and left alone.
    expect(src).not.toMatch(/materialisedRowIds[\s\S]{0,120}updateMany/);
  });

  it("code-owned definitions are counted as claims and never materialised", () => {
    const src = code(BACKFILL);
    expect(src).toMatch(/listPublishedForChapter/);
    expect(src).toMatch(/codeOwnedCollision/);
    // A reservation nothing references could never be released: the composite
    // foreign key that makes release safe is the one that would block it.
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
