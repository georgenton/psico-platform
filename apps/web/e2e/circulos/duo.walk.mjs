/**
 * The Dúo, walked by two real browsers against a real stack.
 *
 * Nothing here is simulated: a production Web build, a real Nest API, a real
 * worker, PostgreSQL and Redis that belong to this run alone. No handler is
 * stubbed, no upstream is faked, and session authority is whatever the server
 * actually issues.
 *
 * Driven by `stack.mjs`, which supplies the three environment variables below.
 * It imports `playwright` directly rather than `@playwright/test` — the same
 * shape every other script in `apps/web/e2e/` uses, and the only one available
 * here: the repository has no test-runner dependency, and adding one to satisfy
 * a harness is the kind of machinery this work is meant to avoid.
 *
 * ── What is NOT written down ───────────────────────────────────────────────
 *
 * The invitation link is a one-shot secret. It is carried between the two
 * contexts in a variable and never logged, never put in a title, and never
 * screenshotted. Anything printed for diagnosis shows the SHAPE
 * (`/i#<token:43>`), never the value.
 */

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const API = process.env.CIRCULOS_E2E_API;
const WEB = process.env.CIRCULOS_E2E_WEB;
const PG_CONTAINER = process.env.CIRCULOS_E2E_PG_CONTAINER;
const PG_DATABASE = process.env.CIRCULOS_E2E_PG_DATABASE;

if (!API || !WEB || !PG_CONTAINER || !PG_DATABASE) {
  console.error(
    "duo.walk.mjs runs from stack.mjs, which supplies CIRCULOS_E2E_API, _WEB, _PG_CONTAINER and _PG_DATABASE.",
  );
  process.exit(2);
}

const { chromium } = await import("playwright");

const failures = [];
let checks = 0;

function check(ok, label) {
  checks += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures.push(label);
  }
}

/** Redacted for any diagnostic output. */
const shape = (link) => String(link).replace(/#.+$/, "#<token:43>");

/** Wait for a condition, polling — no arbitrary sleeps. */
async function until(predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await predicate();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/**
 * A synthetic account, created through the ordinary registration endpoint.
 *
 * Not a back door: this is the same call the sign-up form makes. The walk needs
 * accounts to exist, and inventing a test-only way to mint them would be
 * inventing exactly the thing that must not exist.
 */
async function register(label) {
  const email = `e2e-${label}-${randomBytes(4).toString("hex")}@example.test`;
  const password = `Pw-${randomBytes(9).toString("base64url")}`;
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: `E2E ${label}` }),
  });
  if (res.status >= 300) {
    throw new Error(
      `registration failed for ${label}: ${res.status} ${await res.text()}`,
    );
  }
  return { email, password };
}

/** Sign in through the real form, not by planting a cookie. */
async function signIn(page, { email, password }) {
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);
  await dismissOnboarding(page);
}

/**
 * Get past the onboarding gate the ordinary way.
 *
 * A newly registered account has no onboarding state, and the middleware sends
 * every `/dashboard/*` request to `/onboarding` until it does — so without this
 * the walk never reaches a reading surface at all.
 *
 * It presses the product's own "Saltar", which is what a person who skips does.
 * Writing the onboarding row straight into the database would be faster and
 * would also mean the walk no longer starts from a state the product can
 * actually produce.
 */
async function dismissOnboarding(page) {
  // Go there deliberately rather than waiting to be redirected. Landing on
  // `/dashboard` after sign-in does not mean the gate is passed: the bounce
  // happens on the NEXT navigation, so a check here would see a clean URL and
  // skip the skip.
  await page.goto(`${WEB}/onboarding`, { waitUntil: "domcontentloaded" });
  if (!/\/onboarding/.test(page.url())) return; // already done for this account

  const skip = page.getByRole("button", { name: /^Saltar$/ });
  try {
    await skip.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    // The first screen is a welcome with no skip control; step into it once.
    await page.getByRole("button", { name: /Empezar/i }).first().click();
    await skip.waitFor({ state: "visible", timeout: 15_000 });
  }
  await Promise.all([
    page.waitForURL((u) => !/\/onboarding/.test(String(u)), { timeout: 60_000 }),
    skip.click(),
  ]);
}

/**
 * How many activities exist, read from the run's own database.
 *
 * Straight to PostgreSQL on purpose. The alternative would be adding an admin
 * endpoint that counts activities, and adding product surface to satisfy a
 * harness is how test-only doors end up shipping.
 *
 * Through `docker exec` rather than a driver: `pg` is not resolvable from the
 * repository root, and the container is already this run's own — created with
 * it, destroyed with it. One fewer dependency for a single COUNT.
 */
function countActivities() {
  const out = execFileSync(
    "docker",
    [
      "exec",
      PG_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      PG_DATABASE,
      "-tAc",
      'SELECT count(*) FROM "CircleActivity"',
    ],
    { encoding: "utf8" },
  );
  const n = Number(out.trim());
  if (!Number.isInteger(n)) {
    throw new Error(`could not read the activity count (got ${JSON.stringify(out)})`);
  }
  return n;
}

// ── The walk ────────────────────────────────────────────────────────────────

const browser = await chromium.launch();

try {
  const organiser = await register("organiser");

  // Two ISOLATED contexts. Not two tabs: the whole point is that the guest has
  // no share of the organiser's session, and one browser context would hand
  // them the cookie jar.
  const organiserCtx = await browser.newContext();
  const guestCtx = await browser.newContext();

  try {
    const organiserPage = await organiserCtx.newPage();
    await signIn(organiserPage, organiser);
    console.log("\n── the organiser ──");

    // ── 1 · the CTA on an eligible surface ─────────────────────────────────
    await organiserPage.goto(
      `${WEB}/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente`,
      { waitUntil: "domcontentloaded" },
    );
    const cta = organiserPage.getByRole("link", {
      name: /Hacer esto con alguien/i,
    });
    await cta.waitFor({ state: "visible", timeout: 30_000 });
    check(true, "the synthetic template is offered on an eligible experience");

    // ── 2 · the preview creates nothing ────────────────────────────────────
    //
    // A DELTA, not an absolute count. Against a fresh stack the two agree, but
    // an absolute 0 is quietly an assertion that the whole database is empty —
    // which stops holding the moment the walk runs twice against one stack, and
    // then it fails for a reason that has nothing to do with what it claims.
    //
    // Read BEFORE the CTA is clicked: that is the whole point of the check.
    const before = countActivities();

    await cta.click();
    const createButton = organiserPage.getByRole("button", {
      name: /Crear (el )?Dúo/i,
    });
    await createButton.waitFor({ state: "visible", timeout: 30_000 });
    check(countActivities() === before, "opening the preview creates NOTHING");

    // ── 3 · one explicit confirmation ──────────────────────────────────────
    await createButton.click();

    const link = await until(async () => {
      const text = await organiserPage.evaluate(() => document.body.innerText);
      const m = text.match(/https?:\/\/\S*\/i#[A-Za-z0-9_-]{43}/);
      return m ? m[0] : null;
    }, "the invitation link to appear");

    check(
      /\/i#[A-Za-z0-9_-]{43}$/.test(link),
      `the link has the one-shot fragment shape (${shape(link)})`,
    );
    check(
      countActivities() === before + 1,
      "exactly ONE activity is created by one confirmation",
    );

    // ── 4 · opening is not accepting ───────────────────────────────────────
    console.log("\n── the guest ──");
    const guestPage = await guestCtx.newPage();
    await guestPage.goto(link, { waitUntil: "domcontentloaded" });

    // The fragment is erased before anything else happens.
    await until(
      async () => (await guestPage.evaluate(() => window.location.hash)) === "",
      "the fragment to be erased from the address bar",
    );
    check(true, "the token is erased from the URL on arrival");

    const accept = guestPage.getByRole("button", {
      name: /Aceptar( la)? invitación/i,
    });
    await accept.waitFor({ state: "visible", timeout: 30_000 });
    check(true, "the guest is shown a preview, not a completed join");

    // Still unconsumed: the same link opened again still previews.
    const secondLook = await guestCtx.newPage();
    await secondLook.goto(link, { waitUntil: "domcontentloaded" });
    const secondAccept = secondLook.getByRole("button", {
      name: /Aceptar( la)? invitación/i,
    });
    let stillOffered = true;
    try {
      await secondAccept.waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      stillOffered = false;
    }
    check(stillOffered, "merely LOOKING did not consume the invitation");
    await secondLook.close();

    // ── 5 · explicit acceptance issues the session ─────────────────────────
    await accept.click();
    // Poll the address rather than `waitForURL`: acceptance ends in a client
    // `router.replace`, and a soft navigation fires no load event for
    // `waitForURL` to wait on.
    try {
      await until(
        () => /\/compartir\//.test(guestPage.url()),
        "the guest to be moved into the activity room",
        60_000,
      );
      check(true, "an explicit acceptance is what joins the guest");
    } catch (err) {
      const shown = await guestPage.evaluate(() => document.body.innerText);
      check(false, `acceptance did not open the room — page said: ${shown.slice(0, 300)}`);
      throw err;
    }

    // ── 6 · both are in the same room ──────────────────────────────────────
    const activityId = new URL(guestPage.url()).pathname.split("/").pop();
    check(Boolean(activityId), "the guest lands in the activity room");

    await organiserPage.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    const organiserInRoom = organiserPage.getByText(/Actividad sintética/i);
    let bothPresent = true;
    try {
      await organiserInRoom.first().waitFor({ state: "visible", timeout: 30_000 });
    } catch {
      bothPresent = false;
    }
    check(bothPresent, "the organiser reaches the SAME room as the guest");
  } finally {
    await organiserCtx.close();
    await guestCtx.close();
  }
} catch (err) {
  failures.push(`walk threw: ${err.message}`);
  console.error(`\n✗ ${err.stack}`);
} finally {
  await browser.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.error(`\n${failures.length} FAILURES:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("✔ the Dúo walk completed end to end");
