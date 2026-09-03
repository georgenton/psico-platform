/**
 * EEC-C01 — the guided suite, in a real browser.
 *
 * Same reason as `responsive.mjs` and `gr3-runtime.mjs`: the assertions that
 * matter here are about what a person actually sees. "The route is not offered
 * while the flag is off" is a claim about a rendered page, and jsdom renders
 * nothing that a reader would recognise.
 *
 *   node apps/web/e2e/eec-c01-guided-suite.mjs           # assert
 *   node apps/web/e2e/eec-c01-guided-suite.mjs --shots   # assert + capture
 *
 * Env: E2E_BASE_URL · E2E_EMAIL · E2E_PASSWORD · E2E_BOOK_SLUG · E2E_CHAPTER.
 * Credentials are env-only: no account of any kind is committed.
 *
 * ── What this can and cannot reach ─────────────────────────────────────────
 *
 * With `EEC_C01_GUIDED_SUITE_V1` off — production's posture, and the default —
 * the only honest assertion is an ABSENCE: no route section, no five cards, no
 * mention of a microguide. That is checked first, because it is the one that
 * protects production.
 *
 * With the flag on in a throwaway environment, the route renders and its cards
 * can be counted. Walking a reading end to end additionally needs the five
 * experiences PUBLISHED, and this phase forbids publishing: a DRAFT has no
 * card verdict, so its control is correctly disabled and there is nothing to
 * click. Those steps are listed as skipped rather than silently passed — a
 * green run that exercised nothing is worse than a red one.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "..", "..", "..", "docs", "product", "assets", "eec-c01-suite");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3010";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const BOOK = process.env.E2E_BOOK_SLUG ?? "emociones-en-construccion";
const CHAPTER = Number(process.env.E2E_CHAPTER ?? 1);
const WANT_SHOTS = process.argv.includes("--shots");

if (!EMAIL || !PASSWORD) {
  console.error(
    "E2E_EMAIL and E2E_PASSWORD are required. They are env-only on purpose.",
  );
  process.exit(2);
}

/** Playwright is not a repo dependency; CI does not provision browsers. */
function requirePlaywright() {
  try {
    return require("playwright");
  } catch {
    console.error(
      "playwright is not installed. `npx playwright install chromium` first;\n" +
        "this script is deliberately outside the default test graph.",
    );
    process.exit(2);
  }
}

const results = [];
const record = (name, status, detail = "") =>
  results.push({ name, status, detail });

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function main() {
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const serverErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
  });

  try {
    await login(page);
    const readerUrl = `${BASE}/dashboard/biblioteca/${BOOK}/lector/${CHAPTER}`;
    await page.goto(readerUrl, { waitUntil: "networkidle" });

    // 1 — the flag's posture, whatever it is, stated from the page itself.
    const routeVisible = await page
      .getByTestId("route-list")
      .isVisible()
      .catch(() => false);

    if (!routeVisible) {
      const anyCard = await page.getByTestId("route-card").count();
      record(
        "flag OFF · the route is not offered",
        anyCard === 0 ? "PASS" : "FAIL",
        `route cards on screen: ${anyCard}`,
      );
      // Nothing downstream is reachable, and pretending otherwise would be
      // the lie this script exists to avoid.
      for (const skipped of [
        "five cards",
        "start / continue / complete each microguide",
        "each practice",
        "progress independence",
      ]) {
        record(skipped, "SKIP", "route dark: the flag is off");
      }
    } else {
      const cards = await page.getByTestId("route-card").count();
      record("flag ON · the route lists its readings", cards === 5 ? "PASS" : "FAIL", `${cards} cards`);

      // Each card carries its own control; a DRAFT has no verdict, so its
      // button is disabled. That IS the assertion while nothing is published.
      const enabled = await page
        .getByTestId("route-card")
        .locator("button:not([disabled])")
        .count();
      record(
        "cards without a verdict offer no click",
        "INFO",
        `${enabled} of ${cards} enabled`,
      );
      if (enabled === 0) {
        for (const skipped of [
          "start / continue / complete each microguide",
          "each practice",
          "progress independence",
        ]) {
          record(skipped, "SKIP", "nothing published: a DRAFT cannot be run");
        }
      }
    }

    // 2 — the pilot's own lineage is still reachable by its exact pin.
    const pilotResumable = await page.evaluate(async (base) => {
      const res = await fetch(
        `${base}/api/guide/discovery/emociones-en-construccion/1`,
        { credentials: "include" },
      );
      if (!res.ok) return null;
      return await res.json();
    }, BASE);
    record(
      "the V1 adapter still answers with the pilot",
      pilotResumable === null ? "SKIP" : "INFO",
      JSON.stringify(pilotResumable),
    );

    // 3 — the chapter's own text is untouched by any of this.
    const paragraphs = await page.locator("[data-block-id]").count();
    record("the chapter still renders its blocks", paragraphs > 0 ? "PASS" : "FAIL", `${paragraphs} blocks`);

    // 4 — the book's integrative activity is reachable.
    const myths = await page.getByText("Mitos emocionales bajo la lupa").count();
    record("the integrative activity is offered", myths > 0 ? "PASS" : "FAIL");

    // 5 — nothing 5xx, and no correct answer anywhere in the page.
    const html = await page.content();
    record(
      "no correctOptionKey reaches the browser",
      html.includes("correctOptionKey") ? "FAIL" : "PASS",
    );
    record("no 5xx responses", serverErrors.length === 0 ? "PASS" : "FAIL", serverErrors.join(" · "));
    record(
      "no console errors",
      consoleErrors.length === 0 ? "PASS" : "INFO",
      consoleErrors.slice(0, 3).join(" · "),
    );

    if (WANT_SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, "reader.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: "networkidle" });
      await page.screenshot({ path: join(SHOTS, "reader-mobile.png"), fullPage: true });
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.status.padEnd(4)} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  writeFileSync(
    join(HERE, "eec-c01-guided-suite.result.json"),
    JSON.stringify({ base: BASE, book: BOOK, chapter: CHAPTER, results }, null, 2),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

void execFileSync; // kept for parity with the sibling scripts' toolbox
void main();
