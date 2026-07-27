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
 *   GUIDE_ACTOR_SOURCE=LAYOUT_AUTHENTICATED_USER_ME
 *   GUIDE_GUIDE_PAGES_GET_SESSION_USER_REFERENCES=0
 *   GUIDE_REFRESH_ONLY_SESSION_REDIRECT_TO_LOGIN=false
 *   GUIDE_RAW_USER_ID_CLIENT_PROPS=0
 *   AUTH_SERVER_COMPONENT_TOKEN_ROTATION_COUNT=0
 *   AUTH_REFRESH_WRITABLE_BOUNDARY=true
 *   GUIDE_NAVIGATION_TOKEN_SYNC_BOUNDARY=template
 *   GUIDE_NAVIGATION_TOKEN_SYNC_COUNT=1
 *   GUIDE_API_CLIENT_CONFIGURE_IN_RENDER_COUNT=0
 *   GUIDE_API_CLIENT_CONFIGURE_IN_EFFECT_COUNT=1
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

  it("resolves the actor in the LAYOUT, never in the guide pages", () => {
    // GUIDE_ACTOR_SOURCE=LAYOUT_AUTHENTICATED_USER_ME — the layout is the ONE
    // place that fetches `/user/me` and derives the scope, so the guide pages
    // stay identity-free (DASHBOARD_USER_ME_FETCH_COUNT=1).
    const layout = stripComments(
      readFileSync(join(WEB_SRC, "app", "dashboard", "layout.tsx"), "utf8"),
    );
    expect(layout).toMatch(/serverFetch<UserMeResponse>\("\/user\/me"\)/);
    expect(layout).toMatch(/deriveGuideRecoveryActorScope\(me\.user\.id\)/);
    expect(layout).toMatch(/GuideActorScopeProvider/);

    const pages = [
      join(EXPLORACIONES_DIR, "page.tsx"),
      join(EXPLORACIONES_DIR, "eec-c1-cuerpo-antes-que-mente", "page.tsx"),
    ];
    for (const file of pages) {
      const source = stripComments(readFileSync(file, "utf8"));
      const label = relative(EXPLORACIONES_DIR, file);

      // The pages must not fetch identity again, and must not decode the
      // access cookie themselves — GUIDE_GUIDE_PAGES_GET_SESSION_USER_REFERENCES=0.
      expect(
        source.includes('serverFetch<UserMeResponse>("/user/me")'),
        label,
      ).toBe(false);
      expect(source.includes("deriveGuideRecoveryActorScope"), label).toBe(
        false,
      );
      expect(source.includes("getSessionUser"), label).toBe(false);

      // GUIDE_REFRESH_ONLY_SESSION_REDIRECT_TO_LOGIN=false — no hand-rolled
      // bounce to /login; the middleware owns renewal.
      expect(source.includes('redirect("/login")'), label).toBe(false);

      // GUIDE_RAW_USER_ID_CLIENT_PROPS=0 — the pages carry no raw identity.
      expect(source.includes("me.user.id"), label).toBe(false);
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
    // The guide card is rendered through its own mount, not a journey component.
    expect(page).toMatch(/<GuideEntryCardMount\s*\/>/);
    expect(page).not.toMatch(/journeys\.(push|concat|unshift)/);
    expect(page).not.toMatch(/ExFeaturedCard\s+journey=\{\s*guide/);
  });

  it("re-syncs the client token per navigation via a template", () => {
    // GUIDE_NAVIGATION_TOKEN_SYNC_BOUNDARY=template — App Router remounts a
    // template on every navigation (a layout would be preserved and keep a
    // stale token). Exactly one such sync point exists.
    const template = stripComments(
      readFileSync(join(EXPLORACIONES_DIR, "template.tsx"), "utf8"),
    );
    expect(template).toMatch(/getAccessToken\(\)/);
    expect(template).toMatch(/<GuideApiClientBoundary/);

    // The template resolves NO identity: no /user/me, no actorScope, no refresh.
    expect(template.includes('serverFetch<UserMeResponse>("/user/me")')).toBe(
      false,
    );
    expect(template.includes("deriveGuideRecoveryActorScope")).toBe(false);
    expect(template.includes("getRefreshToken")).toBe(false);

    // The boundary re-configures the singleton and keeps the refresh cookie
    // out of the client; it reads no cookies and stores no token of its own.
    const boundary = stripComments(
      readFileSync(join(GUIDE_DIR, "GuideApiClientBoundary.tsx"), "utf8"),
    );
    expect(boundary).toMatch(/apiClient\.configure/);
    expect(boundary).toMatch(/getRefreshToken:\s*\(\)\s*=>\s*null/);
    expect(boundary.includes("cookies")).toBe(false);
    expect(boundary.includes("localStorage")).toBe(false);

    // GUIDE_API_CLIENT_CONFIGURE_IN_RENDER_COUNT=0 — configuring the singleton
    // is a side effect, so it must live inside a `useEffect`, NOT in render
    // (where SSR runs it and concurrent React may repeat/abandon it).
    expect(boundary).toMatch(/useEffect\(/);
    // No side effect smuggled into a lazy initializer or a memo.
    expect(boundary).not.toMatch(/useState\(\s*\(\s*\)\s*=>/);
    expect(boundary).not.toMatch(/useMemo\(/);
    // The single `configure` call appears AFTER `useEffect(` and never before,
    // so it cannot be running in the component body.
    const idxEffect = boundary.indexOf("useEffect(");
    const idxConfigure = boundary.indexOf("apiClient.configure(");
    expect(idxEffect).toBeGreaterThan(-1);
    expect(idxConfigure).toBeGreaterThan(idxEffect);

    // GuideActorScopeProvider stays in the LAYOUT, not the template.
    expect(template.includes("GuideActorScopeProvider")).toBe(false);
    const layout = stripComments(
      readFileSync(join(WEB_SRC, "app", "dashboard", "layout.tsx"), "utf8"),
    );
    expect(layout).toMatch(/GuideActorScopeProvider/);
  });

  it("serverFetch does not rotate the token pair during a render", () => {
    // AUTH_SERVER_COMPONENT_TOKEN_ROTATION_COUNT=0 — the render context cannot
    // persist a rotated pair, so it must not call the refresh endpoint. The
    // renewal is the middleware's job (AUTH_REFRESH_WRITABLE_BOUNDARY=true).
    const apiServer = stripComments(
      readFileSync(join(WEB_SRC, "lib", "api.server.ts"), "utf8"),
    );
    expect(apiServer).not.toMatch(/authApi\.refresh/);
    expect(apiServer).not.toMatch(/attemptRefresh/);

    const middleware = stripComments(
      readFileSync(join(WEB_SRC, "middleware.ts"), "utf8"),
    );
    expect(middleware).toMatch(/\/api\/auth\/refresh/);
    // Rotated pair persisted on BOTH the request (this render) and response.
    expect(middleware).toMatch(/request\.cookies\.set/);
    expect(middleware).toMatch(/response\.cookies\.set/);
  });
});
