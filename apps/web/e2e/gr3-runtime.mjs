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

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = join(HERE, "..", "..", "..", "docs", "product", "assets", "gr3-runtime");

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
function check(ok, label) {
  if (!ok) failures.push(label);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}`);
}

const { chromium } = await import("playwright");

/**
 * One login, reused across viewports: `/auth/login` is throttled per IP, and
 * three logins in a row would be measuring the rate limiter.
 */
const STATE_PATH = `${process.env.TMPDIR ?? "/tmp"}/psico-gr3-state.json`;

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
    const main = document.querySelector("main");
    if (!panel || !main) return null;
    const p = panel.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    const overlaps = !(m.right <= p.left || m.left >= p.right);
    return {
      panelLeft: p.left,
      panelRight: p.right,
      readerLeft: m.left,
      readerRight: m.right,
      viewport: window.innerWidth,
      overlaps,
      panelInsideViewport: p.right <= window.innerWidth + 1 && p.left >= -1,
    };
  });
}

async function shoot(page, file) {
  if (!SHOOT) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
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
    `${vp.name}: no horizontal overflow before opening (${m.docScrollWidth} vs ${m.innerWidth})`,
  );
  check(m.selectedTabs === 1, `${vp.name}: exactly one selected tab (${m.selectedTabs})`);
  if (vp.name === "desktop") await shoot(page, "01-reader-guide-selector");

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
    `${vp.name}: no horizontal overflow with the panel open (${m.docScrollWidth} vs ${m.innerWidth})`,
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
  const startBox = await startBtn.boundingBox();
  check(
    !!startBox && startBox.x >= 0 && startBox.x + startBox.width <= vp.w + 1,
    `${vp.name}: the primary control is inside the viewport`,
  );

  if (vp.name === "desktop") await shoot(page, "02-reader-guide-cover");
  if (vp.name === "mobile") await shoot(page, "08-reader-guide-mobile-sheet");

  // ── Walk the run, once, on desktop ───────────────────────────────────────
  if (vp.name === "desktop") {
    await startBtn.click();
    await panel.getByRole("button", { name: "Leer transcripción" }).waitFor();
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
    check(Boolean(anchored?.clearOfPanel), "desktop: the anchored block is clear of the panel");
    check(Boolean(anchored?.focused), "desktop: the anchored block took focus");
    check(
      new URL(page.url()).pathname.endsWith("/lector/1"),
      "desktop: going to the passage did not change the route",
    );
    if (anchored) notes.push(`anchored block: “${anchored.text.trim()}…”`);
    await shoot(page, "03-reader-guide-anchor-highlight");

    await panel.getByRole("button", { name: "He explorado esta idea" }).click();
    await panel.getByRole("button", { name: "Terminé la práctica" }).waitFor();
    await shoot(page, "04-reader-guide-practice");

    await panel.getByRole("button", { name: "Terminé la práctica" }).click();
    await panel.getByRole("button", { name: "Registrar respuesta" }).waitFor();
    await shoot(page, "05-reader-guide-recall");

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
    await shoot(page, "06-reader-guide-feedback");

    await panel.getByRole("button", { name: "Continuar" }).click();
    await panel.getByRole("button", { name: "Terminar" }).click();
    await panel.locator('[data-testid="rgp-completed"]').waitFor();
    check(
      await panel.getByRole("button", { name: "Esto me resonó" }).isVisible(),
      "desktop: the resonance is offered only after finishing",
    );
    await shoot(page, "07-reader-guide-completed-resonance");
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

await browser.close();

if (SHOOT) {
  const { readdirSync, readFileSync } = await import("node:fs");
  const lines = readdirSync(SHOTS_DIR)
    .filter((f) => f.endsWith(".webp"))
    .sort()
    .map((f) => {
      const sha = createHash("sha256")
        .update(readFileSync(join(SHOTS_DIR, f)))
        .digest("hex");
      return `${sha}  ${f}`;
    });
  writeFileSync(join(SHOTS_DIR, "SHA256SUMS"), `${lines.join("\n")}\n`);
  console.log(`\n${lines.length} captures\n${lines.join("\n")}`);
}

console.log(`\n${notes.join("\n")}`);
if (failures.length) {
  console.error(`\n${failures.length} FAILURES:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nGR-3 responsive gate: PASS");
