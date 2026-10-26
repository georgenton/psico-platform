import { describe, expect, it } from "vitest";

import { contentHash } from "./lib/content-hash";
import {
  assertConnectedDatabase,
  assertPlanStillValid,
  assertPreimageMatchesPlan,
  assertPrivatePath,
  CliUsageError,
  DEFAULT_BOOK,
  freezeEmphasisPlan,
  parseArgs,
  preimagePathFor,
  PREIMAGE_FORMAT,
  resolveTarget,
  STAGING_TOKEN,
  type CliArgs,
} from "./markdown-repair-cli";
import { planEmphasisRepair, type EmphasisSnapshot } from "./markdown-repair";

const snapshotOf = (content: string): EmphasisSnapshot => ({
  bookSlug: DEFAULT_BOOK,
  blocks: [
    {
      chapterBlockId: "cb-1",
      chapterOrder: 1,
      order: 1,
      kind: "PARAGRAPH",
      content,
      meta: null,
      contentBlockId: "ccb-1",
      blockKey: "key-1",
      versions: [
        {
          id: "bv-1",
          unitVersionId: "uv-1",
          order: 1,
          kind: "PARAGRAPH",
          content,
          contentHash: contentHash(content),
          meta: null,
        },
      ],
      highlights: [],
      annotations: 0,
      readingSessions: 0,
    },
  ],
});

const applyArgs = (over: Partial<CliArgs> = {}): CliArgs => ({
  apply: true,
  revert: false,
  book: DEFAULT_BOOK,
  planPath: "/ops/p.json",
  expectDatabase: "feelverse_staging",
  expectPosture: "staging",
  expectPlanId: "plan-1",
  expectPlanHash: "sha256:abc",
  ...over,
});

const STAGING_URL = "postgresql://u:p@db.internal:5432/feelverse_staging";

describe("parseArgs · the two modes stay apart", () => {
  it("plans by default, over the anchor book", () => {
    expect(parseArgs([])).toEqual({
      apply: false,
      revert: false,
      book: DEFAULT_BOOK,
    });
  });

  it("names every missing declaration, not just the first", () => {
    let err: Error | null = null;
    try {
      parseArgs(["--apply"]);
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(CliUsageError);
    for (const flag of [
      "--plan",
      "--expect-database",
      "--expect-posture",
      "--expect-plan-id",
      "--expect-plan-hash",
    ]) {
      expect(err!.message).toContain(flag);
    }
  });

  it("accepts a complete application", () => {
    expect(
      parseArgs([
        "--apply",
        "--plan=/ops/p.json",
        "--expect-database=feelverse_staging",
        "--expect-posture=staging",
        "--expect-plan-id=plan-1",
        "--expect-plan-hash=sha256:abc",
      ]),
    ).toEqual(applyArgs());
  });

  it("accepts a complete recovery", () => {
    expect(
      parseArgs([
        "--revert",
        "--plan=/ops/p.json",
        "--preimage=/ops/p.preimage.json",
        "--expect-database=feelverse_staging",
        "--expect-posture=staging",
        "--expect-plan-id=plan-1",
        "--expect-plan-hash=sha256:abc",
      ]),
    ).toEqual(
      applyArgs({
        apply: false,
        revert: true,
        preimagePath: "/ops/p.preimage.json",
      }),
    );
  });

  it("refuses --revert without a preimage", () => {
    expect(() =>
      parseArgs([
        "--revert",
        "--plan=/ops/p.json",
        "--expect-database=x",
        "--expect-posture=staging",
        "--expect-plan-id=p",
        "--expect-plan-hash=h",
      ]),
    ).toThrow(/PREIMAGEN AUSENTE/);
  });

  it("refuses a preimage outside --revert: the apply WRITES it, it does not read it", () => {
    expect(() =>
      parseArgs([
        "--apply",
        "--plan=/ops/p.json",
        "--preimage=/ops/p.preimage.json",
        "--expect-database=x",
        "--expect-posture=staging",
        "--expect-plan-id=p",
        "--expect-plan-hash=h",
      ]),
    ).toThrow(/PREIMAGEN SIN --revert/);
  });

  it("refuses applying and reverting in one command", () => {
    expect(() => parseArgs(["--apply", "--revert"])).toThrow(
      /MODOS INCOMPATIBLES/,
    );
  });

  it("a recovery declares its destination like an application does", () => {
    expect(() =>
      parseArgs(["--revert", "--preimage=/ops/p.preimage.json"]),
    ).toThrow(/DECLARACIÓN INCOMPLETA/);
  });

  it("refuses a dry run that carries application arguments", () => {
    for (const flag of [
      "--expect-database=x",
      "--plan=/ops/p.json",
      "--expect-plan-hash=sha256:x",
    ]) {
      expect(() => parseArgs([flag])).toThrow(/SIN --apply/);
    }
  });

  it("refuses freezing and applying in one command", () => {
    expect(() =>
      parseArgs([
        "--apply",
        "--plan=/ops/p.json",
        "--expect-database=x",
        "--expect-posture=staging",
        "--expect-plan-id=p",
        "--expect-plan-hash=h",
        "--plan-out=/ops/q.json",
      ]),
    ).toThrow(/MODOS INCOMPATIBLES/);
  });

  it("refuses --snapshot when it is going to write", () => {
    expect(() =>
      parseArgs([
        "--apply",
        "--plan=/ops/p.json",
        "--expect-database=x",
        "--expect-posture=staging",
        "--expect-plan-id=p",
        "--expect-plan-hash=h",
        "--snapshot=/ops/s.json",
      ]),
    ).toThrow(/SNAPSHOT AL ESCRIBIR/);
  });

  it("refuses a repeated flag instead of silently taking the last", () => {
    expect(() => parseArgs(["--book=a", "--book=b"])).toThrow(
      /BANDERA REPETIDA/,
    );
  });

  it("refuses a flag it does not know", () => {
    expect(() => parseArgs(["--force"])).toThrow(/BANDERA DESCONOCIDA/);
  });
});

describe("resolveTarget · the destination is resolved, not declared", () => {
  const env = (over: Record<string, string | undefined> = {}) => ({
    DATABASE_URL: STAGING_URL,
    [STAGING_TOKEN]: "1",
    ...over,
  });

  it("refuses without a connection string", () => {
    expect(() =>
      resolveTarget(applyArgs(), { DATABASE_URL: undefined }, "staging"),
    ).toThrow(/CONEXIÓN AUSENTE/);
  });

  it("a dry run resolves the target and demands nothing", () => {
    const t = resolveTarget(
      { apply: false, book: DEFAULT_BOOK },
      env(),
      "staging",
    );
    expect(t.database).toBe("feelverse_staging");
    expect(t.isLoopback).toBe(false);
  });

  it("refuses when the declared database is not the connected one", () => {
    expect(() =>
      resolveTarget(
        applyArgs({ expectDatabase: "feelverse_production" }),
        env(),
        "staging",
      ),
    ).toThrow(/DESTINO DISCORDANTE/);
  });

  it("refuses when the declared posture is not the resolved one", () => {
    expect(() =>
      resolveTarget(
        applyArgs({ expectPosture: "development" }),
        env(),
        "staging",
      ),
    ).toThrow(/POSTURA DISCORDANTE/);
  });

  it("refuses production outright, with no token that enables it", () => {
    expect(() =>
      resolveTarget(
        applyArgs({
          expectPosture: "production",
          expectDatabase: "feelverse_production",
        }),
        env({ DATABASE_URL: "postgresql://u:p@db/feelverse_production" }),
        "production",
      ),
    ).toThrow(/postura production/);
  });

  it("refuses staging without this repair's own token, loopback included", () => {
    expect(() =>
      resolveTarget(
        applyArgs(),
        env({ [STAGING_TOKEN]: undefined }),
        "staging",
      ),
    ).toThrow(new RegExp(STAGING_TOKEN));
    // Loopback is not proof: a tunnel presents as loopback.
    expect(() =>
      resolveTarget(
        applyArgs(),
        { DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/feelverse_staging" },
        "staging",
      ),
    ).toThrow(new RegExp(STAGING_TOKEN));
  });

  it("refuses a local posture pointed at a hosted database", () => {
    expect(() =>
      resolveTarget(
        applyArgs({ expectPosture: "development" }),
        env(),
        "development",
      ),
    ).toThrow(/no es loopback/);
  });

  it("accepts a declared staging target with the token", () => {
    expect(resolveTarget(applyArgs(), env(), "staging").database).toBe(
      "feelverse_staging",
    );
  });
});

describe("assertConnectedDatabase · two agreeing labels are not a destination", () => {
  it("refuses another database EVEN WITH the same data and the same hash", () => {
    // The case the previous version of this CLI could not see. Everything
    // agrees: the plan was built against `feelverse_staging`, the invocation
    // declares `feelverse_staging`, the connection string says
    // `feelverse_staging`, and the contents are identical — so the recomputed
    // hash matches too, which is exactly what a restored copy would produce.
    const fresh = planEmphasisRepair(snapshotOf("Un **modelo** explica"));
    const frozen = freezeEmphasisPlan(fresh, "feelverse_staging");
    const target = resolveTarget(
      applyArgs(),
      { DATABASE_URL: STAGING_URL, [STAGING_TOKEN]: "1" },
      "staging",
    );

    // Every label-based check passes…
    expect(() =>
      assertPlanStillValid(frozen, fresh, target, {
        planId: frozen.planId,
        planHash: frozen.planHash,
      }),
    ).not.toThrow();

    // …and the server says it is somebody else.
    expect(() =>
      assertConnectedDatabase(target, "feelverse_staging_restaurada"),
    ).toThrow(/BASE CONECTADA DISTINTA/);
  });

  it("accepts when the server agrees", () => {
    const target = resolveTarget(
      { apply: false, book: DEFAULT_BOOK },
      { DATABASE_URL: STAGING_URL },
      "staging",
    );
    expect(() =>
      assertConnectedDatabase(target, "feelverse_staging"),
    ).not.toThrow();
  });
});

describe("assertPlanStillValid · the refusals that make the review real", () => {
  const fresh = planEmphasisRepair(snapshotOf("Un **modelo** explica"));
  const frozen = freezeEmphasisPlan(fresh, "feelverse_staging");
  const target = resolveTarget(
    { apply: false, book: DEFAULT_BOOK },
    { DATABASE_URL: STAGING_URL },
    "staging",
  );
  const identity = { planId: frozen.planId, planHash: frozen.planHash };

  it("accepts a plan the database still produces", () => {
    expect(() =>
      assertPlanStillValid(frozen, fresh, target, identity),
    ).not.toThrow();
  });

  it("refuses when the database no longer produces the approved plan", () => {
    const moved = planEmphasisRepair(
      snapshotOf("Un **modelo** explica, y algo más"),
    );
    expect(() => assertPlanStillValid(frozen, moved, target, identity)).toThrow(
      /CAMBIO CONCURRENTE/,
    );
  });

  it("refuses a plan built against another database", () => {
    expect(() =>
      assertPlanStillValid(
        { ...frozen, database: "otra" },
        fresh,
        target,
        identity,
      ),
    ).toThrow(/BASE DISTINTA/);
  });

  it("refuses a plan built for another book", () => {
    expect(() =>
      assertPlanStillValid(
        frozen,
        { ...fresh, bookSlug: "familias-ensambladas" },
        target,
        identity,
      ),
    ).toThrow(/LIBRO DISTINTO/);
  });

  it("refuses a file that is not the plan that was approved", () => {
    // The question the file cannot answer about itself, so it comes from the
    // invocation: a substituted file would carry its own id and hash.
    expect(() =>
      assertPlanStillValid(frozen, fresh, target, {
        planId: "otro-plan",
        planHash: frozen.planHash,
      }),
    ).toThrow(/PLAN NO APROBADO/);
    expect(() =>
      assertPlanStillValid(frozen, fresh, target, {
        planId: frozen.planId,
        planHash: "sha256:otro",
      }),
    ).toThrow(/HASH NO APROBADO/);
  });

  it("refuses a format it does not know", () => {
    expect(() =>
      assertPlanStillValid(
        { ...frozen, format: "otra-cosa" as never },
        fresh,
        target,
        identity,
      ),
    ).toThrow(/FORMATO DESCONOCIDO/);
  });
});

describe("assertPreimageMatchesPlan · two halves of the same run", () => {
  const fresh = planEmphasisRepair(snapshotOf("Un **modelo** explica"));
  const frozen = freezeEmphasisPlan(fresh, "feelverse_staging");
  const file = {
    format: PREIMAGE_FORMAT,
    planId: frozen.planId,
    planHash: frozen.planHash,
    database: "feelverse_staging",
    recordedAt: new Date().toISOString(),
    preimages: frozen.ops.map((o) => ({
      chapterBlockId: o.chapterBlockId,
      contentDigest: o.before.contentDigest,
      contentLength: o.before.contentLength,
      meta: null,
      versions: o.versions.map((v) => ({
        id: v.id,
        contentHash: "h",
        contentDigest: v.contentDigest,
        meta: null,
      })),
      highlights: [],
    })),
  };

  it("accepts the preimage of that run", () => {
    expect(() => assertPreimageMatchesPlan(frozen, file)).not.toThrow();
  });

  it("refuses a preimage of another plan, and of another hash", () => {
    expect(() =>
      assertPreimageMatchesPlan(frozen, { ...file, planId: "otro" }),
    ).toThrow(/OTRO PLAN/);
    expect(() =>
      assertPreimageMatchesPlan(frozen, { ...file, planHash: "sha256:otro" }),
    ).toThrow(/OTRO HASH/);
  });

  it("refuses a preimage of another database", () => {
    expect(() =>
      assertPreimageMatchesPlan(frozen, { ...file, database: "otra" }),
    ).toThrow(/OTRA BASE/);
  });

  it("refuses a preimage that does not cover the plan", () => {
    // A partial reversal is not run blind: the rows it would leave half-way are
    // precisely the ones nobody would go looking for afterwards.
    expect(() =>
      assertPreimageMatchesPlan(frozen, { ...file, preimages: [] }),
    ).toThrow(/INCOMPLETA|VACÍA/);
    expect(() =>
      assertPreimageMatchesPlan(frozen, {
        ...file,
        preimages: [
          ...file.preimages,
          { ...file.preimages[0]!, chapterBlockId: "cb-ajeno" },
        ],
      }),
    ).toThrow(/INCOMPLETA/);
  });
});

describe("assertPrivatePath", () => {
  it("refuses a path inside the repository", () => {
    expect(() =>
      assertPrivatePath("/repo/apps/api/plan.json", "/repo"),
    ).toThrow(/DENTRO DEL REPOSITORIO/);
  });

  it("accepts a private path outside it", () => {
    expect(() =>
      assertPrivatePath("/home/someone/.psico-ops/plan.json", "/repo"),
    ).not.toThrow();
  });
});

describe("preimagePathFor", () => {
  it("sits beside the plan it reverses", () => {
    expect(preimagePathFor("/ops/plan-abc.json")).toBe(
      "/ops/plan-abc.preimage.json",
    );
  });
});
