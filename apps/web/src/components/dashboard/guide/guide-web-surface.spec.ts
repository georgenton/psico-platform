import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.5 — the ratchet over the Guide WEB surface.
 *
 * Scope is deliberately narrow: the guide components, the guide route and the
 * Exploraciones page. It does not scan the backend, where words like `result`
 * or `conceptKey` are legitimate domain terms — a ratchet that fired on those
 * would be noise, and noisy ratchets get deleted.
 *
 *   GUIDE_WEB_ROUTE_COUNT=1
 *   GUIDE_WEB_PRESENTATION_COUNT=1
 *   GUIDE_WEB_START_AUTOMATIC_WITHOUT_RECOVERY=false
 *   GUIDE_WEB_CLIENT_PROGRESS_WRITES=0
 *   GUIDE_WEB_CORRECT_OPTION_REFERENCES=0
 *   GUIDE_WEB_USER_ID_REQUEST_FIELDS=0
 *   GUIDE_WEB_EDITORIAL_CONTEXT_REQUEST_FIELDS=0
 *   GUIDE_WEB_RESULT_REQUEST_FIELDS=0
 *   GUIDE_RECOVERY_ACTOR_SCOPE_REQUIRED=true
 *   GUIDE_RECOVERY_RAW_USER_ID_FIELDS=0
 *   GUIDE_RECOVERY_EMAIL_FIELDS=0
 *   GUIDE_RECOVERY_TOKEN_FIELDS=0
 *   GUIDE_RECOVERY_SCOPE_SENT_TO_API=false
 *   GUIDE_CROSS_ACCOUNT_AUTO_START_CALLS=0
 *   GUIDE_ACTOR_SOURCE=AUTHENTICATED_USER_ME
 *   GUIDE_GUIDE_PAGES_GET_SESSION_USER_REFERENCES=0
 *   GUIDE_REFRESH_ONLY_SESSION_REDIRECT_TO_LOGIN=false
 *   GUIDE_RAW_USER_ID_CLIENT_PROPS=0
 */

const GUIDE_DIR = __dirname;
const WEB_SRC = join(__dirname, "..", "..", "..");
const EXPLORACIONES_DIR = join(WEB_SRC, "app", "dashboard", "exploraciones");

function runtimeFiles(dir: string): string[] {
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((full) => statSync(full).isFile())
    .filter(
      (full) => /\.tsx?$/.test(full) && !/\.(spec|test)\.tsx?$/.test(full),
    );
}

/** Comments explaining an absence must never trip a ratchet. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const GUIDE_FILES = runtimeFiles(GUIDE_DIR);

describe("ratchet · guide web surface", () => {
  it("publishes exactly one guide route and one presentation catalog", () => {
    const routes = readdirSync(EXPLORACIONES_DIR)
      .map((entry) => join(EXPLORACIONES_DIR, entry))
      .filter((full) => statSync(full).isDirectory());
    expect(routes).toHaveLength(1);
    expect(relative(EXPLORACIONES_DIR, routes[0]!)).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );
    // No dynamic segment: there is no discovery endpoint to back one.
    expect(routes[0]!.includes("[")).toBe(false);

    const catalogs = GUIDE_FILES.filter((f) =>
      f.endsWith("guide-presentation.ts"),
    );
    expect(catalogs).toHaveLength(1);
  });

  it("never sends a userId, editorial context or a verdict", () => {
    const forbidden = [
      "userId",
      "editionKey",
      "unitKey",
      "editionId",
      "unitId",
      "bookId",
      "revisionId",
      "conceptKey",
      "exerciseKey",
      "itemKey",
      "confirmationKey",
      "completionPolicy",
      "correctOptionKey",
      "evaluationSource",
    ];
    for (const file of GUIDE_FILES) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const key of forbidden) {
        expect(
          source.includes(key),
          `${relative(GUIDE_DIR, file)} → ${key}`,
        ).toBe(false);
      }
    }
  });

  it("never writes progress: no client-side counter feeds a transition", () => {
    for (const file of GUIDE_FILES) {
      const source = stripComments(readFileSync(file, "utf8"));
      // The classic ways a UI starts owning progress.
      expect(source).not.toMatch(/stepsCompleted\s*\+\s*1/);
      expect(source).not.toMatch(/stepsCompleted\s*\+\+/);
      expect(source).not.toMatch(/setStepsCompleted/);
      expect(source).not.toMatch(/setCurrentStep\b/);
      expect(source).not.toMatch(/stepIndex/);
    }
  });

  it("the only guideApi calls are the five commands", () => {
    const player = readFileSync(join(GUIDE_DIR, "GuidePlayer.tsx"), "utf8");
    const calls = [...player.matchAll(/guideApi\.([a-zA-Z]+)\(/g)].map(
      (m) => m[1]!,
    );
    expect([...new Set(calls)].sort()).toEqual([
      "cancelGuideSession",
      "completeGuideSession",
      "completeGuideSessionStep",
      "createGuideSession",
      "submitGuideStepRecall",
    ]);
    // No read endpoint exists — the UI must not invent one.
    expect(player).not.toMatch(/guideApi\.get/);
    expect(player).not.toMatch(/setInterval|setTimeout\s*\(\s*.*poll/i);
  });

  it("shows no correctness verdict anywhere on the surface", () => {
    const surface = [
      ...GUIDE_FILES,
      join(EXPLORACIONES_DIR, "page.tsx"),
      join(EXPLORACIONES_DIR, "eec-c1-cuerpo-antes-que-mente", "page.tsx"),
    ];
    for (const file of surface) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const word of [
        "Respuesta correcta",
        "Incorrecto",
        "Puntuación",
        "aciertos",
      ]) {
        expect(source.includes(word), `${file} → ${word}`).toBe(false);
      }
    }
  });

  it("binds the recovery record to an actor scope, and only to a scope", () => {
    const recovery = readFileSync(join(GUIDE_DIR, "guide-recovery.ts"), "utf8");
    // GUIDE_RECOVERY_ACTOR_SCOPE_REQUIRED=true — the parser cannot be called
    // without an expected scope, and the record declares one.
    expect(recovery).toMatch(/actorScope: string;/);
    expect(recovery).toMatch(/expectedActorScope: string/);
    expect(recovery).toMatch(/value\.actorScope !== expectedActorScope/);

    // GUIDE_RECOVERY_RAW_USER_ID_FIELDS=0 · EMAIL=0 · TOKEN=0
    const source = stripComments(recovery);
    for (const forbidden of [
      "userId",
      "email",
      "accessToken",
      "refreshToken",
      "jwt",
    ]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
  });

  it("derives the scope server-side and never sends it to the API", () => {
    const scopeModule = readFileSync(
      join(WEB_SRC, "lib", "guide-recovery-scope.server.ts"),
      "utf8",
    );
    // `server-only` is what makes a client import a BUILD error, not a review
    // comment — the raw user id can never cross the boundary.
    expect(scopeModule).toMatch(/^import "server-only";/m);
    expect(scopeModule).toMatch(/createHash\("sha256"\)/);

    // GUIDE_RECOVERY_SCOPE_SENT_TO_API=false — the player passes the scope to
    // storage helpers only; no guideApi call carries it.
    const player = readFileSync(join(GUIDE_DIR, "GuidePlayer.tsx"), "utf8");
    for (const call of [
      ...player.matchAll(/guideApi\.[a-zA-Z]+\(([^;]*?)\);/g),
    ]) {
      expect(call[1]).not.toContain("actorScope");
    }
  });

  it("resolves the actor through the authenticated user, not a cookie", () => {
    const pages = [
      join(EXPLORACIONES_DIR, "page.tsx"),
      join(EXPLORACIONES_DIR, "eec-c1-cuerpo-antes-que-mente", "page.tsx"),
    ];
    for (const file of pages) {
      const source = stripComments(readFileSync(file, "utf8"));
      const label = relative(EXPLORACIONES_DIR, file);

      // GUIDE_ACTOR_SOURCE=AUTHENTICATED_USER_ME
      expect(source, label).toMatch(
        /serverFetch<UserMeResponse>\("\/user\/me"\)/,
      );
      expect(source, label).toMatch(
        /deriveGuideRecoveryActorScope\(me\.user\.id\)/,
      );

      // GUIDE_GUIDE_PAGES_GET_SESSION_USER_REFERENCES=0 — decoding the access
      // cookie would lock out a session whose access token expired but whose
      // refresh token is still valid.
      expect(source.includes("getSessionUser"), label).toBe(false);

      // GUIDE_REFRESH_ONLY_SESSION_REDIRECT_TO_LOGIN=false — the fetcher owns
      // the auth outcome; a hand-rolled bounce to /login is what the
      // middleware sends straight back to /dashboard.
      expect(source.includes('redirect("/login")'), label).toBe(false);

      // GUIDE_RAW_USER_ID_CLIENT_PROPS=0 — only the derived scope crosses.
      expect(source.includes("me.user.id}"), label).toBe(false);
      expect(source.includes("userId={"), label).toBe(false);
      expect(source.includes("email={"), label).toBe(false);
    }
  });

  it("never swallows a Next redirect while degrading journeys", () => {
    const source = stripComments(
      readFileSync(join(EXPLORACIONES_DIR, "page.tsx"), "utf8"),
    );
    // A bare `catch {` around a serverFetch turns a forced re-login into a
    // fully rendered page for a session that no longer exists.
    expect(source).not.toMatch(/catch\s*\{/);
    expect(source).toMatch(/if \(isNextThrow\(err\)\) throw err;/);
  });

  it("the guide never enters the Journey list or its components", () => {
    const page = readFileSync(join(EXPLORACIONES_DIR, "page.tsx"), "utf8");
    // The guide card is rendered on its own, not through a journey component.
    expect(page).toMatch(/<GuideEntryCard\s+actorScope=\{actorScope\}\s*\/>/);
    expect(page).not.toMatch(/journeys\.(push|concat|unshift)/);
    expect(page).not.toMatch(/ExFeaturedCard\s+journey=\{\s*guide/);
  });
});
