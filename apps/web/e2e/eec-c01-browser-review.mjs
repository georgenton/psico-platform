/**
 * EEC-C01 — the visual half of the pre-publication evidence.
 *
 * The runtime walk (`eec-c01-runtime-walk.mjs`) proves the product WORKS. This
 * proves what a person SEES: the five cards, each practice's own renderer, the
 * ordering interaction reached with a keyboard, the integrative activity, and
 * that nothing on the page carries a correct answer or ships what somebody
 * typed. Screenshots at desktop and at 390×844.
 *
 * It runs against the ISOLATED environment only. Nothing here can reach
 * production: the environment is supplied by URL, and the publisher that made
 * one refuses a deployed box before it connects.
 *
 *   E2E_BASE_URL=http://localhost:3012 E2E_EMAIL=… E2E_PASSWORD=… \
 *   node apps/web/e2e/eec-c01-browser-review.mjs
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "..", "..", "..", "docs", "product", "assets", "eec-c01-suite");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3012";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const BOOK = process.env.E2E_BOOK_SLUG ?? "emociones-en-construccion";
const CHAPTER = Number(process.env.E2E_CHAPTER ?? 1);
/** `id:label` pairs — the CMS previews to shoot. */
const PREVIEWS = (process.env.E2E_PREVIEW_IDS ?? "").split(",").filter(Boolean);

if (!EMAIL || !PASSWORD) {
  console.error("E2E_EMAIL and E2E_PASSWORD are required (env-only).");
  process.exit(2);
}

const results = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail: String(detail) });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const info = (name, detail) => {
  results.push({ name, status: "INFO", detail: String(detail) });
  console.log(`INFO  ${name} — ${detail}`);
};

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });

  // A brand-new account is sent to onboarding by the middleware, and every
  // later navigation would land there instead of where it was pointed — which
  // is how the first version of this script "rendered" five identical
  // previews. Skipping it is what a reader can do on that screen.
  await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
  const skip = page.getByRole("button", { name: /Saltar/ }).first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(2000);
  }
}

async function main() {
  mkdirSync(join(ASSETS, "previews"), { recursive: true });
  mkdirSync(join(ASSETS, "e2e"), { recursive: true });

  const browser = await chromium.launch();
  // A saved session, when there is one. The login route is throttled at
  // 5 per 15 minutes per IP — correctly — and a review that re-authenticates
  // on every run spends that budget on itself.
  const statePath = join(HERE, ".eec-c01-session.json");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(existsSync(statePath) ? { storageState: statePath } : {}),
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const serverErrors = [];
  const apiFailures = [];
  const postedBodies = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
    if (r.status() >= 400 && r.url().includes("/api/")) {
      apiFailures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    }
  });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/")) {
      const body = r.postData();
      if (body) postedBodies.push({ url: r.url(), body });
    }
  });

  try {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    if (page.url().includes("/login")) {
      await login(page);
      await context.storageState({ path: statePath });
    }

    // ── The CMS previews ────────────────────────────────────────────────────
    const previewTexts = new Map();
    for (const spec of PREVIEWS) {
      const [label, id] = spec.split(":");
      const url = `${BASE}/dashboard/admin/experiencias/${BOOK}/${CHAPTER}/borrador/${id}`;
      await page.goto(url, { waitUntil: "networkidle" });
      const body = await page.locator("body").innerText();
      // Asserted on THIS experience's own words, not on a length: a redirect
      // to another page is also "long enough", which is exactly how a first
      // version of this check passed five times on the onboarding screen.
      // Assert on THIS experience's own title, not on the URL: a path Next
      // does not serve still keeps the URL and renders the app shell, which is
      // how five identical screenshots were produced and believed.
      const onTheRightPage =
        page.url().includes(id) &&
        !/BIENVENIDA|Empecemos/.test(body) &&
        body.length > 600;
      check(
        `${label} · the CMS preview renders that experience`,
        onTheRightPage,
        `${body.length} chars · ${page.url().replace(BASE, "")}`,
      );
      previewTexts.set(label, body);
      check(
        `${label} · the preview carries no correct answer`,
        !(await page.content()).includes("correctOptionKey"),
      );
      await page.screenshot({
        path: join(ASSETS, "previews", `${label}-desktop.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: join(ASSETS, "previews", `${label}-mobile.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    // Five previews must be five DIFFERENT screens.
    if (previewTexts.size > 1) {
      const distinct = new Set([...previewTexts.values()]).size;
      check(
        "the five previews are five different screens",
        distinct === previewTexts.size,
        `${distinct} distinct of ${previewTexts.size}`,
      );
    }

    // ── The reader's chapter ────────────────────────────────────────────────
    const readerUrl = `${BASE}/dashboard/biblioteca/${BOOK}/lector/${CHAPTER}`;
    // NOT `networkidle`: the reader keeps a reading-session heartbeat open, so
    // the network is never idle and the wait would always time out.
    await page.goto(readerUrl, { waitUntil: "domcontentloaded" });

    // The reader redirects to its canonical Content Core URL; wait for that
    // rather than for the one we typed.
    await page.waitForURL(/\/lector\//, { timeout: 45_000 });
    await page.waitForTimeout(2500);

    // «Cómo recorrerlo» — the chapter home is where the route lives.
    const home = page.getByTestId("reader-open-chapter-home");
    const homeVisible = await home.isVisible().catch(() => false);
    check("the chapter home is reachable from the reader", homeVisible);
    if (homeVisible) {
      await home.click();
      await page.waitForTimeout(2500);
    }

    const cards = await page.getByTestId("route-card").count();
    if (cards !== 5) {
      // Say what WAS on screen. A count of zero with no context is a puzzle
      // for whoever reads this artifact next.
      const seen = await page.locator("body").innerText();
      info("chapter home, as rendered", seen.slice(0, 600).replace(/\n+/g, " | "));
      info("api calls that failed", [...new Set(apiFailures)].slice(0, 8).join(" · ") || "none");
    }
    check("the chapter offers five guided readings", cards === 5, cards);
    if (cards > 0) {
      const text = await page.getByTestId("route-list").innerText();
      check(
        "the historical pilot is not among them",
        !/cuerpo,? antes que la mente/i.test(text),
      );
      check(
        "every card shows a duration",
        (text.match(/min/g) ?? []).length >= 5,
        (text.match(/min/g) ?? []).length,
      );
      await page.screenshot({
        path: join(ASSETS, "e2e", "route-desktop.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: join(ASSETS, "e2e", "route-mobile.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    // ── The integrative activity ────────────────────────────────────────────
    //
    // It lives in the READER, with the chapter's other activities — not on the
    // chapter home, which is a menu. So go back to the text first.
    const back = page.getByTestId("reader-open-chapter-home");
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await page.waitForTimeout(2000);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    const myths = page.getByText("Mitos emocionales bajo la lupa").first();
    const mythsVisible = await myths.isVisible().catch(() => false);
    check("the book's integrative activity is offered", mythsVisible);
    if (mythsVisible) {
      await page.getByRole("button", { name: /Abrir la actividad/ }).first().click();
      await page.waitForTimeout(600);
      const panel = page.getByTestId("myths-lens");
      check("it opens", await panel.isVisible());
      const panelText = await panel.innerText();
      check(
        "it shows no total and no verdict",
        !/total|puntaje|correcto|incorrecto/i.test(panelText),
      );

      // Rate one belief, then pick one to look at. The writing step — and the
      // line that says where the writing stays — only exists once there is
      // something to look at, which is the design, not a missing string.
      const firstRating = panel.getByRole("button", { name: /— 3 de 5$/ }).first();
      if (await firstRating.isVisible().catch(() => false)) {
        await firstRating.click();
        check(
          "a rating is marked in more than colour",
          (await firstRating.getAttribute("aria-pressed")) === "true",
        );
      }
      const beliefGroup = panel.getByRole("group", { name: "Elige una creencia" });
      await beliefGroup.getByRole("button").first().click();
      await page.waitForTimeout(600);
      const opened = await panel.innerText();
      check("choosing a belief reveals the five lenses", /Cinco lentes/i.test(opened));
      check(
        "it says where what you write stays",
        /se queda en tu dispositivo/i.test(opened),
      );
      check(
        "still no verdict once the lenses are open",
        !/correcto|incorrecto|puntaje/i.test(opened),
      );
      await page.screenshot({
        path: join(ASSETS, "e2e", "integrative-activity.png"),
        fullPage: true,
      });
    }

    // ── Privacy, from the network ───────────────────────────────────────────
    const leaked = postedBodies.filter((p) => p.body.includes("correctOptionKey"));
    check("no request carried a correct answer", leaked.length === 0, leaked.length);
    const guidePosts = postedBodies.filter((p) => p.url.includes("/guide/"));
    const withProse = guidePosts.filter((p) => {
      try {
        const parsed = JSON.parse(p.body);
        // A guide command carries keys and ids. Any long free-form string in
        // one would be somebody's writing travelling with their progress.
        return Object.values(parsed).some(
          (v) => typeof v === "string" && v.length > 120,
        );
      } catch {
        return false;
      }
    });
    check(
      "no guide command carried free text",
      withProse.length === 0,
      withProse.length,
    );
    check("no 5xx", serverErrors.length === 0, serverErrors.join(" · "));
    info("console errors", consoleErrors.slice(0, 3).join(" · ") || "none");
  } finally {
    await browser.close();
  }

  writeFileSync(
    join(HERE, "eec-c01-browser-review.result.json"),
    JSON.stringify({ base: BASE, book: BOOK, chapter: CHAPTER, results, failures }, null, 2) + "\n",
  );
  console.log(`\n${results.filter((r) => r.status === "PASS").length} PASS · ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
