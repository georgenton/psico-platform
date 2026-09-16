import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PRODUCTION_CIRCLE_TEMPLATES } from "@psico/types";

/**
 * PR4's limits, as a check rather than a promise.
 *
 * PR3's scope test used to assert that no Web file mentioned Círculos. PR4 is
 * the cut that adds them, so that assertion moved here and inverted: what this
 * file pins is everything PR4 is NOT.
 */

const WEB = resolve(__dirname, "../..");
const ROOT = resolve(WEB, "../..");

/**
 * The PRODUCTION files PR4 adds under the web app.
 *
 * Tests and fixtures are excluded on purpose: several of them name
 * `localStorage` precisely in order to assert it stays empty, and a rule that
 * counted those would be a rule that forbids checking the rule.
 */
function circulosSources(): string[] {
  const roots = [
    "src/lib/circulos",
    "src/components/circulos",
    "src/app/api/circulos",
    "src/app/actividades",
    "src/app/i",
    "src/app/compartir",
    "src/app/dashboard/circulos",
  ];
  const out: string[] = [];
  for (const r of roots) {
    const dir = join(WEB, r);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir, {
      recursive: true,
    } as never) as string[]) {
      if (typeof f !== "string") continue;
      if (!/\.(ts|tsx)$/.test(f)) continue;
      if (/\.(test|spec)\.tsx?$/.test(f)) continue;
      if (f.includes("__fixtures__")) continue;
      out.push(join(dir, f));
    }
  }
  return out;
}

/**
 * Source with comments stripped.
 *
 * These files DESCRIBE what they refuse to do — "never written to
 * `localStorage`" — so a textual rule that counted prose would forbid writing
 * the guarantee down. The same `code()` stripping the API's own scope spec
 * uses, for the same reason.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
}

const sources = () =>
  circulosSources()
    .map((f) => code(readFileSync(f, "utf8")))
    .join("\n");

describe("PR4 adds no backend", () => {
  it("adds no Prisma schema, model or migration", () => {
    const all = sources();
    for (const forbidden of ["PrismaClient", "prisma.", "@prisma/client"]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
    // The WEB cut still adds no backend: nothing above this line changed, and
    // the files scanned are `apps/web` only.
    //
    // The COUNT moves only with a NAME. It was PR3's number, held by PR4; the
    // pilot-readiness cut added `20260913000000_circles_account_deletion` and
    // the approved artifact policy adds
    // `20260915000000_circles_artifact_purge`. Both are API migrations, both
    // are named here, and an unnamed newcomer still fails — which is the only
    // thing this assertion is for.
    const migrations = readdirSync(join(ROOT, "apps/api/prisma/migrations"), {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(migrations).toContain("20260913000000_circles_account_deletion");
    expect(migrations).toContain("20260915000000_circles_artifact_purge");
    // …and the one this block owes: three tables for aggregated analytics,
    // purely additive. An API migration, named here like the others, because
    // raising the number without adding a name is what this assertion refuses.
    expect(migrations).toContain("20260916000000_circles_analytics");
    // …and the one adult groups owes. Still an API migration; the Web cut adds
    // no backend, which is the only thing this assertion is about.
    expect(migrations).toContain("20260916100000_circles_adult_groups");
    expect(migrations).toHaveLength(68);
  });

  it("touches no Mobile file", () => {
    const hits = (
      readdirSync(join(ROOT, "apps/mobile/app"), {
        recursive: true,
      } as never) as string[]
    ).filter((f) => typeof f === "string" && /circle|circulo/i.test(f));
    expect(hits).toEqual([]);
  });

  it("adds no Redis, queue, worker or Eco surface", () => {
    const all = sources();
    for (const forbidden of [
      "ioredis",
      "BullMQ",
      "bullmq",
      "Queue",
      "ecoFacilitator",
      "EcoFacilitator",
    ]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
  });
});

describe("PR4 adds no real-time transport", () => {
  it("uses polling, not sockets or streams", () => {
    const all = sources();
    for (const forbidden of [
      "WebSocket",
      "new EventSource",
      "text/event-stream",
      "socket.io",
    ]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
  });
});

describe("PR4 stores no draft and loads no third party", () => {
  it("writes nothing to browser storage anywhere in the flow", () => {
    const all = sources();
    // The private preparation is the reason this rule exists, but it holds for
    // every file in the cut: a draft that reaches storage is a draft that
    // outlives the tab.
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
    ]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
  });

  it("loads no analytics, pixel or third-party script", () => {
    const all = sources();
    for (const forbidden of [
      "googletagmanager",
      "google-analytics",
      "posthog",
      "Sentry.captureMessage",
      "<script src",
      "https://cdn",
    ]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
  });
});

describe("production publishes exactly what was approved, and nothing else", () => {
  it("OFFERS one version per key, and keeps a predecessor resolvable", () => {
    // This asserted emptiness while nothing was approved, then a count of one,
    // then one PUBLISHED beside one DRAFT. None of those was the point —
    // "only what somebody approved is offered" was.
    //
    // Jorge walked @2 end to end in the hosted test environment and approved
    // it, so @2 is now what is offered and @1 is ARCHIVED: withdrawn from the
    // listing, the organiser screen and the public preview, and still resolved
    // by `getExact` for the activities that are running on it.
    expect(
      PRODUCTION_CIRCLE_TEMPLATES.map(
        (t) => `${t.templateKey}@${t.templateVersion}:${t.status}`,
      ),
    ).toEqual([
      "duo-lo-que-me-ayuda@1:ARCHIVED",
      "duo-lo-que-me-ayuda@2:PUBLISHED",
      "grupo-lo-que-nos-ayuda@1:PUBLISHED",
    ]);
    const offered = PRODUCTION_CIRCLE_TEMPLATES.find(
      (t) =>
        t.templateKey === "duo-lo-que-me-ayuda" && t.status === "PUBLISHED",
    )!;
    expect(offered.templateKey).toBe("duo-lo-que-me-ayuda");
    expect(offered.templateVersion).toBe(2);
    expect(offered.audience).toBe("DUO_ADULT");
    expect(offered.ecoMode).toBe("NONE");
    expect(offered.participants).toEqual({ min: 2, max: 2, required: 2 });
    expect(offered.source.experiencePin).toEqual({
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
    });
  });

  it("publishes AT MOST ONE version of a key, because a URL carries no version", () => {
    // Not a restatement of the list above — it is the REASON that list has to
    // look the way it does, and the rule that was followed when @2 was
    // published: @1 was archived in the same change.
    //
    // A link to an activity names a key and never a version, so the server is
    // asked "which version does this key mean now". Two PUBLISHED versions give
    // that question no answer: `resolvePublishedTemplateByKey` refuses rather
    // than picking the higher one, the organiser route 404s, and the CTA stops
    // rendering everywhere at once. Publishing a version is therefore a
    // SUCCESSION — @2 goes PUBLISHED and @1 goes ARCHIVED in the same change,
    // which withdraws it from every surface that OFFERS while leaving it
    // resolvable by pin for the activities already running on it.
    const publishedPerKey = new Map<string, number[]>();
    for (const t of PRODUCTION_CIRCLE_TEMPLATES) {
      if (t.status !== "PUBLISHED") continue;
      publishedPerKey.set(t.templateKey, [
        ...(publishedPerKey.get(t.templateKey) ?? []),
        t.templateVersion,
      ]);
    }
    for (const [key, versions] of publishedPerKey) {
      expect(`${key}: ${versions.join(", ")}`).toBe(`${key}: ${versions[0]}`);
    }
  });

  it("carries the approved copy of @1 unchanged, now that it is archived", () => {
    // Archiving withdraws @1 from what is OFFERED. It does not edit it: the
    // people whose activities are pinned here agreed to these exact words, and
    // a published template is immutable whatever its status becomes later.
    const approved = PRODUCTION_CIRCLE_TEMPLATES.find(
      (t) => t.templateVersion === 1,
    )!;
    expect(approved.status).toBe("ARCHIVED");
    expect(approved.title).toBe("Lo que me ayuda cuando estoy así");
    expect(approved.privatePreparation.map((f) => f.label)).toEqual([
      "Cuando estoy así, me ayuda que…",
      "Y no me ayuda que…",
    ]);
    expect(approved.conversation.turns).toEqual([
      "Léelo sin responder todavía. ¿Qué de lo que dijo el otro te resulta fácil de hacer?",
      "¿Y qué te costaría? Decirlo ahora ahorra un malentendido después.",
    ]);
    // Six, exactly, and each one a situation a person can recognise.
    expect(approved.safety.doNotSuggestWhen).toHaveLength(6);
    expect(approved.safety.level).toBe("REINFORCED");
    expect(approved.safety.privateGateRequired).toBe(true);
    // "Nothing" stays a complete answer.
    expect(approved.sharing.allowedModes).toContain("KEEP_PRIVATE");
  });

  it("keeps the fixtures out of the shipped catalog", () => {
    const catalog = readFileSync(
      join(ROOT, "packages/types/src/circles-catalog.ts"),
      "utf8",
    );
    expect(catalog).not.toContain("fixture-duo");
    expect(catalog).not.toContain("e2e-duo-sintetica");
    // And none of the nine Parejas drafts arrived by the back door. The list is
    // explicit rather than "every entry is the same key", because there are two
    // activities now — each one named, so a third has to be argued for here.
    expect(
      new Set(PRODUCTION_CIRCLE_TEMPLATES.map((t) => t.templateKey)),
    ).toEqual(new Set(["duo-lo-que-me-ayuda", "grupo-lo-que-nos-ayuda"]));
  });
});

describe("PR4 never trusts the browser for identity", () => {
  it("reads no actor field from a request body or query string", () => {
    // The cookie is the credential; the API resolves the actor from it. A web
    // handler that read one of these would be letting the browser choose who
    // it is.
    for (const file of circulosSources()) {
      if (!file.includes("/app/api/circulos/")) continue;
      const src = readFileSync(file, "utf8");
      for (const claimed of [
        "raw.userId",
        "raw.participantId",
        "raw.circleId",
        "raw.memberId",
        "raw.role",
        'searchParams.get("userId")',
      ]) {
        expect(src, `${file} · ${claimed}`).not.toContain(claimed);
      }
    }
  });
});
