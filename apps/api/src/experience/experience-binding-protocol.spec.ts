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
    expect(code(LOCKS)).toMatch(
      /chapterBindingLockKey = \(contentUnitId: string\)/,
    );
    // No placement anywhere in the executable part of the module.
    expect(code(LOCKS)).not.toMatch(/chapterOrder/);
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

  it("the helper resolves identity BEFORE it locks", () => {
    const src = read(SERVICE);
    const body = src.slice(src.indexOf("private async withBinding<T>"));
    const resolveAt = body.indexOf("resolveChapterIdentity(");
    const lockAt = body.indexOf("acquireBindingLocks(");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(lockAt).toBeGreaterThan(resolveAt);
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
    // …and `definitionJson` is only ever SELECTED and READ, never assigned.
    expect(src).toMatch(/definitionJson: true/);
    expect(src).toMatch(/guideKeyFromDefinition\(row\.definitionJson\)/);
    const assignments = [...src.matchAll(/definitionJson:\s*([^,\s]+)/g)].map(
      (m) => m[1],
    );
    expect(assignments).toEqual(["true"]);
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
