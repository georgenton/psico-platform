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
    // The migration count is PR3's. PR4 must not move it.
    const migrations = readdirSync(join(ROOT, "apps/api/prisma/migrations"), {
      withFileTypes: true,
    }).filter((d) => d.isDirectory());
    expect(migrations).toHaveLength(64);
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

describe("PR4 publishes no content", () => {
  it("leaves the production catalog empty", () => {
    // Publishing a template is an editorial act with its own approval. The
    // fixtures live under `__fixtures__` and are imported only by tests.
    expect(PRODUCTION_CIRCLE_TEMPLATES).toHaveLength(0);
  });

  it("keeps the fixtures out of the shipped catalog", () => {
    const catalog = readFileSync(
      join(ROOT, "packages/types/src/circles-catalog.ts"),
      "utf8",
    );
    expect(catalog).not.toContain("fixture-duo");
    expect(catalog).toContain(
      "export const PRODUCTION_CIRCLE_TEMPLATES: readonly CircleActivityDefinition[] =\n  [];",
    );
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
