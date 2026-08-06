import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
 *   GUIDE_WEB_AVAILABILITY_DEFAULT=false
 *   GUIDE_WEB_AVAILABILITY_GATES_ENTRY=true
 *   GUIDE_WEB_AVAILABILITY_GATES_PLAYER=true
 *   GUIDE_WEB_AVAILABILITY_FETCH_NO_STORE=true
 *   GUIDE_WEB_AVAILABILITY_FAILS_CLOSED=true
 *   GUIDE_WEB_ROLLOUT_MODE_REFERENCES=0
 *   GUIDE_WEB_PILOT_ALLOWLIST_REFERENCES=0
 *
 * GR-4 added the multi-guide ratchets. The web now knows two guides, and the
 * failure mode that introduces is subtle: a runtime that quietly reaches for
 * "the" guide would keep working — on Emociones — and be silently wrong on
 * every other one.
 *
 *   GLOBAL_GUIDE_KEY_SINGLETON_IMPORTS=0
 *   GLOBAL_GUIDE_PRESENTATION_SINGLETON_IMPORTS=0
 *   GLOBAL_GUIDE_READER_COPY_SINGLETON_IMPORTS=0
 *   STARTSWITH_STEP_SCENE_INFERENCE=0
 *   CLIENT_CORRECT_OPTION_KEY_LITERAL=0
 *   FALLBACK_TO_EEC=0
 *
 * GR-4 (B.1) closed two edges that only bite with more than one guide or more
 * than one recall:
 *
 *   OPTION_VALIDATION_IS_STEP_SCOPED=true
 *   CROSS_RECALL_OPTION_ACCEPTED=false
 *   READER_GUIDE_PANEL_PIN_KEY_REQUIRED=true
 */

const GUIDE_DIR = __dirname;
/** GR-6 — the one player and its parts. */
const EXPERIENCE_DIR = join(__dirname, "..", "experience");
const WEB_SRC = join(__dirname, "..", "..", "..");
const EXPLORACIONES_DIR = join(WEB_SRC, "app", "dashboard", "exploraciones");

function runtimeFiles(dir: string): string[] {
  return (
    readdirSync(dir)
      .map((entry) => join(dir, entry))
      .filter((full) => statSync(full).isFile())
      .filter(
        (full) => /\.tsx?$/.test(full) && !/\.(spec|test)\.tsx?$/.test(full),
      )
      // Test scaffolding is not the shipped surface. `guide-test-fixtures.ts`
      // exists so a test can name a pin and a scene binding; holding it to the
      // runtime ban would mean no test could build a fixture at all, which
      // buys nothing and costs the coverage the ratchets exist to protect.
      .filter((full) => !/guide-test-fixtures\.ts$/.test(full))
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
        // GR-3 — the panel confirms a RESONANCE, which is a different contract
        // on a different endpoint: `POST /resonances` takes the concept key as
        // its payload, by design and with the reader's explicit tap. The ban is
        // about what a GUIDE command may carry, so it is checked on that call
        // path below rather than on the whole file.
        if (file.endsWith("ReaderGuidePanel.tsx") && key === "conceptKey") {
          continue;
        }
        // GR-6 — the panel also carries `bookId`, and for a comparable
        // reason: the chapter-media surfaces key on the book id, and the
        // AUDIO scene mounts the reader's own `AudioBar`. It is plumbing for
        // a DIFFERENT contract, not context for a guide command — and the
        // assertion below is the one that matters, because the panel makes no
        // guideApi call at all.
        if (file.endsWith("ReaderGuidePanel.tsx") && key === "bookId") {
          continue;
        }
        expect(
          source.includes(key),
          `${relative(GUIDE_DIR, file)} → ${key}`,
        ).toBe(false);
      }
    }

    // …and the exemption is narrow: the panel's only network call is the
    // resonance, and it never reaches a Guide route.
    const panel = stripComments(
      readFileSync(join(GUIDE_DIR, "ReaderGuidePanel.tsx"), "utf8"),
    );
    expect(panel).not.toMatch(/guideApi\./);
    expect(panel).not.toMatch(/\/guide\//);
    const fetches = [
      ...panel.matchAll(/fetch\(`\$\{apiBase\}(\/[a-z-]+)/g),
    ].map((m) => m[1]);
    expect(fetches).toEqual(["/resonances"]);
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

  it("the only guideApi calls are the five commands, from ONE file", () => {
    // GR-3 — the run moved into `use-guide-run`, shared by the standalone
    // route and the reader panel. Asserting that it is the SOLE caller is the
    // point: two copies of this logic would eventually disagree about whether
    // a command had applied, which is exactly what idempotency prevents.
    const runner = readFileSync(join(GUIDE_DIR, "use-guide-run.ts"), "utf8");
    const calls = [...runner.matchAll(/guideApi\.([a-zA-Z]+)\(/g)].map(
      (m) => m[1]!,
    );
    expect([...new Set(calls)].sort()).toEqual([
      "cancelGuideSession",
      "completeGuideSession",
      "completeGuideSessionStep",
      "createGuideSession",
      // GR-7 — the one READ, and it is not a sixth command: it creates
      // nothing. It replaced `getRecoverableSession` at boot because that one
      // sees ACTIVE runs only, so a finished journey came back looking like
      // one nobody had ever opened.
      "getExperienceState",
      "submitGuideStepRecall",
    ]);
    expect(runner).not.toMatch(/setInterval|setTimeout\s*\(\s*.*poll/i);

    // Nobody else on the surface talks to the Guide API directly.
    for (const file of GUIDE_FILES) {
      if (file.endsWith("use-guide-run.ts")) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      expect(
        /guideApi\.[a-zA-Z]+\(/.test(source),
        `${relative(GUIDE_DIR, file)} calls guideApi directly`,
      ).toBe(false);
    }
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
    const player = readFileSync(
      join(EXPERIENCE_DIR, "ExperiencePlayer.tsx"),
      "utf8",
    );
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

  it("the pilot availability gate defaults closed and gates both mounts", () => {
    // GUIDE_WEB_AVAILABILITY_DEFAULT=false — an unresolved availability behaves
    // exactly like being outside the pilot; it never assumes the guide is on.
    const ctx = stripComments(
      readFileSync(join(GUIDE_DIR, "guide-availability.tsx"), "utf8"),
    );
    expect(ctx).toMatch(/createContext<boolean>\(false\)/);

    // GUIDE_WEB_AVAILABILITY_GATES_ENTRY=true — the entry card is hidden when
    // the gate is closed (returns null before rendering the card).
    const entry = stripComments(
      readFileSync(join(GUIDE_DIR, "GuideEntryCardMount.tsx"), "utf8"),
    );
    expect(entry).toMatch(/useGuideAvailability\(\)/);
    expect(entry).toMatch(/if \(!available\) return null;/);

    // GUIDE_WEB_AVAILABILITY_GATES_PLAYER=true — the player is not mounted when
    // the gate is closed; a calm "not available" card shows instead.
    const player = stripComments(
      readFileSync(join(GUIDE_DIR, "GuidePlayerMount.tsx"), "utf8"),
    );
    expect(player).toMatch(/useGuideAvailability\(\)/);
    expect(player).toMatch(/if \(!available\)/);
    expect(player).toContain("Esta guía no está disponible por ahora");
  });

  it("resolves availability with no-store and fails closed to false", () => {
    // GUIDE_WEB_AVAILABILITY_FETCH_NO_STORE=true — the decision is per-actor and
    // must never be cached; GUIDE_WEB_AVAILABILITY_FAILS_CLOSED=true — any
    // failure yields false, so it is NOT a serverFetch (a 401 must not log out).
    const template = stripComments(
      readFileSync(join(EXPLORACIONES_DIR, "template.tsx"), "utf8"),
    );
    expect(template).toMatch(/\/api\/guide\/availability/);
    expect(template).toMatch(/cache:\s*"no-store"/);
    expect(template).toMatch(/GuideAvailabilityProvider/);
    // Fails closed: both the no-token guard and the catch return false.
    expect(template).toMatch(/return false;/);
    // The availability probe is a raw fetch, not serverFetch (no forced logout).
    expect(template.includes("serverFetch<GuideAvailabilityResponse>")).toBe(
      false,
    );
  });

  it("never reveals the rollout mode, the allowlist or the reason", () => {
    // GUIDE_WEB_ROLLOUT_MODE_REFERENCES=0 · GUIDE_WEB_PILOT_ALLOWLIST_REFERENCES=0
    // The web surface knows only the opaque boolean; it must not name the mode
    // (off/pilot/on), the allowlist, or the server-side env vars.
    const surface = [
      ...GUIDE_FILES,
      join(EXPLORACIONES_DIR, "template.tsx"),
      join(EXPLORACIONES_DIR, "page.tsx"),
    ];
    const forbidden = [
      "GUIDE_ROLLOUT_MODE",
      "GUIDE_PILOT_USER_IDS",
      "pilotUserIds",
      "allowlist",
      "rolloutMode",
    ];
    for (const file of surface) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const term of forbidden) {
        expect(source.includes(term), `${file} → ${term}`).toBe(false);
      }
    }
  });

  it("maps GUIDE_UNAVAILABLE to a reassuring, retryable message", () => {
    const errors = stripComments(
      readFileSync(join(GUIDE_DIR, "guide-errors.ts"), "utf8"),
    );
    expect(errors).toMatch(/GUIDE_UNAVAILABLE:/);
    // Retryable — an env flip can reopen the gate — and it reassures about
    // saved progress rather than alarming.
    expect(errors).toContain(
      "Esta guía no está disponible por ahora. Tu avance sigue guardado.",
    );
  });

  // ── GR-4 · multi-guide ────────────────────────────────────────────────────

  /**
   * The files that must be guide-AGNOSTIC. Each one is reached with a pin the
   * caller supplies; naming a guide inside any of them would reintroduce the
   * singleton under a different spelling.
   */
  // Full paths since GR-6: the player and the scene cursor moved next door,
  // and the property they carry — a runtime that works for ANY pinned guide —
  // moved with them.
  const GENERIC_RUNTIME = [
    join(GUIDE_DIR, "use-guide-run.ts"),
    join(GUIDE_DIR, "guide-recovery.ts"),
    join(GUIDE_DIR, "guide-web-bundle.ts"),
    join(GUIDE_DIR, "guide-pin.ts"),
    join(GUIDE_DIR, "ReaderGuidePanel.tsx"),
    join(EXPERIENCE_DIR, "ExperiencePlayer.tsx"),
    join(EXPERIENCE_DIR, "experience-scene-store.ts"),
    join(EXPERIENCE_DIR, "experience-presentation.ts"),
    join(EXPERIENCE_DIR, "experience-scene-registry.ts"),
  ];

  /**
   * Where naming Emociones explicitly is CORRECT, not a leak:
   *
   *   - its own definition and copy (a catalog must name its entries);
   *   - the standalone route/card, which publish that exact guide and say so;
   *   - `LectorShell`, which pins it until GR-4 discovery lands (Session C
   *     replaces that literal with the server's answer);
   *   - test fixtures.
   */
  const EEC_LITERAL_ALLOWED = [
    join(GUIDE_DIR, "guide-presentation.ts"),
    join(GUIDE_DIR, "guide-reader-copy.ts"),
    join(GUIDE_DIR, "GuidePlayerMount.tsx"),
    join(GUIDE_DIR, "GuideEntryCard.tsx"),
    join(GUIDE_DIR, "guide-test-fixtures.ts"),
    join(WEB_SRC, "components", "dashboard", "lector", "LectorShell.tsx"),
  ];

  it("no runtime file imports a global guide singleton", () => {
    // The singletons are GONE, so the check is that nothing reaches for them
    // again under the old names.
    for (const file of [
      ...GUIDE_FILES,
      join(WEB_SRC, "components", "dashboard", "lector", "LectorShell.tsx"),
    ]) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const singleton of [
        "GUIDE_PRESENTATION",
        "GUIDE_READER_COPY",
        "GUIDE_KEY",
        "GUIDE_VERSION",
        "GUIDE_STORAGE_KEY",
        "GUIDE_SCENE_STORAGE_KEY",
      ]) {
        expect(
          new RegExp(`\\b${singleton}\\b`).test(source),
          `${relative(GUIDE_DIR, file)} → ${singleton}`,
        ).toBe(false);
      }
    }
  });

  it("the generic runtime never names a specific guide", () => {
    for (const file of GENERIC_RUNTIME) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const literal of [
        "eec-c1-cuerpo-antes-que-mente",
        "pqp-c1-contacto-sostenido",
        "explorar-cuerpo-antes-que-mente",
        "practicar-escucharte-por-dentro",
        "recordar-cuerpo-antes-que-mente",
        "explorar-contacto-sostenido",
        "practicar-diez-minutos-de-contacto",
        "recordar-contacto-sostenido",
      ]) {
        expect(
          source.includes(literal),
          `${relative(GUIDE_DIR, file)} → ${literal}`,
        ).toBe(false);
      }
    }
  });

  it("FALLBACK_TO_EEC=0 — no file falls back to a guide it was not given", () => {
    const allowed = new Set(EEC_LITERAL_ALLOWED);
    const files = [
      ...GUIDE_FILES,
      join(WEB_SRC, "components", "dashboard", "lector", "LectorShell.tsx"),
    ];
    for (const file of files) {
      if (allowed.has(file)) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      expect(
        source.includes("eec-c1-cuerpo-antes-que-mente"),
        `${relative(GUIDE_DIR, file)} names Emociones outside the allow-list`,
      ).toBe(false);
    }
    // …and nowhere is a resolved bundle or pin defaulted with `??` / `||`.
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(
        /(\?\?|\|\|)\s*(EEC_|resolveGuideWebBundle|guidePresentationRegistry)/.test(
          source,
        ),
        `${relative(GUIDE_DIR, file)} defaults to a guide`,
      ).toBe(false);
    }
  });

  it("STARTSWITH_STEP_SCENE_INFERENCE=0 — the scene is declared, not guessed", () => {
    // GR-6 moved the cursor from the eight-scene machine to the experience
    // definition, and the property survived the move: which panel opens is
    // READ from the pinned scenes, never inferred from a step key's spelling.
    // The old build did `stepKey.startsWith("practicar")`, which quietly made
    // a Spanish word part of the contract.
    const cursor = stripComments(
      readFileSync(join(EXPERIENCE_DIR, "experience-presentation.ts"), "utf8"),
    );
    expect(cursor).not.toMatch(/startsWith\(/);
    // It walks the declared scene order and its bindings instead.
    expect(cursor).toContain("completesGuideStepKey");
  });

  /**
   * GR-6 — ONE player.
   *
   * Before this, the standalone route and the reader panel each rendered their
   * own copy of the run: two sets of scenes, two cursors, two ideas of what
   * "finished" looked like. Two players of the same session is how two screens
   * start disagreeing about what a person has done.
   *
   * This is the ratchet that keeps a second one from coming back.
   */
  it("CANONICAL_PLAYER_IMPLEMENTATIONS=1 — one player, two frames", () => {
    // EXPERIENCE_PLAYER_PRESENT=true
    expect(existsSync(join(EXPERIENCE_DIR, "ExperiencePlayer.tsx"))).toBe(true);

    // GUIDE_PLAYER_V1_PRESENT=false · LEGACY_GUIDE_SCENE_MACHINE_PRESENT=false
    expect(existsSync(join(GUIDE_DIR, "GuidePlayer.tsx"))).toBe(false);
    expect(existsSync(join(GUIDE_DIR, "guide-scene.ts"))).toBe(false);

    // Both mounts render the SAME component.
    for (const mount of ["GuidePlayerMount.tsx", "ReaderGuidePanel.tsx"]) {
      const source = stripComments(
        readFileSync(join(GUIDE_DIR, mount), "utf8"),
      );
      expect(source, mount).toContain("<ExperiencePlayer");
    }

    // READER_PANEL_IS_THIN_WRAPPER=true — the panel owns the drawer, the
    // anchor precondition and the ways back to the book. It does not render a
    // scene, and it does not send a command.
    const panel = stripComments(
      readFileSync(join(GUIDE_DIR, "ReaderGuidePanel.tsx"), "utf8"),
    );
    expect(panel).not.toContain("useGuideRun");
    expect(panel).not.toMatch(/guideApi\./);
  });

  it("RENDERER_REGISTRY_EXHAUSTIVE=true — twelve keys, no default", () => {
    const registry = stripComments(
      readFileSync(
        join(EXPERIENCE_DIR, "experience-scene-registry.ts"),
        "utf8",
      ),
    );
    // The compile-time obligation, stated in the source so a refactor that
    // dropped it would be visible here too.
    expect(registry).toContain(
      "satisfies Record<ExperienceSceneKind, ExperienceSceneRenderer>",
    );
    for (const kind of [
      "INTRO",
      "PASSAGE",
      "CONCEPT",
      "EXAMPLE",
      "AUDIO",
      "VIDEO",
      "PRACTICE",
      "REFLECTION",
      "QUESTION",
      "RECALL",
      "SUMMARY",
      "RESONANCE",
    ]) {
      expect(registry, kind).toMatch(new RegExp(`\\b${kind}:`));
    }
    // No fallback component: an unknown kind must fail closed, not render
    // something that looks like a panel.
    expect(registry).not.toMatch(/\bdefault:/);
  });

  /**
   * GR-6 — the web ships no production catalog.
   *
   * A definition compiled into the bundle cannot change when a CMS publishes.
   * The browser asks the server and renders what it is handed.
   */
  it("WEB_CONSUMES_SERVER_PUBLISHED_EXPERIENCES=true", () => {
    const hook = stripComments(
      readFileSync(join(EXPERIENCE_DIR, "use-chapter-experience.ts"), "utf8"),
    );
    expect(hook).toContain("experienceApi.listPublishedForChapter");

    // No experience file may hard-code a production experience key.
    for (const file of readdirSync(EXPERIENCE_DIR)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      if (file.includes(".test.") || file.includes(".spec.")) continue;
      const source = stripComments(
        readFileSync(join(EXPERIENCE_DIR, file), "utf8"),
      );
      for (const key of [
        "eec-c1-cuerpo-antes-que-mente",
        "pqp-c1-contacto-sostenido",
      ]) {
        expect(source, `${file} names ${key}`).not.toContain(key);
      }
    }
  });

  it("CLIENT_CORRECT_OPTION_KEY_LITERAL=0 across the whole guide surface", () => {
    for (const file of GUIDE_FILES) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const forbidden of [
        "correctOptionKey",
        "answerIndex",
        "evaluationSource",
        "isCorrect",
      ]) {
        expect(
          source.includes(forbidden),
          `${relative(GUIDE_DIR, file)} → ${forbidden}`,
        ).toBe(false);
      }
    }
  });

  it("OPTION_VALIDATION_IS_STEP_SCOPED — commands validate the exact pair", () => {
    // The guide-wide check still exists (it is a useful cheap precondition),
    // but nothing that LEADS TO A COMMAND may rely on it alone: a guide with
    // two recalls would accept the other one's option, and the browser would
    // have minted a key and written a record before the server said no.
    for (const name of ["guide-recovery.ts", "use-guide-run.ts"]) {
      const source = stripComments(readFileSync(join(GUIDE_DIR, name), "utf8"));
      expect(source, name).toContain("isGuideOptionKeyForStep(");
      // The coarse helper must not be the one guarding a command path.
      expect(
        /isGuideOptionKey\s*\(/.test(
          source.replace(/isGuideOptionKeyForStep/g, ""),
        ),
        `${name} uses the guide-wide option check on a command path`,
      ).toBe(false);
    }
  });

  it("submitRecall rejects BEFORE minting a key or writing a record", () => {
    const hook = stripComments(
      readFileSync(join(GUIDE_DIR, "use-guide-run.ts"), "utf8"),
    );
    const body = hook.slice(hook.indexOf("const submitRecall"));
    const guardAt = body.indexOf("isGuideOptionKeyForStep");
    const sendAt = body.indexOf("send(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(-1);
    // Order is the property: `send` is what mints the idempotency key and
    // persists the pending command, so the guard has to come first.
    expect(guardAt).toBeLessThan(sendAt);
  });

  it("READER_GUIDE_PANEL_PIN_KEY_REQUIRED — every mount carries the pin key", () => {
    const files = [
      ...GUIDE_FILES,
      join(WEB_SRC, "components", "dashboard", "lector", "LectorShell.tsx"),
    ];
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      const mounts = source.split("<ReaderGuidePanel").slice(1);
      for (const mount of mounts) {
        // The props block up to the first `>` must open with the key.
        const props = mount.slice(0, mount.indexOf(">"));
        expect(
          /key=\{guideComponentKey\(/.test(props),
          `${relative(GUIDE_DIR, file)} mounts ReaderGuidePanel without the pin key`,
        ).toBe(true);
      }
    }
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
