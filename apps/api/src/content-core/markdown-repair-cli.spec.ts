import { describe, expect, it } from "vitest";

import { contentHash } from "./lib/content-hash";
import {
  assertPlanStillValid,
  assertPrivatePath,
  CliUsageError,
  DEFAULT_BOOK,
  freezeEmphasisPlan,
  parseArgs,
  preimagePathFor,
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

describe("parseArgs · the two modes stay apart", () => {
  it("plans by default, over the anchor book", () => {
    expect(parseArgs([])).toEqual({ apply: false, book: DEFAULT_BOOK });
  });

  it("refuses --apply without a reviewed plan", () => {
    expect(() => parseArgs(["--apply"])).toThrow(CliUsageError);
    expect(() => parseArgs(["--apply", "--plan=/tmp/p.json"])).toThrow(
      /DESTINO NO DECLARADO/,
    );
  });

  it("accepts a complete application", () => {
    expect(
      parseArgs([
        "--apply",
        "--plan=/tmp/p.json",
        "--expect-database=feelverse_staging",
      ]),
    ).toEqual({
      apply: true,
      book: DEFAULT_BOOK,
      planPath: "/tmp/p.json",
      expectDatabase: "feelverse_staging",
    });
  });

  it("refuses a dry run that carries application arguments", () => {
    // A plan that accepts `--expect-database` reads as if it applied something.
    expect(() => parseArgs(["--expect-database=x"])).toThrow(/SIN --apply/);
    expect(() => parseArgs(["--plan=/tmp/p.json"])).toThrow(/SIN --apply/);
  });

  it("refuses freezing and applying in one command", () => {
    expect(() =>
      parseArgs([
        "--apply",
        "--plan=/tmp/p.json",
        "--expect-database=x",
        "--plan-out=/tmp/q.json",
      ]),
    ).toThrow(/MODOS INCOMPATIBLES/);
  });

  it("refuses --snapshot with --apply", () => {
    // Applying re-reads the live database and compares hashes. An apply that
    // took its "current" state from a file would have no check at all.
    expect(() =>
      parseArgs([
        "--apply",
        "--plan=/tmp/p.json",
        "--expect-database=x",
        "--snapshot=/tmp/s.json",
      ]),
    ).toThrow(/SNAPSHOT CON --apply/);
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

describe("assertPlanStillValid · the refusal that makes the review real", () => {
  const fresh = planEmphasisRepair(snapshotOf("Un **modelo** explica"));
  const frozen = freezeEmphasisPlan(fresh, "feelverse_staging");

  it("accepts a plan the database still produces", () => {
    expect(() =>
      assertPlanStillValid(frozen, fresh, "feelverse_staging"),
    ).not.toThrow();
  });

  it("refuses when the database no longer produces the approved plan", () => {
    const moved = planEmphasisRepair(
      snapshotOf("Un **modelo** explica, y algo más"),
    );
    expect(() =>
      assertPlanStillValid(frozen, moved, "feelverse_staging"),
    ).toThrow(/CAMBIO CONCURRENTE/);
  });

  it("refuses a plan built against another database", () => {
    expect(() =>
      assertPlanStillValid(frozen, fresh, "feelverse_production"),
    ).toThrow(/BASE DISTINTA/);
  });

  it("refuses a plan built for another book", () => {
    const other = { ...fresh, bookSlug: "familias-ensambladas" };
    expect(() =>
      assertPlanStillValid(frozen, other, "feelverse_staging"),
    ).toThrow(/LIBRO DISTINTO/);
  });

  it("refuses a format it does not know", () => {
    expect(() =>
      assertPlanStillValid(
        { ...frozen, format: "otra-cosa" as never },
        fresh,
        "feelverse_staging",
      ),
    ).toThrow(/FORMATO DESCONOCIDO/);
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
