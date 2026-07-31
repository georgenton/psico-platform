/**
 * GR-3 — the guided-reading panel, measured in a real browser, and captured.
 *
 * Same reason as `responsive.mjs`: jsdom lays nothing out, so «the panel does
 * not cover the text» is a claim only a layout engine can settle. Every number
 * below comes from a bounding box in Chrome.
 *
 * It needs the disposable environment (`gr3-evidence-setup.mjs`): the canonical
 * chapter ingested, so the anchor resolves. Against the ordinary dev database
 * the guide correctly reports itself unavailable and there is nothing to shoot.
 *
 *   node apps/web/e2e/gr3-runtime.mjs            # measure
 *   node apps/web/e2e/gr3-runtime.mjs --shots    # measure + capture
 *
 * Env: E2E_BASE_URL · E2E_EMAIL · E2E_PASSWORD (credentials env-only, never
 * committed).
 */

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const FINAL_SHOTS_DIR = join(
  HERE, "..", "..", "..", "docs", "product", "assets", "gr3-runtime",
);

/**
 * §6/§7 — nothing lands in the repo, and no secret outlives the process.
 *
 * Captures are written to a private temp directory and promoted as a SET only
 * when the whole run passed with exactly the expected eight files. A partial
 * set in `docs/` would read as evidence of a feature that was not verified.
 *
 * The storage state holds session cookies even though the credentials arrive
 * by env, so it lives in the same private directory and is removed in
 * `finally` — including when the run throws.
 */
const WORK_DIR = mkdtempSync(join(tmpdir(), "psico-gr3-"));
const SHOTS_DIR = join(WORK_DIR, "shots");
const STATE_PATH = join(WORK_DIR, "state.json");

const EXPECTED_SCREENSHOTS = [
  "01-reader-guide-selector.webp",
  "02-reader-guide-cover.webp",
  "03-reader-guide-anchor-highlight.webp",
  "04-reader-guide-practice.webp",
  "05-reader-guide-recall.webp",
  "06-reader-guide-feedback.webp",
  "07-reader-guide-completed-resonance.webp",
  "08-reader-guide-mobile-sheet.webp",
];

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3310";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const BOOK = "emociones-en-construccion";
const READER = `${BASE}/dashboard/biblioteca/${BOOK}/lector/1`;
const SHOOT = process.argv.includes("--shots");

const VIEWPORTS = [
  { name: "mobile", w: 390, h: 844, mobile: true },
  { name: "tablet", w: 768, h: 1024, mobile: true },
  { name: "desktop", w: 1365, h: 900, mobile: false },
];

if (!EMAIL || !PASSWORD) {
  console.error("E2E_EMAIL and E2E_PASSWORD are required.");
  process.exit(1);
}

const failures = [];
const notes = [];
/** §10 findings, by scene. Labels only — never the offending value. */
const piiHits = [];
/** §9 outcome, filled during the desktop walk. */
const checkin = {
  routeChanged: null,
  dialogOpen: null,
  focusInsideDialog: null,
  preselected: null,
  callsBeforeSelection: null,
  callsAfterEscape: null,
  guideStoleFocus: null,
};
function check(ok, label) {
  if (!ok) failures.push(label);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}`);
}

const { chromium } = await import("playwright");

/** file → viewport, for the manifest. */
const shotViewports = new Map();

/**
 * §3 — refuse to open a browser against a dirty tree.
 *
 * The evidence claims «this is what the code at SHA X does». If the working
 * tree carries uncommitted edits, the captures show something no commit
 * contains, and the SHA in the manifest is a decoration. Checked here, and
 * again immediately before promoting.
 */
const dirtyAtStart = execFileSync("git", ["status", "--porcelain"], { cwd: HERE })
  .toString()
  .trim();
if (dirtyAtStart) {
  console.error("refusing: the worktree is dirty — commit or stash before the gate");
  console.error(dirtyAtStart);
  console.error("WORKTREE_CLEAN_AT_GATE_START=false");
  process.exit(1);
}
console.log("WORKTREE_CLEAN_AT_GATE_START=true");

/** The SHA the whole run is pinned to; verified again before promoting. */
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: HERE })
  .toString()
  .trim();

/**
 * One login, reused across viewports: `/auth/login` is throttled per IP, and
 * three logins in a row would be measuring the rate limiter.
 */
async function signInOnce(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1365, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 40_000 });
  await ctx.storageState({ path: STATE_PATH });
  await ctx.close();
}

/**
 * What the panel is showing, in terms safe to print: headings, button labels
 * and public alerts. Never a token, a key, an id or a header.
 */
async function panelDiagnosis(page) {
  return page.evaluate(() => {
    const p = document.querySelector('[data-testid="reader-guide-panel"]');
    if (!p) return { panel: false };
    return {
      panel: true,
      headings: [...p.querySelectorAll("h2")].map((h) => h.textContent?.trim()),
      buttons: [...p.querySelectorAll("button")].map((b) => b.textContent?.trim()),
      alerts: [...p.querySelectorAll('[role="alert"], [role="status"]')].map(
        (a) => a.textContent?.trim(),
      ),
      scenes: p.querySelectorAll("[data-testid^='rgp-']").length,
    };
  });
}

/** Page-level geometry every viewport must satisfy. */
async function measurePage(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    selectedTabs: document.querySelectorAll('[role="tab"][aria-selected="true"]')
      .length,
  }));
}

/** Does the panel sit on top of the reader's text? */
async function measureOverlap(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="reader-guide-panel"]');
    // The chapter column specifically, not any `main` on the page.
    const main = document.querySelector('[data-testid="reader-chapter-column"]');
    if (!panel || !main) return null;
    const p = panel.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    // Every VISIBLE block, not just the column box.
    const blocks = [...document.querySelectorAll("[data-block-id]")]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.height > 0 && r.bottom > 0 && r.top < window.innerHeight);
    const blockOverlaps = blocks.some((r) => !(r.right <= p.left || r.left >= p.right));
    const overlaps = !(m.right <= p.left || m.left >= p.right) || blockOverlaps;
    return {
      panelLeft: p.left,
      panelRight: p.right,
      readerLeft: m.left,
      readerRight: m.right,
      viewport: window.innerWidth,
      overlaps,
      visibleBlocks: blocks.length,
      panelInsideViewport:
        p.left >= -1 &&
        p.right <= window.innerWidth + 1 &&
        p.top >= -1 &&
        p.bottom <= window.innerHeight + 1,
    };
  });
}

/**
 * §10 — what a capture is allowed to contain.
 *
 * Runs before EVERY screenshot, not once: a scene that only appears late in
 * the walk is exactly where a leak would hide. It reads what a viewer of the
 * image could read — visible text plus the attributes that carry URLs — and
 * refuses on anything that identifies a person, authorises a request, or
 * exposes internal identity. The findings are reported as counts and labels;
 * the offending value is never printed.
 */
async function assertNoPii(page, file) {
  const found = await page.evaluate((email) => {
    const text = document.body.innerText ?? "";
    const urls = [...document.querySelectorAll("[href], [src]")]
      .map((el) => el.getAttribute("href") ?? el.getAttribute("src") ?? "")
      .join("\n");
    const hay = `${text}\n${urls}`;
    const hits = [];
    const flag = (label, re) => {
      if (re.test(hay)) hits.push(label);
    };

    if (email && hay.toLowerCase().includes(email.toLowerCase())) hits.push("E2E_EMAIL");
    flag("EMAIL_ADDRESS", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    flag("AUTHORIZATION", /authorization\s*[:=]/i);
    flag("BEARER", /\bbearer\s+\S/i);
    flag("SESSION_ID", /sessionId/i);
    flag("USER_ID", /\buserId\b/i);
    flag("IDEMPOTENCY_KEY", /idempotency[-_]?key/i);
    flag("BLOCK_KEY", /blockKey|blockVersionId/i);
    flag("DATABASE_URL", /postgres(?:ql)?:\/\//i);
    // A signed URL is a URL carrying an expiry or a signature.
    flag("SIGNED_URL", /[?&](?:X-Amz-Signature|Signature|sig|se|token|expires)=/i);
    // Token-like: a JWT, or a long opaque run of hex.
    flag("TOKEN_TEXT", /\beyJ[\w-]{10,}\.[\w-]{10,}/);
    flag("TOKEN_TEXT", /\b[0-9a-f]{32,}\b/i);
    // Internal anchor diagnostics must never surface to a reader.
    flag("ANCHOR_DIAGNOSTIC", /UNRESOLVED|AMBIGUOUS|renderBlockId|RESOLVED\b/);
    flag("SYNTHETIC_NAME", /GR3 Evidence/i);

    return [...new Set(hits)];
  }, EMAIL ?? "");

  check(found.length === 0, `${file}: no PII or secrets on screen${found.length ? ` — ${found.join(", ")}` : ""}`);
  if (found.length) piiHits.push(`${file}: ${found.join(", ")}`);
}

/**
 * §10 — hide the account address before capturing.
 *
 * The dashboard chip shows the signed-in address. That is correct: it is your
 * own screen, showing your own account, and changing it to make screenshots
 * tidier would be altering the product to suit the evidence. What must not
 * happen is an address travelling inside a committed image.
 *
 * So the redaction lives HERE, in the harness, and only for the capture: the
 * text node carrying the address is replaced in the page right before the
 * screenshot. No product code, no CSS in the app, no behaviour change for a
 * real user — the running app still shows them their address.
 */
async function redactIdentity(page) {
  if (!EMAIL) return;
  await page.evaluate((email) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const targets = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent?.includes(email)) targets.push(n);
    }
    for (const node of targets) node.textContent = node.textContent.replace(email, "cuenta");
  }, EMAIL);
}

async function shoot(page, file, viewport) {
  await redactIdentity(page);
  // Privacy is checked for all eight scenes whether or not we are writing
  // files — and AFTER redaction, so it measures what the image will contain.
  await assertNoPii(page, file);
  if (!SHOOT) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  shotViewports.set(`${file}.webp`, viewport);
  const png = join(SHOTS_DIR, `${file}.png`);
  const webp = join(SHOTS_DIR, `${file}.webp`);
  await page.screenshot({ path: png });
  // `cwebp` rather than a library: one dependency-free conversion, and the
  // PNG is deleted so only the committed format survives.
  execFileSync("cwebp", ["-quiet", "-q", "82", png, "-o", webp]);
  execFileSync("rm", [png]);
  console.log(`  shot  ${file}.webp`);
}

const browser = await chromium.launch();
let promoted = 0;

try {
  await signInOnce(browser);


  for (const vp of VIEWPORTS) {
    console.log(`\n── ${vp.name} ${vp.w}×${vp.h} ──`);
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      deviceScaleFactor: 2,
      storageState: STATE_PATH,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.goto(READER, { waitUntil: "networkidle" });

    // ── The selector, before opening anything ────────────────────────────────
    const guideTab = page.locator('[data-testid="reader-mode-guiada"]');
    check(await guideTab.isVisible(), `${vp.name}: the guided-reading tab is offered`);

    let m = await measurePage(page);
    check(
      m.docScrollWidth === m.innerWidth,
      `${vp.name}: html has no horizontal overflow before opening (${m.docScrollWidth} vs ${m.innerWidth})`,
    );
    check(
      m.bodyScrollWidth <= m.innerWidth,
      `${vp.name}: body has no horizontal overflow before opening (${m.bodyScrollWidth} vs ${m.innerWidth})`,
    );
    check(m.selectedTabs === 1, `${vp.name}: exactly one selected tab (${m.selectedTabs})`);
    if (vp.name === "desktop") await shoot(page, "01-reader-guide-selector", `${vp.w}x${vp.h}`);

    // ── Open ─────────────────────────────────────────────────────────────────
    await guideTab.click();
    const panel = page.locator('[data-testid="reader-guide-panel"]');
    await panel.waitFor({ state: "visible", timeout: 15_000 });

    const unavailable = page.locator('[data-testid="rgp-anchor-unresolved"]');
    if (await unavailable.count()) {
      // Loud, not silent: this means the environment lacks the ingested chapter.
      failures.push(
        `${vp.name}: the anchor did not resolve — is this the disposable environment?`,
      );
      await context.close();
      continue;
    }

    m = await measurePage(page);
    check(
      m.docScrollWidth === m.innerWidth,
      `${vp.name}: html has no horizontal overflow with the panel open (${m.docScrollWidth} vs ${m.innerWidth})`,
    );
    check(
      m.bodyScrollWidth <= m.innerWidth,
      `${vp.name}: body has no horizontal overflow with the panel open (${m.bodyScrollWidth} vs ${m.innerWidth})`,
    );
    check(
      m.selectedTabs === 1,
      `${vp.name}: still exactly one selected tab while open (${m.selectedTabs})`,
    );
    check(
      await guideTab.evaluate((el) => el.getAttribute("aria-selected") === "true"),
      `${vp.name}: the guide tab is the selected one`,
    );

    const geo = await measureOverlap(page);
    check(Boolean(geo?.panelInsideViewport), `${vp.name}: the panel is inside the viewport`);
    if (vp.name === "desktop") {
      check(geo?.overlaps === false, `${vp.name}: the panel does not cover the reader text`);
      check(
        (geo?.readerRight ?? 0) <= (geo?.panelLeft ?? 0) + 1,
        `${vp.name}: the reader column ends before the panel starts`,
      );
    } else {
      // The sheet is over the text by design; the requirement is that the
      // chapter stays visible behind it. Measured after a small scroll, which
      // is the state a reader is actually in when they open the guide.
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
      const visibleBehind = await page.evaluate(() => {
        const panel = document
          .querySelector('[data-testid="reader-guide-panel"]')
          .getBoundingClientRect();
        return [...document.querySelectorAll("[data-block-id]")].some((b) => {
          const r = b.getBoundingClientRect();
          return r.bottom > 0 && r.bottom <= panel.top && r.height > 0;
        });
      });
      check(visibleBehind, `${vp.name}: at least one chapter block is visible behind the sheet`);
    }

    const startBtn = panel.getByRole("button", { name: "Empezar", exact: true });
    check(await startBtn.isVisible(), `${vp.name}: the cover offers an explicit start`);
    // The whole box, on both axes. A button whose bottom edge is below the
    // fold is not reachable, and measuring only `x` would call that a pass.
    const startBox = await startBtn.boundingBox();
    const startInside =
      !!startBox &&
      startBox.x >= -1 &&
      startBox.x + startBox.width <= vp.w + 1 &&
      startBox.y >= -1 &&
      startBox.y + startBox.height <= vp.h + 1;
    check(
      startInside,
      `${vp.name}: the primary control is fully inside the viewport` +
        (startBox
          ? ` (x ${Math.round(startBox.x)}→${Math.round(startBox.x + startBox.width)} of ${vp.w}, ` +
            `y ${Math.round(startBox.y)}→${Math.round(startBox.y + startBox.height)} of ${vp.h})`
          : " (no box)"),
    );

    if (vp.name === "desktop") await shoot(page, "02-reader-guide-cover", `${vp.w}x${vp.h}`);
    if (vp.name === "mobile") await shoot(page, "08-reader-guide-mobile-sheet", `${vp.w}x${vp.h}`);

    // ── Walk the run, once, on desktop ───────────────────────────────────────
    if (vp.name === "desktop") {
      // §4 — do not guess why the clip does not appear. Wait for the actual
      // START response, assert it was accepted, and only then wait for the
      // scene. A timeout here prints WHAT the panel is showing, never a token,
      // a key, an id or an Authorization header.
      // Every Guide call the page makes, so «no request at all» can be told
      // apart from «a request that failed». Method + path + status only.
      const guideCalls = [];
      const noteCall = (method, url, outcome) => {
        const path = new URL(url).pathname;
        if (path.includes("/guide/")) guideCalls.push(`${method} ${path} → ${outcome}`);
      };
      page.on("requestfailed", (r) =>
        noteCall(r.method(), r.url(), `failed: ${r.failure()?.errorText}`),
      );
      page.on("response", (r) =>
        noteCall(r.request().method(), r.url(), String(r.status())),
      );

      let startRes;
      try {
        [startRes] = await Promise.all([
          page.waitForResponse(
            (r) =>
              r.request().method() === "POST" &&
              new URL(r.url()).pathname.endsWith("/guide/sessions"),
            { timeout: 30_000 },
          ),
          startBtn.click(),
        ]);
      } catch {
        const diag = await panelDiagnosis(page);
        console.error("\nSTART DIAGNOSIS — no session request completed");
        console.error(`  guideCalls       ${JSON.stringify(guideCalls)}`);
        console.error(`  panelMounted     ${diag.panel}`);
        console.error(`  headings         ${JSON.stringify(diag.headings ?? [])}`);
        console.error(`  buttons          ${JSON.stringify(diag.buttons ?? [])}`);
        console.error(`  publicAlerts     ${JSON.stringify(diag.alerts ?? [])}`);
        failures.push("desktop: the START request never completed");
        throw new Error("START_REQUEST_MISSING");
      }
      const startStatus = startRes.status();
      const startPath = new URL(startRes.url()).pathname;
      notes.push(`START ${startRes.request().method()} ${startPath} → ${startStatus}`);
      check(
        startStatus >= 200 && startStatus < 300,
        `desktop: the START was accepted (${startStatus})`,
      );

      try {
        await panel
          .getByRole("button", { name: "Leer transcripción" })
          .waitFor({ timeout: 20_000 });
      } catch {
        // A structured, secret-free picture of what IS on screen.
        const diag = await page.evaluate(() => {
          const p = document.querySelector('[data-testid="reader-guide-panel"]');
          if (!p) return { panel: false };
          return {
            panel: true,
            headings: [...p.querySelectorAll("h2")].map((h) => h.textContent?.trim()),
            buttons: [...p.querySelectorAll("button")].map((b) =>
              b.textContent?.trim(),
            ),
            alerts: [...p.querySelectorAll('[role="alert"], [role="status"]')].map(
              (a) => a.textContent?.trim(),
            ),
            scenes: p.querySelectorAll("[data-testid^='rgp-']").length,
          };
        });
        console.error("\nSTART→CLIP DIAGNOSIS");
        console.error(`  startHttpStatus  ${startStatus}`);
        console.error(`  panelMounted     ${diag.panel}`);
        console.error(`  visibleHeadings  ${JSON.stringify(diag.headings ?? [])}`);
        console.error(`  panelButtons     ${JSON.stringify(diag.buttons ?? [])}`);
        console.error(`  publicAlerts     ${JSON.stringify(diag.alerts ?? [])}`);
        failures.push("desktop: the clip scene never became visible after START");
        throw new Error("START_TO_CLIP_FAILED");
      }
      await panel.getByRole("button", { name: "Continuar" }).click();

      await panel.getByRole("button", { name: "Ir al pasaje" }).click();
      await page.waitForTimeout(900); // the smooth scroll
      const anchored = await page.evaluate(() => {
        const el = document.querySelector('[data-guide-flash="true"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const panel = document
          .querySelector('[data-testid="reader-guide-panel"]')
          .getBoundingClientRect();
        return {
          fullyVisible: r.top >= 0 && r.bottom <= window.innerHeight,
          clearOfPanel: r.right <= panel.left + 1,
          focused: document.activeElement === el,
          text: (el.textContent ?? "").slice(0, 80),
        };
      });
      check(Boolean(anchored), "desktop: the anchored block was found and tinted");
      check(Boolean(anchored?.fullyVisible), "desktop: the anchored block is fully visible");
      check(
      Boolean(anchored?.clearOfPanel),
      "desktop: ANCHOR_BLOCK_OBSCURED_BY_PANEL=false (anchor right <= panel left)",
    );
      check(Boolean(anchored?.focused), "desktop: the anchored block took focus");
      check(
        new URL(page.url()).pathname.endsWith("/lector/1"),
        "desktop: going to the passage did not change the route",
      );
      if (anchored) notes.push(`anchored block: “${anchored.text.trim()}…”`);
      await shoot(page, "03-reader-guide-anchor-highlight", `${vp.w}x${vp.h}`);

      await panel.getByRole("button", { name: "He explorado esta idea" }).click();
      await panel.getByRole("button", { name: "Terminé la práctica" }).waitFor();
      await shoot(page, "04-reader-guide-practice", `${vp.w}x${vp.h}`);

      await panel.getByRole("button", { name: "Terminé la práctica" }).click();
      await panel.getByRole("button", { name: "Registrar respuesta" }).waitFor();
      await shoot(page, "05-reader-guide-recall", `${vp.w}x${vp.h}`);

      await panel.getByRole("radio").first().click();
      await panel.getByRole("button", { name: "Registrar respuesta" }).click();
      await panel.locator('[data-testid="rgp-feedback"]').waitFor();
      const verdict = await panel
        .locator('[data-testid="rgp-feedback"]')
        .innerText();
      check(
        !/incorrect/i.test(verdict),
        "desktop: the feedback never says «incorrecto»",
      );
      await shoot(page, "06-reader-guide-feedback", `${vp.w}x${vp.h}`);

      await panel.getByRole("button", { name: "Continuar" }).click();
      await panel.getByRole("button", { name: "Terminar" }).click();
      await panel.locator('[data-testid="rgp-completed"]').waitFor();
      check(
        await panel.getByRole("button", { name: "Esto me resonó" }).isVisible(),
        "desktop: the resonance is offered only after finishing",
      );
      await shoot(page, "07-reader-guide-completed-resonance", `${vp.w}x${vp.h}`);

      // ── §9 — «Registrar mi momento» opens the ONE check-in there is ───────
      //
      // The claim under test is narrow and worth stating plainly: offering
      // the check-in must not navigate, must not build a second surface, and
      // must not report a mood on the person's behalf. Writes are counted, so
      // "nothing was sent" is measured rather than assumed.
      const routeBefore = new URL(page.url()).pathname;
      let moodWrites = 0;
      const countMoodWrite = (req) => {
        const path = new URL(req.url()).pathname;
        const method = req.method();
        if (method !== "GET" && /\/mood(\/|$)/.test(path)) moodWrites += 1;
      };
      page.on("request", countMoodWrite);

      await panel.getByRole("button", { name: "Registrar mi momento" }).click();
      const dialog = page.getByRole("dialog");
      await page.waitForTimeout(400);

      const guideStillOpen = await panel.isVisible().catch(() => false);
      check(!guideStillOpen, "desktop: the guide closed to hand over the check-in");

      checkin.routeChanged = new URL(page.url()).pathname !== routeBefore;
      check(!checkin.routeChanged, "desktop: opening the check-in did not change the route");

      const dialogState = await dialog.evaluate((el) => ({
        open: el.className.includes("open"),
        focusInside: el.contains(document.activeElement),
        // The focus owner must not be back inside the guide's tab.
        activeInGuide: Boolean(
          document.activeElement?.closest('[data-testid="reader-guide-panel"]'),
        ),
        pressed: el.querySelectorAll('[aria-pressed="true"]').length,
      }));
      checkin.dialogOpen = dialogState.open;
      checkin.focusInsideDialog = dialogState.focusInside;
      checkin.guideStoleFocus = dialogState.activeInGuide;
      checkin.preselected = dialogState.pressed > 0;
      check(checkin.dialogOpen, "desktop: the topbar check-in dialog is open");
      check(checkin.focusInsideDialog, "desktop: focus landed inside the check-in dialog");
      check(!checkin.guideStoleFocus, "desktop: the guide did not take focus back");
      check(
        !checkin.preselected,
        `desktop: no mood is preselected (${dialogState.pressed} pressed)`,
      );

      checkin.callsBeforeSelection = moodWrites;
      check(moodWrites === 0, `desktop: nothing was written before choosing (${moodWrites})`);

      // Leaving without choosing must also write nothing.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      checkin.callsAfterEscape = moodWrites;
      check(moodWrites === 0, `desktop: nothing was written after Escape (${moodWrites})`);
      page.off("request", countMoodWrite);
    }

    const overlay = await page.locator("nextjs-portal").count();
    check(overlay === 0, `${vp.name}: no development error overlay`);
    const hydration = consoleErrors.filter((e) => /hydrat/i.test(e));
    check(hydration.length === 0, `${vp.name}: no hydration errors`);
    check(
      consoleErrors.length === 0,
      `${vp.name}: no console errors${consoleErrors.length ? ` → ${consoleErrors[0]}` : ""}`,
    );

    await context.close();
  }


  // ── §6 — promote as a SET, or not at all ────────────────────────────────
  if (SHOOT) {
    const produced = readdirSync(SHOTS_DIR).filter((f) => f.endsWith(".webp")).sort();
    const namesMatch =
      produced.length === EXPECTED_SCREENSHOTS.length &&
      produced.every((f, i) => f === EXPECTED_SCREENSHOTS[i]);
    const shaNow = execFileSync("git", ["rev-parse", "HEAD"], { cwd: HERE })
      .toString()
      .trim();

    // §3 — the tree must still be clean. A SHA that certifies uncommitted
    // edits certifies nothing, so this is checked again HERE, while the files
    // are still only in the temp directory and promoting is still avoidable.
    const dirtyNow = execFileSync("git", ["status", "--porcelain"], { cwd: HERE })
      .toString()
      .trim();

    check(failures.length === 0, `promotion: the run had no failures`);
    check(piiHits.length === 0, `promotion: no capture carried PII (${piiHits.length} flagged)`);
    check(namesMatch, `promotion: exactly the 8 expected files (${produced.length})`);
    check(shaNow === gitSha, "promotion: HEAD unchanged during the run");
    check(dirtyNow === "", "promotion: the worktree is clean, so the SHA means something");

    if (
      failures.length === 0 &&
      piiHits.length === 0 &&
      namesMatch &&
      shaNow === gitSha &&
      dirtyNow === ""
    ) {
      const manifest = {
        gitSha,
        screenshots: produced.map((file) => ({
          file,
          viewport: shotViewports.get(file) ?? "unknown",
          sha256: createHash("sha256")
            .update(readFileSync(join(SHOTS_DIR, file)))
            .digest("hex"),
        })),
      };

      // §4 — build the complete set NEXT TO the destination (same filesystem,
      // so the swap below is a rename), then swap directories in one move.
      //
      // The old shape — delete the final directory, then copy eight files into
      // it — leaves a window where the committed evidence is a partial set. If
      // the process dies at file five, the repo holds five captures that look
      // like a full bundle. Renaming a finished directory has no such window:
      // either the whole set is in place or the previous one still is.
      const assetsDir = dirname(FINAL_SHOTS_DIR);
      mkdirSync(assetsDir, { recursive: true });
      const staging = mkdtempSync(join(assetsDir, ".gr3-staging-"));
      const backup = `${FINAL_SHOTS_DIR}.backup-${process.pid}`;
      let backedUp = false;
      try {
        for (const file of produced) {
          writeFileSync(join(staging, file), readFileSync(join(SHOTS_DIR, file)));
        }
        writeFileSync(
          join(staging, "SHA256SUMS"),
          `${manifest.screenshots.map((s) => `${s.sha256}  ${s.file}`).join("\n")}\n`,
        );
        writeFileSync(
          join(staging, "MANIFEST.json"),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );

        // The staging set must be exactly the ten expected files before it is
        // allowed to become the evidence.
        const staged = readdirSync(staging).sort();
        const expected = [...EXPECTED_SCREENSHOTS, "MANIFEST.json", "SHA256SUMS"].sort();
        if (staged.length !== expected.length || staged.some((f, i) => f !== expected[i])) {
          throw new Error(`staging holds ${staged.length} files, expected ${expected.length}`);
        }

        if (existsSync(FINAL_SHOTS_DIR)) {
          renameSync(FINAL_SHOTS_DIR, backup);
          backedUp = true;
        }
        renameSync(staging, FINAL_SHOTS_DIR);
        if (backedUp) rmSync(backup, { recursive: true, force: true });
        promoted = produced.length;
        console.log(`\npromoted ${promoted} captures + SHA256SUMS + MANIFEST.json (set swap)`);
      } catch (err) {
        // Put the previous evidence back. A failed promotion must leave the
        // repo exactly as it was, not half-updated.
        rmSync(staging, { recursive: true, force: true });
        if (backedUp && !existsSync(FINAL_SHOTS_DIR)) renameSync(backup, FINAL_SHOTS_DIR);
        rmSync(backup, { recursive: true, force: true });
        failures.push(`promotion failed: ${err.message}`);
        console.error(`\nPROMOTION_FAILED=true BACKUP_RESTORED=${backedUp}`);
      }
    } else {
      console.error("\nFINAL_SCREENSHOTS_WRITTEN=0 · SHA256SUMS_WRITTEN=false");
    }
  }
} finally {
  // §7 — the storage state holds session cookies. It does not outlive this.
  await browser.close().catch(() => {});
  rmSync(WORK_DIR, { recursive: true, force: true });
  console.log(
    `\nAUTH_STATE_FILE_REMOVED=true TEMP_DIRECTORY_REMOVED=true BROWSER_CLOSED=true`,
  );
}

console.log(`\n${notes.join("\n")}`);
console.log(`SCREENSHOTS_CREATED=${promoted}`);
if (failures.length) {
  console.error(`\n${failures.length} FAILURES:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (SHOOT && promoted !== EXPECTED_SCREENSHOTS.length) {
  console.error("\nthe capture set is incomplete");
  process.exit(1);
}
console.log("\nGR-3 responsive gate: PASS");
