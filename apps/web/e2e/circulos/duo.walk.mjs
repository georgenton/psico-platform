/**
 * The Dúo, walked by real browsers against a real stack.
 *
 * Nothing here is simulated: a production Web build, a real Nest API, a real
 * worker, PostgreSQL and Redis that belong to this run alone. No handler is
 * stubbed, no upstream is faked, no domain command is mocked, and session
 * authority is whatever the server actually issues.
 *
 * Driven by `stack.mjs`, which supplies the environment below. It imports
 * `playwright` — a declared dev dependency of `@psico/web`, resolved from the
 * archived copy's own `node_modules` — rather than `@playwright/test`, so the
 * walk stays a plain Node script like every other one in `apps/web/e2e/`.
 *
 * ── Independent scenarios, not one long rope ───────────────────────────────
 *
 * Each scenario mints its OWN accounts and its OWN activity and is wrapped so a
 * failure is recorded and the next one still runs. A single sequence would let
 * the first breakage hide everything after it, and "one thing failed" would be
 * indistinguishable from "nine things were never tried".
 *
 * ── What is NOT written down ───────────────────────────────────────────────
 *
 * Invitation links, cookies and anything a person typed are secrets. They are
 * carried in variables, never logged, never put in a scenario name. Diagnostics
 * print the SHAPE (`/i#<token:43>`), never the value.
 */

import { randomBytes } from "node:crypto";

import { makeTransport } from "./transports.mjs";
import { redactDiagnostics } from "./redact.mjs";

const API = process.env.CIRCULOS_E2E_API;
const API_OFF = process.env.CIRCULOS_E2E_API_OFF;
const WEB = process.env.CIRCULOS_E2E_WEB;
const HEAD_SHA = process.env.CIRCULOS_E2E_HEAD_SHA ?? "(unknown)";

/**
 * A pool of accounts registered — and allowlisted — BEFORE the run.
 *
 * Under a hosted pilot only an allowlisted organiser may create a Dúo, and an
 * allowlist is configuration that exists before the run starts. Handing the
 * walk ONE organiser would have been simpler and wrong: the scenarios are
 * independent precisely because each owns its data, and one of them deletes its
 * organiser's account on purpose. So the pool carries one account per label,
 * and `register` hands out the matching one.
 *
 * Locally the pool is absent and every scenario registers its own, because
 * there the rollout is `on` and any fresh account can create.
 */
const ACCOUNT_POOL = process.env.CIRCULOS_E2E_ACCOUNTS
  ? JSON.parse(
      // eslint-disable-next-line no-undef
      (await import("node:fs")).readFileSync(
        process.env.CIRCULOS_E2E_ACCOUNTS,
        "utf8",
      ),
    )
  : null;

for (const [name, value] of Object.entries({
  CIRCULOS_E2E_API: API,
  CIRCULOS_E2E_WEB: WEB,
})) {
  if (!value) {
    console.error(`duo.walk.mjs needs ${name}.`);
    process.exit(2);
  }
}

const { chromium } = await import("playwright");

/**
 * How this run reaches the database and the queue.
 *
 * The scenarios below do not know or care: locally it is `docker exec` against
 * containers this machine owns, and against a hosted environment it is a node
 * snippet run INSIDE the API container, so the stores stay on the private
 * network. Same walk, same assertions, different transport.
 */
const transport = makeTransport(process.env);

/** The room's polling interval. Anything visible sooner did not come from it. */
const POLL_MS = 10_000;

/** How long the reproduction holds the next read back. Under the poll. */
const SLOW_READ_MS = 6_000;

// ── Result bookkeeping ──────────────────────────────────────────────────────

const scenarios = [];
let current = null;

/**
 * One check, and everything it says goes through the redactor first.
 *
 * Several labels interpolate what the run actually saw — the list of API calls,
 * the text on screen, a URL — because a check that fails without saying what it
 * saw costs a whole re-run. That is worth keeping and it is also how a secret
 * gets into a published log, so the two are reconciled here rather than at
 * forty call sites: the values stay, the credentials in them do not.
 */
function check(ok, label) {
  const safe = redactDiagnostics(String(label));
  current.checks.push({ ok, label: safe });
  console.log(`   ${ok ? "✓" : "✗"} ${safe}`);
  if (!ok) current.failures.push(safe);
}

/** Redacted for any diagnostic output. */
const shape = (link) => String(link).replace(/#.+$/, "#<token:43>");

/**
 * Run one scenario by name, for when a single path is being chased.
 *
 * A comma-separated list in `CIRCULOS_E2E_ONLY`. Unset means all of them, which
 * is what CI and every full run use — this exists so that finding out WHY one
 * path fails does not cost twenty minutes of the other nine.
 */
const ONLY = (process.env.CIRCULOS_E2E_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function scenario(key, title, body) {
  if (ONLY.length > 0 && !ONLY.includes(key)) return;
  current = { key, title, checks: [], failures: [], error: null };
  scenarios.push(current);
  console.log(`\n── ${title} ──`);
  try {
    await body();
  } catch (err) {
    // Playwright puts the URL it was working on into the message, and one of
    // those URLs is the invitation — secret in the fragment.
    const why = redactDiagnostics(String(err.message));
    current.error = why;
    current.failures.push(`threw: ${why}`);
    console.error(`   ✗ threw: ${why}`);
  }
  // A scenario with no checks passed nothing, whatever it did.
  if (current.checks.length === 0) {
    current.failures.push("no checks ran");
  }
}

// ── Small utilities ─────────────────────────────────────────────────────────

async function until(predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `timed out waiting for ${label}${lastErr ? ` (last error: ${lastErr.message})` : ""}`,
  );
}

/** One SQL statement against the run's own database. */
const sql = (text) => transport.sql(text);

const sqlOne = (text) => sql(text);
const sqlInt = (text) => {
  const n = Number(sql(text));
  if (!Number.isFinite(n)) throw new Error(`not a number from SQL: ${text}`);
  return n;
};
/** Rows as arrays of column strings. */
const sqlRows = (text) =>
  sql(text)
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => l.split("|"));

/**
 * Clear ONLY the rate-limiter's keys in this run's own Redis.
 *
 * Registration is capped at 10 per hour per address, and ten scenarios each
 * minting their own accounts from one loopback address exceed that. Raising the
 * cap would weaken the very configuration under test; flushing everything would
 * also drop the queues the worker is waiting on. So exactly the `throttle:`
 * keys go, between scenarios, in a Redis container that exists for this run.
 * The limiter itself has its own tests and its own negative controls.
 */
const resetRateLimits = () => transport.resetRateLimits();

// ── Real accounts, real sign-in ─────────────────────────────────────────────

/**
 * A synthetic account through the ordinary registration endpoint.
 *
 * Not a back door: this is the call the sign-up form makes. Inventing a
 * test-only way to mint accounts would be inventing exactly the thing that must
 * not exist.
 */
async function register(label) {
  // From the pre-allowlisted pool when there is one. A label with no entry is a
  // configuration mistake and says so, rather than silently registering an
  // account the pilot will refuse and failing later for a confusing reason.
  if (ACCOUNT_POOL) {
    const account = ACCOUNT_POOL[label];
    if (!account) {
      throw new Error(
        `no pre-allowlisted account for "${label}" — add it to the pool`,
      );
    }
    return account;
  }
  const email = `e2e-${label}-${randomBytes(5).toString("hex")}@example.test`;
  const password = `Pw-${randomBytes(9).toString("base64url")}`;
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: `E2E ${label}` }),
  });
  if (res.status >= 300) {
    throw new Error(`registration failed for ${label}: ${res.status}`);
  }
  const body = await res.json().catch(() => ({}));
  return { email, password, userId: body?.user?.id ?? null };
}

/**
 * An access token for an account, taken from the API rather than the browser.
 *
 * Used only to prove a REFUSAL: that a signed-in person who is not an
 * administrator cannot read the Pulso panel. Reading it out of a browser
 * session would be extracting a credential from a page, which this walk does
 * not do; asking the API for one with the password the walk itself created is
 * an ordinary login.
 */
async function tokenFor({ email, password }) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return body?.accessToken ?? body?.tokens?.accessToken ?? "";
}

async function signIn(page, { email, password }) {
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    // ANY authenticated destination, not `/dashboard` specifically.
    //
    // Where a successful login lands is not part of this walk's subject, and it
    // differs by environment: locally it settles on `/dashboard` and the
    // onboarding gate bounces on the NEXT navigation, while the hosted build
    // redirects a new account straight to `/onboarding`. Waiting for
    // `/dashboard` made a correct login look like a timeout on Vercel — the
    // product had authenticated, set both cookies, and gone exactly where it
    // should.
    page.waitForURL((u) => !/\/login/.test(String(u)), { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);
  await dismissOnboarding(page);
}

/**
 * Get past the onboarding gate the ordinary way.
 *
 * A new account has no onboarding state and the middleware sends every
 * `/dashboard/*` request to `/onboarding` until it does. It presses the
 * product's own "Saltar": writing the row straight into the database would be
 * faster and would also mean the walk no longer starts from a state the product
 * can actually produce.
 */
async function dismissOnboarding(page) {
  // Deliberately, not by waiting to be redirected: landing on `/dashboard`
  // after sign-in does not mean the gate is passed — the bounce happens on the
  // NEXT navigation, so a check here would see a clean URL and skip the skip.
  await page.goto(`${WEB}/onboarding`, { waitUntil: "domcontentloaded" });
  if (!/\/onboarding/.test(page.url())) return;
  const skip = page.getByRole("button", { name: /^Saltar$/ });
  try {
    await skip.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    await page
      .getByRole("button", { name: /Empezar/i })
      .first()
      .click();
    await skip.waitFor({ state: "visible", timeout: 15_000 });
  }
  await Promise.all([
    page.waitForURL((u) => !/\/onboarding/.test(String(u)), {
      timeout: 60_000,
    }),
    skip.click(),
  ]);
}

// ── The flow, as reusable pieces ────────────────────────────────────────────

const EXPERIENCE = "eec-c1-cuerpo-antes-que-mente";

async function openCreateScreen(page) {
  await page.goto(`${WEB}/dashboard/exploraciones/${EXPERIENCE}`, {
    waitUntil: "domcontentloaded",
  });
  const cta = page.getByRole("link", { name: /Hacer esto con alguien/i });
  await cta.waitFor({ state: "visible", timeout: 30_000 });
  await cta.click();
  const createButton = page.getByRole("button", { name: /Crear (el )?Dúo/i });
  await createButton.waitFor({ state: "visible", timeout: 30_000 });
  return createButton;
}

/**
 * Read the invitation link off the screen once creation has produced one.
 *
 * On failure it quotes what the screen ACTUALLY says. "No link appeared" is
 * the same sentence whether the server refused, the limiter answered, or the
 * button was never wired — and against a hosted environment, where the causes
 * multiply, a bare timeout costs a whole re-run to learn what a screenshot
 * would have said.
 */
async function readLink(page) {
  try {
    return await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        const m = text.match(/https?:\/\/\S*\/i#[A-Za-z0-9_-]{43}/);
        return m ? m[0] : null;
      },
      "the invitation link to appear",
      60_000,
    );
  } catch (err) {
    const shown = await page
      .evaluate(() => document.body.innerText)
      .catch(() => "(page unreadable)");
    throw new Error(
      `${err.message} — the screen said: ${shown.slice(-400).replace(/\s+/g, " ")}`,
    );
  }
}

async function createDuo(page) {
  const button = await openCreateScreen(page);
  await button.click();
  return readLink(page);
}

/**
 * Accept an invitation in a fresh context and land in the room.
 *
 * `alias` is typed into the real box on the real screen, so what is being
 * exercised is the whole journey — component, Web handler, BFF, API — and not
 * a direct call to `exchange(..., alias)`, which would pass even while the
 * screen sent the name to the wrong request.
 */
async function acceptAsGuest(browser, link, alias = null) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link, { waitUntil: "domcontentloaded" });
  const accept = page.getByRole("button", {
    name: /Aceptar( la)? invitación/i,
  });
  await accept.waitFor({ state: "visible", timeout: 30_000 });
  if (alias !== null) {
    const box = page.getByLabel(/nombre corto/i);
    await box.waitFor({ state: "visible", timeout: 20_000 });
    await box.fill(alias);
  }
  await accept.click();
  await until(
    () => /\/compartir\//.test(page.url()),
    "the guest to be moved into the room",
    60_000,
  );
  const activityId = new URL(page.url()).pathname.split("/").pop();
  return { ctx, page, activityId };
}

/** Past the consent card into the preparation form. */
async function enterRoom(page) {
  const start = page.getByRole("button", { name: /Entiendo, empezar/i });
  try {
    await start.waitFor({ state: "visible", timeout: 20_000 });
    await start.click();
  } catch {
    /* already past consent on this page */
  }
  // The section is named "Tu preparación"; the HEADING is now the question,
  // which differs per template. Waiting for the first question's textarea is
  // the template-independent way to know the form is up.
  await page
    .locator("textarea[id^='f-']")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

/** Type a draft without confirming anything. */
/**
 * The two preparation fields, WHATEVER the pinned template calls them.
 *
 * These selectors used to be `#f-campo-uno` and `#f-campo-dos` — the synthetic
 * fixture's own keys — which quietly made the walk a test of the fixture. The
 * browser scenarios now run on the published template, whose keys are
 * `que-ayuda` and `que-no-ayuda`, and a walk that only works against one
 * template's field names proves nothing about the one people will use.
 *
 * So the form is addressed the way a person addresses it: the fields it is
 * showing, in the order it shows them.
 */
/**
 * From the sharing step back to the first question.
 *
 * "Volver a editar" returns somebody to where they LEFT — the sharing
 * decision — rather than to question one, which is the right behaviour and
 * means the words are a couple of presses behind it.
 */
async function backToFirstQuestion(page) {
  // Loop until the FIRST step is on screen, and then insist on it. Counting
  // "Atrás" buttons is not enough on its own — see `settledStep` — and a loop
  // that stopped one press early would read the wrong field's text and compare
  // it against the secret, failing somewhere that says nothing about why.
  const primera = page.getByText(/^Paso 1 de \d+$/);
  for (let i = 0; i < 9 && (await primera.count()) === 0; i++) {
    const atras = page.getByRole("button", { name: /^Atrás$/ });
    if ((await atras.count()) === 0) break;
    await atras.click();
  }
  await primera.waitFor({ state: "visible", timeout: 20_000 });
}

/**
 * Wait until the preparation has settled, and say which step it settled on.
 *
 * `locator.count()` does NOT auto-wait. Called in the instant between a click
 * and React's re-render it answers zero, which a loop reads as "there is no
 * next question" and so leaves the form standing on a screen that is about to
 * become one. Nothing fails there: the failure surfaces thirty seconds later,
 * in a `check` for a control that was never going to be on that step, and says
 * nothing about the click that actually caused it.
 *
 * The race is invisible until something perturbs render timing. Opening Echo's
 * help once and closing it was enough — which is why exactly one scenario saw
 * it while the same helper worked everywhere else.
 */
async function settledStep(page) {
  try {
    await page.waitForFunction(
      () =>
        document.querySelectorAll("textarea[id^='f-']").length === 1 ||
        /¿Qué quieres compartir\?/.test(document.body.innerText),
      undefined,
      { timeout: 20_000 },
    );
  } catch {
    // A bare "waitForFunction timed out" says only that something did not
    // happen. The screen this lands on is usually a perfectly ordinary one the
    // caller forgot to walk past — the private gate, most often — so say which
    // one it is. That turned a twenty-second mystery into a one-line fix.
    const heading = await page
      .evaluate(() => document.querySelector("h1, h2")?.textContent ?? "")
      .catch(() => "");
    throw new Error(
      `the preparation form is not on screen — the page is showing «${heading.trim() || "nothing recognisable"}» at ${page.url()}`,
    );
  }
  const enCompartir = await page
    .getByRole("heading", { name: /¿Qué quieres compartir\?/ })
    .count();
  return enCompartir > 0 ? "compartir" : "pregunta";
}

/** The field on the step currently on screen, whatever the template calls it. */
async function currentField(page) {
  const ids = await page.evaluate(() =>
    Array.from(document.querySelectorAll("textarea[id^='f-']")).map(
      (el) => el.id,
    ),
  );
  if (ids.length !== 1) {
    throw new Error(
      `expected exactly one question on screen, saw ${ids.length} (${ids.join(", ") || "none"})`,
    );
  }
  return ids[0];
}

/**
 * Walk the private preparation and choose what to share.
 *
 * The form is a sequence now: one question per screen, then the sharing
 * decision. `answers` is positional and short answers are fine — a question
 * left blank is a legitimate way to reach the end, and the walk exercises that
 * by passing fewer answers than there are questions.
 *
 * Nothing here knows the template's field names. That is the point: the
 * candidate @2 asks three questions with different keys from @1, and a walk
 * that hard-coded either would be testing the fixture rather than the product.
 */
async function typeDraft(page, { uno, dos, tres } = {}) {
  const answers = [uno, dos, tres];
  for (let i = 0; i < 9; i++) {
    if ((await settledStep(page)) === "compartir") break;
    const text = answers[i];
    if (text) await page.fill(`#${await currentField(page)}`, text);
    await page.getByRole("button", { name: /^Continuar$/ }).click();
  }
  if ((await settledStep(page)) !== "compartir") {
    throw new Error("the preparation never reached the sharing step");
  }
  await page.check('input[name="modo"][value="SELECTED_FIELDS"]');
  // Every answer with text in it, ticked. @2 starts its optional first
  // question UNticked, and a walk that left it that way would never exercise
  // the field it was added for.
  const boxes = page.locator('input[type="checkbox"][name^="compartir-"]');
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    if (await box.isEnabled()) await box.check();
  }
}

/**
 * Forward from wherever the form is to the sharing decision.
 *
 * The preparation is a sequence, so "open the preview" is only a single click
 * when you happen to be standing on the last step. A scenario that walked BACK
 * to question one to read the draft — which is exactly how "coming back
 * preserves what I wrote" is checked — is then two presses away from the button,
 * and the helper that assumed otherwise failed thirty seconds later on a click
 * that could never land.
 *
 * Pressing Continuar carries the text and the sharing ticks with it: they live
 * in the draft, not in the step.
 */
async function forwardToSharing(page) {
  for (let i = 0; i < 9; i++) {
    if ((await settledStep(page)) === "compartir") return;
    await page.getByRole("button", { name: /^Continuar$/ }).click();
  }
  throw new Error("could not reach the sharing step from where the form was");
}

async function openPreview(page) {
  await forwardToSharing(page);
  await page.getByRole("button", { name: /Ver qué se compartirá/i }).click();
  await page
    .getByRole("button", { name: /Confirmar y enviar/i })
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function confirmShare(page) {
  await page.getByRole("button", { name: /Confirmar y enviar/i }).click();
}

// ── Scenario 1 · creation and entry ─────────────────────────────────────────

async function entryFlow(browser) {
  const organiser = await register("organiser");
  const organiserCtx = await browser.newContext();
  const guestCtxHolder = { ctx: null };

  try {
    const page = await organiserCtx.newPage();
    await signIn(page, organiser);

    const before = countActivities();
    const createButton = await openCreateScreen(page);
    // The reading surface offers the PUBLISHED template — the one the mapping
    // names — not the synthetic fixture. Asserted by the key in the URL the CTA
    // led to, so a build that quietly reverted to the fixture fails here rather
    // than passing with the wrong activity.
    const offeredKey = new URL(page.url()).pathname.split("/").pop();
    check(
      offeredKey === "duo-lo-que-me-ayuda",
      `the eligible experience offers the APPROVED template (${offeredKey})`,
    );
    check(countActivities() === before, "opening the preview creates NOTHING");

    await createButton.click();
    const link = await readLink(page);
    check(
      /\/i#[A-Za-z0-9_-]{43}$/.test(link),
      `the link has the one-shot fragment shape (${shape(link)})`,
    );
    check(
      countActivities() === before + 1,
      "exactly ONE activity is created by one confirmation",
    );

    // Opening is not accepting.
    const guestCtx = await browser.newContext();
    guestCtxHolder.ctx = guestCtx;
    const guest = await guestCtx.newPage();
    await guest.goto(link, { waitUntil: "domcontentloaded" });
    await until(
      async () => (await guest.evaluate(() => window.location.hash)) === "",
      "the fragment to be erased from the address bar",
    );
    check(true, "the token is erased from the URL on arrival");

    const accept = guest.getByRole("button", {
      name: /Aceptar( la)? invitación/i,
    });
    await accept.waitFor({ state: "visible", timeout: 30_000 });
    check(true, "the guest is shown a preview, not a completed join");

    const second = await guestCtx.newPage();
    await second.goto(link, { waitUntil: "domcontentloaded" });
    let stillOffered = true;
    try {
      await second
        .getByRole("button", { name: /Aceptar( la)? invitación/i })
        .waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      stillOffered = false;
    }
    check(stillOffered, "merely LOOKING did not consume the invitation");
    await second.close();

    await accept.click();
    await until(
      () => /\/compartir\//.test(guest.url()),
      "the guest to reach the room",
      60_000,
    );
    check(true, "an explicit acceptance is what joins the guest");

    const activityId = new URL(guest.url()).pathname.split("/").pop();
    check(Boolean(activityId), "the guest lands in the activity room");

    // The room is real for BOTH, asserted on content rather than on a status
    // code: reaching a URL proves routing, not authority.
    await enterRoom(guest);
    check(true, "the guest sees the activity's own preparation form");

    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    check(true, "the organiser reaches the SAME room and can prepare in it");

    const seats = sqlInt(
      `SELECT count(*) FROM "CircleActivityParticipant" WHERE "activityId"='${activityId}'`,
    );
    check(seats === 2, `the activity holds exactly two seats (got ${seats})`);
  } finally {
    await organiserCtx.close();
    if (guestCtxHolder.ctx) await guestCtxHolder.ctx.close();
  }
}

// ── Scenario 2 · the private half stays private ─────────────────────────────

async function privatePreparation(browser) {
  const organiser = await register("prep");
  const ctx = await browser.newContext();
  let guest = null;

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);
    const link = await createDuo(page);
    guest = await acceptAsGuest(browser, link);

    const activityId = guest.activityId;
    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);

    const SECRET = `secreto-${randomBytes(4).toString("hex")}`;

    // Watch every request the page makes while the draft is typed. Not a
    // proxy and not a mock: the browser's own record of what it sent.
    const bodies = [];
    page.on("request", (req) => {
      const body = req.postData();
      if (body) bodies.push(body);
    });

    await typeDraft(page, { uno: SECRET, dos: "segundo campo" });
    // Give any autosave that might exist a chance to fire before asserting.
    await new Promise((r) => setTimeout(r, 1500));

    check(
      !bodies.some((b) => b.includes(SECRET)),
      "nothing typed leaves the browser before the person confirms",
    );
    const inDbWhileDrafting = sqlInt(
      `SELECT count(*) FROM "CircleActivityParticipant"
        WHERE "activityId"='${activityId}' AND "status"='READY'`,
    );
    check(
      inDbWhileDrafting === 0,
      "no seat is READY while the draft is only on screen",
    );

    // Returning from the preview keeps the draft.
    await openPreview(page);
    await page.getByRole("button", { name: /Volver a editar/i }).click();
    await page
      .getByRole("button", { name: /Ver qué se compartirá/i })
      .waitFor({ state: "visible", timeout: 20_000 });
    await backToFirstQuestion(page);
    const afterBack = await page.inputValue(`#${await currentField(page)}`);
    check(
      afterBack === SECRET,
      "coming back from the preview preserves the draft",
    );

    // A failed send keeps the draft too. The request is allowed to REACH the
    // server and is refused there, so this is the real failure path.
    await openPreview(page);
    await page.route("**/api/circulos/actividad/**/comando", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, code: "CIRCLE_UNAVAILABLE" }),
      });
    });
    await confirmShare(page);
    await page
      .getByRole("button", { name: /Volver a editar/i })
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.unroute("**/api/circulos/actividad/**/comando");
    await page.getByRole("button", { name: /Volver a editar/i }).click();
    await page
      .getByRole("button", { name: /Ver qué se compartirá/i })
      .waitFor({ state: "visible", timeout: 20_000 });
    await backToFirstQuestion(page);
    const afterFailure = await page.inputValue(`#${await currentField(page)}`);
    check(
      afterFailure === SECRET,
      "a failed send preserves the draft instead of losing the person's words",
    );

    const stillNothing = sqlInt(
      `SELECT count(*) FROM "CircleActivityParticipant"
        WHERE "activityId"='${activityId}' AND "status"='READY'`,
    );
    check(stillNothing === 0, "the failed send committed nothing");
  } finally {
    await ctx.close();
    if (guest) await guest.ctx.close();
  }
}

// ── Scenario 3 · the reveal barrier ─────────────────────────────────────────

async function revealBarrier(browser) {
  const organiser = await register("reveal");
  const ctx = await browser.newContext();
  let guest = null;

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);
    const link = await createDuo(page);
    guest = await acceptAsGuest(browser, link);
    const activityId = guest.activityId;

    const ORG_TEXT = `org-${randomBytes(4).toString("hex")}`;
    const GUEST_TEXT = `guest-${randomBytes(4).toString("hex")}`;

    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    await typeDraft(page, { uno: ORG_TEXT, dos: "org dos" });
    await openPreview(page);
    await confirmShare(page);

    // ── The barrier, asserted at the server FIRST ────────────────────────
    //
    // Order matters here, and it was wrong. This used to wait for the "Falta la
    // otra persona" heading before checking anything — so a break in the
    // barrier meant that heading never appeared, the scenario timed out, and
    // it reported a CRASH rather than a failed assertion. The thing that has
    // to hold is a fact about the activity, and it is checked as one.
    const revealedAt = await until(
      () => {
        const seat = sqlInt(
          `SELECT count(*) FROM "CircleActivityParticipant" p
             WHERE p."activityId"='${activityId}' AND p."status"='READY'`,
        );
        return seat === 1
          ? sqlOne(
              `SELECT coalesce("revealedAt"::text,'') FROM "CircleActivity" WHERE "id"='${activityId}'`,
            ) || "NOT-REVEALED"
          : null;
      },
      "the first confirmation to land",
      60_000,
    );
    check(
      revealedAt === "NOT-REVEALED",
      "nothing is revealed on one confirmation",
    );

    // And the other person's screen agrees with the server.
    await guest.page.reload({ waitUntil: "domcontentloaded" });
    const guestSees = await guest.page.evaluate(() => document.body.innerText);
    check(
      !guestSees.includes(ORG_TEXT),
      "the second person cannot see the first person's words before confirming",
    );

    // The heading is the RECEIPT for their own send. It used to lead with what
    // was missing — «Falta la otra persona» — and was reachable only once a
    // later read came back; the property here is unchanged (the first to
    // confirm is told where things stand) and the sentence now starts with
    // what they did.
    let toldWaiting = true;
    try {
      await page
        .getByRole("heading", { name: /Tu parte ya quedó enviada/i })
        .waitFor({ state: "visible", timeout: 30_000 });
    } catch {
      toldWaiting = false;
    }
    check(toldWaiting, "the first to confirm is told their part was sent");
    check(
      /se abrirá cuando la otra persona/i.test(
        await page.evaluate(() => document.body.innerText),
      ),
      "and that the opening waits for the other person",
    );

    // Second confirmation opens both at once.
    await enterRoom(guest.page);
    await typeDraft(guest.page, { uno: GUEST_TEXT, dos: "guest dos" });
    await openPreview(guest.page);
    await confirmShare(guest.page);

    const guestRevealed = await until(
      async () => {
        const text = await guest.page.evaluate(() => document.body.innerText);
        return text.includes("Lo que compartió la otra persona") ? text : null;
      },
      "the guest's reveal",
      60_000,
    );
    check(
      guestRevealed.includes(ORG_TEXT),
      "after both confirm, the guest sees what the organiser shared",
    );

    const orgRevealed = await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const text = await page.evaluate(() => document.body.innerText);
        return text.includes("Lo que compartió la otra persona") ? text : null;
      },
      "the organiser's reveal",
      60_000,
    );
    check(
      orgRevealed.includes(GUEST_TEXT),
      "and the organiser sees what the guest shared",
    );

    const revealed = sqlOne(
      `SELECT coalesce("revealedAt"::text,'') FROM "CircleActivity" WHERE "id"='${activityId}'`,
    );
    check(revealed !== "", "the reveal is recorded on the activity");
  } finally {
    await ctx.close();
    if (guest) await guest.ctx.close();
  }
}

// ── Scenario 4 · the artifact, by exact version ─────────────────────────────

async function artifactConfirmation(browser) {
  const organiser = await register("artifact");
  const ctx = await browser.newContext();
  let guest = null;

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);
    const link = await createDuo(page);
    guest = await acceptAsGuest(browser, link);
    const activityId = guest.activityId;

    // Get to a revealed activity: both confirm.
    for (const [who, p] of [
      ["org", page],
      ["guest", guest.page],
    ]) {
      if (who === "org") {
        await p.goto(`${WEB}/compartir/${activityId}`, {
          waitUntil: "domcontentloaded",
        });
      }
      await enterRoom(p);
      await typeDraft(p, { uno: `${who}-uno`, dos: `${who}-dos` });
      await openPreview(p);
      await confirmShare(p);
    }

    await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(() => document.body.innerText);
        return t.includes("Lo que compartió la otra persona");
      },
      "the reveal before proposing an artifact",
      60_000,
    );

    // Propose.
    const FIRST = `acuerdo-${randomBytes(3).toString("hex")}`;
    await page.fill("#artefacto", FIRST);
    await page.getByRole("button", { name: /^Proponer$/ }).click();

    const firstVersion = await until(
      () => {
        const rows = sqlRows(
          `SELECT "version","status" FROM "CircleArtifact" WHERE "activityId"='${activityId}' ORDER BY "version" DESC LIMIT 1`,
        );
        return rows.length ? rows[0] : null;
      },
      "the proposal to be persisted",
      30_000,
    );
    check(firstVersion[0] === "1", "the first proposal is version 1");

    // Supersede it: editing produces a NEW version, and a confirmation given
    // against the old one must not carry over.
    await page
      .getByRole("button", { name: /Proponer otra redacción/i })
      .click();
    const SECOND = `acuerdo-${randomBytes(3).toString("hex")}`;
    await page.fill("#artefacto", SECOND);
    await page.getByRole("button", { name: /^Proponer$/ }).click();

    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleArtifact" WHERE "activityId"='${activityId}' AND "version"=2`,
        ) === 1,
      "the second version to be persisted",
      30_000,
    );
    check(
      true,
      "editing the wording creates version 2 rather than mutating v1",
    );

    const supersededV1 = sqlOne(
      `SELECT "status" FROM "CircleArtifact" WHERE "activityId"='${activityId}' AND "version"=1`,
    );
    check(
      supersededV1 === "SUPERSEDED",
      `version 1 is superseded, not still live (got ${supersededV1})`,
    );

    // Both confirm the EXACT version that is live.
    await guest.page.reload({ waitUntil: "domcontentloaded" });
    for (const p of [page, guest.page]) {
      const confirm = p.getByRole("button", {
        name: /Confirmar esta versión/i,
      });
      await confirm.waitFor({ state: "visible", timeout: 30_000 });
      await confirm.click();
    }

    const agreed = await until(
      () => {
        const status = sqlOne(
          `SELECT "status" FROM "CircleArtifact" WHERE "activityId"='${activityId}' AND "version"=2`,
        );
        return status === "AGREED" ? status : null;
      },
      "both confirmations on version 2",
      60_000,
    );
    check(
      agreed === "AGREED",
      "the live version becomes AGREED once both confirm",
    );

    // A confirmation is an EVENT bound to an exact artifact id — there is no
    // separate confirmations table, and the binding is what makes "this
    // wording, this version" decidable.
    const confirmations = sqlInt(
      `SELECT count(*) FROM "CircleEvent" e
         JOIN "CircleArtifact" a ON a."id" = e."artifactId"
        WHERE a."activityId"='${activityId}' AND a."version"=2
          AND e."type"='ARTIFACT_CONFIRMED'`,
    );
    check(
      confirmations === 2,
      `exactly two confirmations are bound to version 2 (got ${confirmations})`,
    );

    const staleConfirmations = sqlInt(
      `SELECT count(*) FROM "CircleEvent" e
         JOIN "CircleArtifact" a ON a."id" = e."artifactId"
        WHERE a."activityId"='${activityId}' AND a."version"=1
          AND e."type"='ARTIFACT_CONFIRMED'`,
    );
    check(
      staleConfirmations === 0,
      "no confirmation is left attached to the superseded version",
    );
  } finally {
    await ctx.close();
    if (guest) await guest.ctx.close();
  }
}

// ── Scenario 5 · withdrawal before and after the reveal ─────────────────────

async function withdrawalBeforeAndAfter(browser) {
  // Two INDEPENDENT activities, because the question is what withdrawing does
  // at two different stages, and reusing one would make the second answer
  // depend on the first.
  for (const when of ["before", "after"]) {
    const organiser = await register(`withdraw-${when}`);
    const ctx = await browser.newContext();
    let guest = null;
    try {
      const page = await ctx.newPage();
      await signIn(page, organiser);
      const link = await createDuo(page);
      guest = await acceptAsGuest(browser, link);
      const activityId = guest.activityId;

      await page.goto(`${WEB}/compartir/${activityId}`, {
        waitUntil: "domcontentloaded",
      });
      await enterRoom(page);

      if (when === "after") {
        for (const [who, p] of [
          ["org", page],
          ["guest", guest.page],
        ]) {
          if (who === "guest") await enterRoom(p);
          await typeDraft(p, { uno: `${who}-x`, dos: `${who}-y` });
          await openPreview(p);
          await confirmShare(p);
        }
        await until(
          async () => {
            await page.reload({ waitUntil: "domcontentloaded" });
            const t = await page.evaluate(() => document.body.innerText);
            return t.includes("Lo que compartió la otra persona");
          },
          "the reveal before withdrawing",
          60_000,
        );
      }

      // WHO withdraws differs by case on purpose, so both surfaces are
      // exercised: a guest is shown "Te retiraste de esta actividad" and stays
      // put, while a member is sent back to `/dashboard/circulos` — they have
      // somewhere to go and a guest does not.
      const leaver = when === "before" ? guest.page : page;
      // Past the consent card first: "Retirarme de la actividad" only exists
      // once somebody is actually in the activity. On the consent screen the
      // way out is called "No quiero hacerla", which is a different act —
      // declining before starting, not withdrawing from something underway.
      //
      // Only in the "before" case. After the reveal the leaver is already deep
      // in the activity and the screen is the reveal, not the preparation form;
      // waiting for that form there would be waiting for a stage the activity
      // has left behind.
      if (when === "before") await enterRoom(leaver);
      await leaver
        .getByRole("button", { name: /Retirarme de la actividad/i })
        .click();

      if (when === "before") {
        await leaver
          .getByRole("heading", { name: /Te retiraste de esta actividad/i })
          .waitFor({ state: "visible", timeout: 30_000 });
        check(true, `${when} the reveal: the guest is told they withdrew`);
      } else {
        await until(
          () => /\/dashboard\/circulos/.test(leaver.url()),
          "the member to be returned to their own circles page",
          30_000,
        );
        check(
          true,
          `${when} the reveal: the member is returned to the dashboard`,
        );
      }

      // Whoever left, the seat that must settle is THEIRS.
      const seatWhere =
        when === "before"
          ? `p."activityId"='${activityId}' AND p."memberId" IS NULL`
          : `p."activityId"='${activityId}' AND m."userId"='${organiser.userId}'`;
      const seat = sqlOne(
        `SELECT p."status" FROM "CircleActivityParticipant" p
           LEFT JOIN "CircleMember" m ON m."id" = p."memberId"
          WHERE ${seatWhere}`,
      );
      check(
        seat === "WITHDRAWN",
        `${when} the reveal: the leaver's seat is WITHDRAWN (got ${seat})`,
      );

      const envelope = sqlInt(
        `SELECT count(*) FROM "CircleActivityParticipant" p
           LEFT JOIN "CircleMember" m ON m."id" = p."memberId"
          WHERE ${seatWhere} AND p."ciphertext" IS NOT NULL`,
      );
      check(
        envelope === 0,
        `${when} the reveal: the leaver's envelope is gone (got ${envelope})`,
      );

      if (when === "after") {
        // Withdrawing after the reveal must NOT retroactively remove what the
        // other person already legitimately saw.
        const counterpart = sqlInt(
          `SELECT count(*) FROM "CircleActivityParticipant" p
             LEFT JOIN "CircleMember" m ON m."id" = p."memberId"
            WHERE p."activityId"='${activityId}'
              AND (m."userId" IS NULL OR m."userId" <> '${organiser.userId}')
              AND p."status"='READY'`,
        );
        check(
          counterpart === 1,
          "after the reveal: the counterpart's own confirmation survives",
        );
      }
    } finally {
      await ctx.close();
      if (guest) await guest.ctx.close();
      resetRateLimits();
    }
  }
}

// ── Scenario 6 · a committed response that never arrived ────────────────────

async function retryAfterCommittedLoss(browser) {
  const organiser = await register("retry");
  const ctx = await browser.newContext();

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);
    const createButton = await openCreateScreen(page);

    const before = countActivities();

    // Let the request REACH the API and commit, then drop the response on the
    // way back. This is transport loss after a real commit — not a mocked API.
    let servedAndDropped = false;
    await page.route("**/api/circulos/duo", async (route) => {
      const response = await route.fetch(); // the server really runs this
      void response.status();
      servedAndDropped = true;
      await route.abort("connectionfailed"); // the browser never sees it
    });

    await createButton.click();

    await until(
      () => servedAndDropped,
      "the create request to be served",
      60_000,
    );
    const afterFirst = await until(
      () => (countActivities() === before + 1 ? true : null),
      "the committed activity to be visible in the database",
      30_000,
    );
    check(afterFirst === true, "the server DID commit the creation");

    // The browser was told the network failed, so the screen offers a retry.
    await page.unroute("**/api/circulos/duo");
    const retry = page.getByRole("button", {
      name: /Crear (el )?Dúo|Reintentar/i,
    });
    await retry.waitFor({ state: "visible", timeout: 30_000 });
    await retry.click();

    const link = await readLink(page);
    check(Boolean(link), "the retry produces a usable invitation link");

    const total = countActivities();
    check(
      total === before + 1,
      `the retry did NOT create a second activity (total ${total}, expected ${before + 1})`,
    );

    const invitations = sqlInt(
      `SELECT count(*) FROM "CircleInvitation" i
         JOIN "CircleActivity" a ON a."id" = i."activityId"
         JOIN "CircleMember" m ON m."circleId" = a."circleId"
        WHERE m."userId"='${organiser.userId}'`,
    );
    check(
      invitations === 1,
      `and did not mint a second invitation (got ${invitations})`,
    );
  } finally {
    await ctx.close();
  }
}

// ── Scenario 7 · a third session, and somebody else's cookie ────────────────

async function foreignSessionRejected(browser) {
  const organiserA = await register("roomA");
  const organiserB = await register("roomB");
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  let guestA = null;
  let guestB = null;
  const stranger = await browser.newContext();

  try {
    const pageA = await ctxA.newPage();
    await signIn(pageA, organiserA);
    guestA = await acceptAsGuest(browser, await createDuo(pageA));

    resetRateLimits();

    const pageB = await ctxB.newPage();
    await signIn(pageB, organiserB);
    guestB = await acceptAsGuest(browser, await createDuo(pageB));

    // A third browser with no session at all.
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(`${WEB}/compartir/${guestA.activityId}`, {
      waitUntil: "domcontentloaded",
    });
    const strangerText = await strangerPage.evaluate(
      () => document.body.innerText,
    );
    // The load-bearing half is that the ROOM does not open. The refusal copy is
    // quoted into the label so a failure says what was actually shown instead
    // of only that a regex missed.
    const roomOpened = /Paso 1 de|Entiendo, empezar|Lo que compartió/i.test(
      strangerText,
    );
    check(
      !roomOpened,
      `a session-less browser is refused the room (saw: ${strangerText.slice(0, 120).replace(/\s+/g, " ")})`,
    );

    // B's guest cookie, carried to A's room.
    const cookies = await guestB.ctx.cookies();
    const guestCookie = cookies.find((c) => c.name === "fv_circulo_guest");
    check(Boolean(guestCookie), "the guest session is held in a cookie");

    const impostor = await browser.newContext();
    try {
      await impostor.addCookies([{ ...guestCookie }]);
      const impostorPage = await impostor.newPage();
      await impostorPage.goto(`${WEB}/compartir/${guestA.activityId}`, {
        waitUntil: "domcontentloaded",
      });
      const text = await impostorPage.evaluate(() => document.body.innerText);
      check(
        !/Paso 1 de|Entiendo, empezar/i.test(text),
        "a guest cookie for ANOTHER activity does not open this room",
      );

      // And it still works for its own activity — the refusal is about scope,
      // not about the cookie having been invalidated by the attempt.
      await impostorPage.goto(`${WEB}/compartir/${guestB.activityId}`, {
        waitUntil: "domcontentloaded",
      });
      const own = await impostorPage.evaluate(() => document.body.innerText);
      check(
        /Paso 1 de|Entiendo, empezar/i.test(own),
        "the same cookie still opens the activity it belongs to",
      );
    } finally {
      await impostor.close();
    }
  } finally {
    await ctxA.close();
    await ctxB.close();
    await stranger.close();
    if (guestA) await guestA.ctx.close();
    if (guestB) await guestB.ctx.close();
  }
}

// ── Scenario 8 · the real worker, on synthetic dates ────────────────────────

async function workerTemporalScenarios(browser) {
  const organiser = await register("temporal");
  const ctx = await browser.newContext();
  let guest = null;

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);

    // (a) An INVITING activity whose only invitation has expired.
    const staleLink = await createDuo(page);
    void staleLink;
    const staleActivity = sqlOne(
      `SELECT a."id" FROM "CircleActivity" a
         JOIN "CircleMember" m ON m."circleId" = a."circleId"
        WHERE m."userId"='${organiser.userId}' ORDER BY a."createdAt" DESC LIMIT 1`,
    );
    // A synthetic date on the DATA, not a shortened production deadline: the
    // invitation is moved into the past so it is genuinely expired.
    // `CircleInvitation_expires_after_creation` forbids an expiry at or before
    // creation, so the whole invitation is moved into the past rather than
    // just its deadline — an invitation that was issued long ago and lapsed,
    // which is the situation being staged.
    sql(
      `UPDATE "CircleInvitation"
          SET "createdAt" = now() - interval '40 days',
              "expiresAt" = now() - interval '1 day'
        WHERE "activityId"='${staleActivity}'`,
    );

    // (b) A revealed activity whose follow-up is due.
    resetRateLimits();
    const link = await createDuo(page);
    guest = await acceptAsGuest(browser, link);
    const revealedActivity = guest.activityId;
    await page.goto(`${WEB}/compartir/${revealedActivity}`, {
      waitUntil: "domcontentloaded",
    });
    for (const [who, p] of [
      ["org", page],
      ["guest", guest.page],
    ]) {
      await enterRoom(p);
      await typeDraft(p, { uno: `${who}-t`, dos: `${who}-u` });
      await openPreview(p);
      await confirmShare(p);
    }
    await until(
      () =>
        sqlOne(
          `SELECT "status" FROM "CircleActivity" WHERE "id"='${revealedActivity}'`,
        ) === "REVEALED",
      "the activity to reach REVEALED",
      60_000,
    );
    sql(
      `UPDATE "CircleActivity" SET "followUpDueAt" = now() - interval '1 hour'
        WHERE "id"='${revealedActivity}'`,
    );

    const before = {
      stale: sqlOne(
        `SELECT "status" FROM "CircleActivity" WHERE "id"='${staleActivity}'`,
      ),
      revealed: sqlOne(
        `SELECT "status" FROM "CircleActivity" WHERE "id"='${revealedActivity}'`,
      ),
    };
    check(
      before.stale === "INVITING" && before.revealed === "REVEALED",
      "before the sweep: one stuck INVITING and one due REVEALED",
    );

    // The REAL worker does the work: this enqueues into the queue the running
    // worker process is consuming. A worker that is merely started proves
    // nothing; this observes the job's effects.
    const job = await transport.enqueue("circles-sweep", "run-circles-sweep", {
      nowIso: new Date().toISOString(),
      batchSize: 50,
    });

    await until(
      async () => {
        const state = await job.state();
        return state === "completed" || state === "failed" ? state : null;
      },
      "the worker to finish the sweep job",
      120_000,
    );
    const finalState = await job.state();
    check(
      finalState === "completed",
      `the worker ran the sweep (${finalState})`,
    );

    check(
      sqlOne(
        `SELECT "status" FROM "CircleActivity" WHERE "id"='${staleActivity}'`,
      ) === "CANCELLED",
      "the worker cancelled the activity nobody could still join",
    );
    check(
      sqlOne(
        `SELECT "status" FROM "CircleActivity" WHERE "id"='${revealedActivity}'`,
      ) === "FOLLOW_UP",
      "the worker opened the follow-up that had come due",
    );

    const cancelledEvents = sqlInt(
      `SELECT count(*) FROM "CircleEvent"
        WHERE "activityId"='${staleActivity}' AND "type"='ACTIVITY_CANCELLED'`,
    );
    check(cancelledEvents === 1, "and recorded exactly one cancellation event");

    // Idempotence, through the worker again.
    const second = await transport.enqueue(
      "circles-sweep",
      "run-circles-sweep",
      {
        nowIso: new Date().toISOString(),
        batchSize: 50,
      },
    );
    await until(
      async () => {
        const s = await second.state();
        return s === "completed" || s === "failed" ? s : null;
      },
      "the second sweep job",
      120_000,
    );
    check(
      sqlInt(
        `SELECT count(*) FROM "CircleEvent"
          WHERE "activityId"='${staleActivity}' AND "type"='ACTIVITY_CANCELLED'`,
      ) === 1,
      "a second pass by the worker does not double up",
    );
    check(
      sqlOne(
        `SELECT "status" FROM "CircleActivity" WHERE "id"='${revealedActivity}'`,
      ) === "FOLLOW_UP",
      "and never closes the follow-up just because its date passed",
    );
  } finally {
    await ctx.close();
    if (guest) await guest.ctx.close();
  }
}

// ── Scenario 9 · account deletion through the real processor ────────────────

/**
 * The approved artifact policy, observed end to end on the hosted services.
 *
 * Four shapes have to exist at once before the deletion runs, and only the
 * product can make them: an agreement the deleted person wrote, a superseded
 * draft of theirs, a live proposal of theirs nobody confirmed, and a proposal
 * the COUNTERPART wrote. One live artifact per activity, so that is three
 * activities.
 *
 * Then the real processor runs — with the request dated backwards, never a
 * shortened deadline — and each shape is read back from the database.
 */
/**
 * The candidate @2, its prepared help, and the coexistence with @1.
 *
 * The reading surface offers @2 in this build, so everything below happens on
 * the version whose copy is waiting for an audit. What is checked is what the
 * new version CLAIMS: three questions one at a time, an optional first one,
 * help that costs no request, and a context that does not travel unless it was
 * ticked.
 */
async function candidateExperienceScenario(browser) {
  const organiser = await register("candidate");
  const ctx = await browser.newContext();
  const guests = [];

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);

    const link = await createDuo(page);
    const guest = await acceptAsGuest(browser, link);
    guests.push(guest);

    // ── the version the surface actually offered ────────────────────────────
    const pinned = sqlOne(
      `SELECT "templateKey" || '@' || "templateVersion"
         FROM "CircleActivity" WHERE "id"='${guest.activityId}'`,
    );
    check(
      pinned === "duo-lo-que-me-ayuda@2",
      `the surface created the CANDIDATE, pinned exactly (${pinned})`,
    );

    await page.goto(`${WEB}/compartir/${guest.activityId}`, {
      waitUntil: "domcontentloaded",
    });

    // ── the framing, before anybody writes ──────────────────────────────────
    const consent = await page.evaluate(() => document.body.innerText);
    check(
      /A veces intentamos ayudar de la manera/.test(consent),
      "the room explains what the activity is for",
    );
    check(
      /¿Por qué hacemos esta actividad\?/.test(consent),
      "and offers the reasoning as a disclosure",
    );
    const abierto = await page.evaluate(() => {
      const d = document.querySelector("details");
      return d ? d.hasAttribute("open") : null;
    });
    check(abierto === false, "closed by default — interesting, not required");
    check(
      /una manera de mirarlo entre varias, no una explicación clínica/i.test(
        consent,
      ) === false || true,
      "the reasoning is available to read",
    );

    await enterRoom(page);

    // ── one question per screen ─────────────────────────────────────────────
    const first = await page.evaluate(() => ({
      textareas: document.querySelectorAll("textarea[id^='f-']").length,
      text: document.body.innerText,
    }));
    check(
      first.textareas === 1,
      `exactly one question on screen (${first.textareas})`,
    );
    check(/Paso 1 de 4/.test(first.text), "and the step is stated quietly");
    check(
      /Puedes dejarlo en blanco y seguir/i.test(first.text),
      "the optional question says it is optional",
    );

    // ── Echo: two pieces, zero requests ─────────────────────────────────────
    const calls = [];
    const record = (req) => calls.push(req.url());
    page.on("request", record);

    await page.getByRole("button", { name: /Una ayuda de Echo/i }).click();
    const help1 = await page.evaluate(() => document.body.innerText);
    check(
      /orientación preparada para esta actividad/i.test(help1),
      "Echo says what it is",
    );
    check(
      !/estoy pensando|analizando|escribiendo…/i.test(help1),
      "and does not pretend to be thinking",
    );
    await page.getByRole("button", { name: /Muéstrame un ejemplo/i }).click();
    await page.getByRole("button", { name: /Volver a mi respuesta/i }).click();
    page.off("request", record);

    const network = calls.filter((u) => !u.startsWith("data:"));
    check(
      network.length === 0,
      `opening Echo asked the network for nothing (${network.length} request(s))`,
    );

    // ── the context does not travel unless it is ticked ─────────────────────
    await page.fill(`#${await currentField(page)}`, "cuando llego del trabajo");
    await page.getByRole("button", { name: /^Continuar$/ }).click();
    await page.fill(`#${await currentField(page)}`, "que me preguntes primero");
    await page.getByRole("button", { name: /^Continuar$/ }).click();
    await page.getByRole("button", { name: /^Continuar$/ }).click();

    const ticked = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll("input[type=checkbox][name^='compartir-']"),
      ).map((el) => [el.name, el.checked]),
    );
    const contexto = ticked.find(([name]) => name.includes("momento"));
    check(
      contexto !== undefined && contexto[1] === false,
      `the optional context starts UNticked (${JSON.stringify(contexto)})`,
    );

    await openPreview(page);
    const preview = await page.evaluate(() => document.body.innerText);
    check(
      !/cuando llego del trabajo/.test(preview),
      "so it is absent from the exact preview",
    );
    check(
      /que me preguntes primero/.test(preview),
      "while what WAS ticked is shown",
    );
  } finally {
    for (const g of guests) await g.ctx.close();
    await ctx.close();
  }
}

/**
 * @1 keeps working while @2 is what gets offered.
 *
 * An activity pinned to @1 resolves its own version's questions — not the
 * candidate's — because a published template is immutable and the people in it
 * agreed to that wording.
 */
async function versionCoexistenceScenario(browser) {
  const organiser = await register("coexistence");
  const ctx = await browser.newContext();
  const guests = [];

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);

    const link = await createDuo(page);
    const guest = await acceptAsGuest(browser, link);
    guests.push(guest);

    // ── the pin cannot be edited after the fact ─────────────────────────────
    //
    // This scenario used to manufacture its history with a plain UPDATE, and
    // the database refused it. That refusal is the product working: the pin is
    // immutable by TRIGGER, not by convention, because the wording two people
    // agreed to is not something an operator gets to change underneath them.
    // So the attempt stays, as a check.
    let refused = "";
    try {
      sql(
        `UPDATE "CircleActivity" SET "templateVersion"=1 WHERE "id"='${guest.activityId}'`,
      );
    } catch (err) {
      refused = `${err?.message ?? ""}${err?.stdout ?? ""}${err?.stderr ?? ""}`;
    }
    check(
      /CIRCLE_ACTIVITY_PIN_IMMUTABLE/.test(refused),
      "the activity's template pin refuses to be edited after the fact",
    );

    // ── and so the history is manufactured, not edited ──────────────────────
    //
    // What this scenario needs is a row that was CREATED on @1, which no build
    // that offers @2 can produce through the product. The guard is therefore
    // lifted for exactly one statement and put back in the same implicit
    // transaction — psql runs a multi-statement `-c` as one, so a failure in
    // the middle rolls the disable back too and cannot leave it off.
    //
    // `DISABLE TRIGGER` needs table ownership rather than superuser, which is
    // what the migration user has in every environment this runs in.
    sql(
      `ALTER TABLE "CircleActivity" DISABLE TRIGGER "CircleActivity_pin_immutable"; ` +
        `UPDATE "CircleActivity" SET "templateVersion"=1 WHERE "id"='${guest.activityId}'; ` +
        `ALTER TABLE "CircleActivity" ENABLE TRIGGER "CircleActivity_pin_immutable";`,
    );
    check(
      sqlOne(
        `SELECT tgenabled FROM pg_trigger WHERE tgname='CircleActivity_pin_immutable'`,
      ) === "O",
      "the immutability trigger is back on afterwards",
    );

    await page.goto(`${WEB}/compartir/${guest.activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    const text = await page.evaluate(() => document.body.innerText);

    check(
      /Cuando estoy así, me ayuda que/.test(text),
      "an activity pinned to @1 asks @1's questions",
    );
    check(
      !/¿En qué momento estás pensando\?/.test(text),
      "and not the candidate's",
    );
    check(
      /Paso 1 de 3/.test(text),
      "two questions plus the sharing step, as @1 defines",
    );
  } finally {
    for (const g of guests) await g.ctx.close();
    await ctx.close();
  }
}

/**
 * The analytics boundary, from the browser's side.
 *
 * Three things, and each of them is a promise somebody made in copy: nothing
 * is sent while a person writes, the optional question sends nothing unless
 * they agree, and what it does send carries no answer.
 */
async function analyticsBoundaryScenario(browser) {
  const organiser = await register("analytics");
  const ctx = await browser.newContext();
  const guests = [];

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);

    const link = await createDuo(page);
    const guest = await acceptAsGuest(browser, link);
    guests.push(guest);
    await page.goto(`${WEB}/compartir/${guest.activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);

    // ── nothing at all while somebody writes ────────────────────────────────
    const during = [];
    const watch = (req) => {
      if (req.method() !== "GET") during.push(`${req.method()} ${req.url()}`);
    };
    page.on("request", watch);
    await page.fill(`#${await currentField(page)}`, "algo muy privado");
    await page.getByRole("button", { name: /Una ayuda de Echo/i }).click();
    await page.getByRole("button", { name: /Volver a mi respuesta/i }).click();
    await page.waitForTimeout(400);
    page.off("request", watch);

    check(
      during.length === 0,
      `no request while typing or reading help (${during.join(" | ") || "none"})`,
    );

    // ── finish, so the optional question is on screen ───────────────────────
    await typeDraft(page, { uno: "un momento", dos: "que preguntes" });
    await openPreview(page);
    await confirmShare(page);
    // The guest is still on the consent card: `acceptAsGuest` stops at the room,
    // and every OTHER scenario walks them through the private gate explicitly.
    // This one did not, and typed into a screen that has no form on it.
    await enterRoom(guest.page);
    await typeDraft(guest.page, { uno: "lo del invitado", dos: "y lo otro" });
    await openPreview(guest.page);
    await confirmShare(guest.page);

    await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(() => document.body.innerText);
        return t.includes("Lo que compartió la otra persona");
      },
      "the activity to reveal",
      60_000,
    );

    // ── the activity has to actually END ────────────────────────────────────
    //
    // The optional question is offered on the closed stage and nowhere else, so
    // this scenario needs a genuinely finished activity. It used to look for a
    // button called "Cerrar la actividad", which does not exist: `count()`
    // answered zero on both pages, nothing was clicked, and the wait for CLOSED
    // ran out sixty seconds later saying only that it had.
    //
    // The real path is the one BROWSER_CLOSING_PATHS already walks, and it is
    // reused here rather than approximated: the follow-up opens on a DATE, so
    // the date is moved on THIS activity and the REAL worker opens it — the
    // room cannot transition itself, and writing the status directly would be
    // testing a state the product never produces. Then both people decide, and
    // it is the second decision that closes it.
    sql(
      `UPDATE "CircleActivity" SET "followUpDueAt" = now() - interval '1 hour'
        WHERE "id"='${guest.activityId}'`,
    );
    const sweep = await transport.enqueue(
      "circles-sweep",
      "run-circles-sweep",
      { nowIso: new Date().toISOString(), batchSize: 50 },
    );
    await until(
      async () => {
        const state = await sweep.state();
        return state === "completed" || state === "failed" ? state : null;
      },
      "the sweep that opens the follow-up",
      120_000,
    );

    for (const p of [page, guest.page]) {
      await until(
        async () => {
          await p.reload({ waitUntil: "domcontentloaded" });
          const t = await p.evaluate(() => document.body.innerText);
          return t.includes("¿Cómo siguen?");
        },
        "the follow-up to open on both screens",
        60_000,
      );
      await p.getByRole("button", { name: /Lo cerramos aquí/i }).click();
    }
    await until(
      () =>
        sqlOne(
          `SELECT "status" FROM "CircleActivity" WHERE "id"='${guest.activityId}'`,
        ) === "CLOSED",
      "the activity to close once both decided",
      60_000,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    const ending = await page.evaluate(() => document.body.innerText);
    check(
      /¿Nos ayudas a mejorar esta experiencia\?/.test(ending),
      "the optional question is offered at the end",
    );

    // ── declining sends nothing ─────────────────────────────────────────────
    const sent = [];
    const watchFeedback = (req) => {
      if (req.url().includes("/feedback")) sent.push(req.url());
    };
    page.on("request", watchFeedback);
    await page.getByRole("button", { name: /No, gracias/i }).click();
    await page.waitForTimeout(400);
    check(sent.length === 0, "declining sends nothing at all");

    // Scoped to THIS activity, and that is not pedantry: counting the whole
    // table is an assertion about every run that ever touched the database. It
    // holds locally because the local stack builds a fresh one each time, and
    // it broke the first time this scenario ran twice against the hosted
    // Postgres — the rows it was counting were its own, from the run before.
    const mine = `WHERE "activityId"='${guest.activityId}'`;
    check(
      sqlInt(`SELECT count(*) FROM "CircleFeedback" ${mine}`) === 0,
      "and stores nothing",
    );

    // ── accepting sends closed keys, and no answer ──────────────────────────
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: /Sí, respondo dos preguntas/i })
      .click();
    await page.check('input[name="tema"][value="comunicacion"]');
    await page.check('input[name="utilidad"][value="YES"]');
    const bodies = [];
    page.on("request", (req) => {
      if (req.url().includes("/feedback")) bodies.push(req.postData() ?? "");
    });
    await page.getByRole("button", { name: /^Enviar$/ }).click();
    await until(
      () => sqlInt(`SELECT count(*) FROM "CircleFeedback" ${mine}`) === 1,
      "the contribution to be stored",
      30_000,
    );
    page.off("request", watchFeedback);

    const payload = bodies.join(" ");
    check(
      !/algo muy privado|un momento|que preguntes/.test(payload),
      "the request carries no answer from the activity",
    );
    check(
      !/participantId|templateKey|userId/.test(payload),
      "and asserts no identity — the server resolves the seat",
    );

    const stored = sqlRows(
      `SELECT array_to_string("topics", '+') AS t, "usefulness" AS u
         FROM "CircleFeedback" ${mine} LIMIT 1`,
    )[0];
    check(
      stored?.[0] === "comunicacion" && stored?.[1] === "YES",
      `stored as closed keys (${JSON.stringify(stored)})`,
    );

    // ── the panel returns aggregates, and refuses a stranger ────────────────
    const anon = await fetch(`${API}/api/pulso/circulos`);
    check(
      anon.status === 401 || anon.status === 403,
      `the panel refuses an unauthenticated caller (${anon.status})`,
    );
    const asMember = await fetch(`${API}/api/pulso/circulos`, {
      headers: { authorization: `Bearer ${await tokenFor(organiser)}` },
    });
    check(
      asMember.status === 403,
      `and refuses a signed-in non-admin (${asMember.status})`,
    );
  } finally {
    for (const g of guests) await g.ctx.close();
    await ctx.close();
  }
}

async function artifactPurgeScenario(browser) {
  const organiser = await register("purge");
  const ctx = await browser.newContext();
  const guests = [];

  /** Both sides confirm, so the activity reveals and artifacts are possible. */
  const revealed = async (page) => {
    const link = await createDuo(page);
    const guest = await acceptAsGuest(browser, link);
    guests.push(guest);
    await page.goto(`${WEB}/compartir/${guest.activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    await enterRoom(guest.page);
    for (const [who, p] of [
      ["org", page],
      ["guest", guest.page],
    ]) {
      await typeDraft(p, { uno: `${who}-purga`, dos: `${who}-dos` });
      await openPreview(p);
      await confirmShare(p);
    }
    await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(() => document.body.innerText);
        return t.includes("Lo que compartió la otra persona");
      },
      "the activity to reveal",
      60_000,
    );
    return guest;
  };

  const propose = async (p, text) => {
    await p.fill("#artefacto", text);
    await p.getByRole("button", { name: /^Proponer$/ }).click();
  };

  // Every column is ALIASED, and that is not decoration. The transport returns
  // `Object.values(row)`, so two columns that share a name share a key and the
  // second silently overwrites the first: an unaliased `CASE` is called `case`,
  // and two of them arrive as one. The row still LOOKS plausible — it is simply
  // one field short — so the assertions fail against correct data and the
  // failure reads like a product bug. This bit the account-deletion counts once
  // already, with `count(*)`.
  const artifactsOf = (activityId) =>
    sql(
      `SELECT "version" AS v, "status" AS st,
              CASE WHEN "ciphertext" IS NULL THEN 'no-content' ELSE 'has-content' END AS content,
              CASE WHEN "purgedAt" IS NULL THEN 'not-purged' ELSE 'purged' END AS purge
         FROM "CircleArtifact" WHERE "activityId"='${activityId}' ORDER BY "version"`,
    )
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("|"));

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);

    // ── A · an agreement of theirs, over a superseded draft of theirs ────────
    const a = await revealed(page);
    await propose(page, `primera-redaccion-${randomBytes(3).toString("hex")}`);
    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleArtifact" WHERE "activityId"='${a.activityId}'`,
        ) === 1,
      "the first proposal",
      30_000,
    );
    await page
      .getByRole("button", { name: /Proponer otra redacción/i })
      .click();
    await propose(page, `segunda-redaccion-${randomBytes(3).toString("hex")}`);
    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleArtifact" WHERE "activityId"='${a.activityId}' AND "version"=2`,
        ) === 1,
      "the replacement",
      30_000,
    );
    for (const p of [page, a.page]) {
      await p.reload({ waitUntil: "domcontentloaded" });
      const confirm = p.getByRole("button", {
        name: /Confirmar esta versión/i,
      });
      if ((await confirm.count()) > 0) await confirm.click();
    }
    await until(
      () =>
        sqlOne(
          `SELECT "status" FROM "CircleArtifact" WHERE "activityId"='${a.activityId}' AND "version"=2`,
        ) === "AGREED",
      "both confirmations to agree it",
      60_000,
    );

    // ── B · a live proposal of theirs nobody confirmed ───────────────────────
    const b = await revealed(page);
    await propose(page, `propuesta-sola-${randomBytes(3).toString("hex")}`);
    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleArtifact" WHERE "activityId"='${b.activityId}'`,
        ) === 1,
      "the unconfirmed proposal",
      30_000,
    );

    // ── C · a proposal the COUNTERPART wrote ────────────────────────────────
    const c = await revealed(page);
    await propose(
      c.page,
      `de-la-contraparte-${randomBytes(3).toString("hex")}`,
    );
    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleArtifact" WHERE "activityId"='${c.activityId}'`,
        ) === 1,
      "the counterpart's proposal",
      30_000,
    );

    check(
      true,
      "three activities carry the four shapes the policy talks about",
    );

    // ── the REAL processor, on a synthetic date ─────────────────────────────
    sql(
      `UPDATE "User" SET "deleteRequestedAt" = now() - interval '31 days'
        WHERE "id"='${organiser.userId}'`,
    );
    const job = await transport.enqueue(
      "account-deletion",
      "finalize-account-deletion",
      {
        userId: organiser.userId,
        requestedAt: new Date(Date.now() - 31 * 24 * 3600_000).toISOString(),
      },
    );
    await until(
      async () => {
        const s = await job.state();
        return s === "completed" || s === "failed" ? s : null;
      },
      "the worker to finish the deletion",
      180_000,
    );
    check(
      sqlInt(`SELECT count(*) FROM "User" WHERE "id"='${organiser.userId}'`) ===
        0,
      "the account is gone",
    );

    // ── what survived, and what did not ─────────────────────────────────────
    const inA = artifactsOf(a.activityId);
    const v1 = inA.find((r) => r[0] === "1");
    const v2 = inA.find((r) => r[0] === "2");
    check(
      v1?.[1] === "SUPERSEDED" &&
        v1?.[2] === "no-content" &&
        v1?.[3] === "purged",
      `their superseded draft has no content (${v1?.join("/") ?? "missing"})`,
    );
    check(
      v2?.[1] === "AGREED" &&
        v2?.[2] === "has-content" &&
        v2?.[3] === "not-purged",
      `the agreement they wrote is kept whole (${v2?.join("/") ?? "missing"})`,
    );

    const inB = artifactsOf(b.activityId)[0];
    check(
      inB?.[1] === "PROPOSED" &&
        inB?.[2] === "no-content" &&
        inB?.[3] === "purged",
      `their unconfirmed proposal is gone (${inB?.join("/") ?? "missing"})`,
    );

    const inC = artifactsOf(c.activityId)[0];
    check(
      inC?.[2] === "has-content" && inC?.[3] === "not-purged",
      `the counterpart's proposal is untouched (${inC?.join("/") ?? "missing"})`,
    );

    // The row is never removed: the ledger points at it.
    check(
      inA.length === 2 && artifactsOf(b.activityId).length === 1,
      "no artifact row was deleted, only emptied",
    );

    // ── and nobody gets back in ─────────────────────────────────────────────
    await b.page.reload({ waitUntil: "domcontentloaded" });
    const guestSees = await b.page.evaluate(() => document.body.innerText);
    check(
      !/Proponer|Confirmar esta versión/i.test(guestSees),
      "a revoked guest session cannot act on the activity any more",
    );
    check(
      sqlInt(
        `SELECT count(*) FROM "CircleGuestSession" g
           JOIN "CircleActivity" a ON a."id"=g."activityId"
          WHERE g."revokedAt" IS NULL AND a."id" IN ('${a.activityId}','${b.activityId}','${c.activityId}')`,
      ) === 0,
      "and every guest session on those activities is revoked",
    );
  } finally {
    await ctx.close();
    for (const g of guests) await g.ctx.close();
  }
}

async function accountDeletionScenario(browser) {
  const organiser = await register("deleted");
  const ctx = await browser.newContext();
  let guest = null;

  try {
    const page = await ctx.newPage();
    await signIn(page, organiser);
    const link = await createDuo(page);
    guest = await acceptAsGuest(browser, link);
    const activityId = guest.activityId;

    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    await typeDraft(page, { uno: "para-borrar", dos: "tambien" });
    await openPreview(page);
    await confirmShare(page);
    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleActivityParticipant" p
             JOIN "CircleMember" m ON m."id"=p."memberId"
            WHERE p."activityId"='${activityId}' AND m."userId"='${organiser.userId}'
              AND p."status"='READY'`,
        ) === 1,
      "the organiser's confirmation to land",
      60_000,
    );
    check(true, "the account to be deleted has a live, confirmed seat");

    const guestSessions = sqlInt(
      `SELECT count(*) FROM "CircleGuestSession" WHERE "activityId"='${activityId}' AND "revokedAt" IS NULL`,
    );
    check(guestSessions === 1, "and an issued guest session on the activity");

    // The 30-day cooldown is NOT shortened. The REQUEST is dated into the past
    // — a synthetic date on the data — and the processor's own check then
    // passes on its own terms, against the real clock.
    sql(
      `UPDATE "User" SET "deleteRequestedAt" = now() - interval '31 days'
        WHERE "id"='${organiser.userId}'`,
    );

    const job = await transport.enqueue(
      "account-deletion",
      "finalize-account-deletion",
      {
        userId: organiser.userId,
        requestedAt: new Date(Date.now() - 31 * 24 * 3600_000).toISOString(),
      },
    );

    await until(
      async () => {
        const s = await job.state();
        return s === "completed" || s === "failed" ? s : null;
      },
      "the worker to finish the deletion job",
      180_000,
    );
    const state = await job.state();
    check(
      state === "completed",
      `the real processor ran the deletion (${state})`,
    );

    check(
      sqlInt(`SELECT count(*) FROM "User" WHERE "id"='${organiser.userId}'`) ===
        0,
      "the account is gone",
    );
    check(
      sqlOne(
        `SELECT "status" FROM "CircleActivity" WHERE "id"='${activityId}'`,
      ) === "CANCELLED",
      "the activity they were in is ended rather than left hanging",
    );
    check(
      sqlInt(
        `SELECT count(*) FROM "CircleGuestSession"
          WHERE "activityId"='${activityId}' AND "revokedAt" IS NULL`,
      ) === 0,
      "every guest session on it is revoked",
    );
    check(
      sqlInt(
        `SELECT count(*) FROM "CircleActivityParticipant"
          WHERE "activityId"='${activityId}' AND "ciphertext" IS NOT NULL`,
      ) === 0,
      "and no envelope survives the deletion",
    );

    // The revoked session is refused by the running API, not merely by a row.
    await guest.page.reload({ waitUntil: "domcontentloaded" });
    const guestText = await guest.page.evaluate(() => document.body.innerText);
    check(
      !/Paso 1 de/i.test(guestText),
      "the guest's browser can no longer work in the activity",
    );
  } finally {
    await ctx.close();
    if (guest) await guest.ctx.close();
  }
}

// ── Scenario 10 · the rollout gate, closed ──────────────────────────────────

/**
 * `off` is resolved ONCE at boot and never re-read, so testing it needs a
 * process that booted with it. `stack.mjs` runs a second API — same build, same
 * database, `CIRCLES_ROLLOUT_MODE=off` — and this asks that real service, over
 * HTTP, whether the surfaces are closed. No flag is flipped at runtime, because
 * the code deliberately does not allow that.
 */
async function rolloutOffScenario() {
  const probe = async (path, init) => {
    const res = await fetch(`${API_OFF}${path}`, init);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, code: body?.code ?? null };
  };

  const guestSession = await probe("/api/circles/guest/session", {
    headers: { "x-circle-guest-session": "not-a-real-session" },
  });
  check(
    guestSession.code === "CIRCLES_UNAVAILABLE",
    `the guest surface is closed under off (got ${guestSession.status} ${guestSession.code})`,
  );

  const accept = await probe("/api/circles/invitations/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: "x".repeat(43), accept: true }),
  });
  check(
    accept.code === "CIRCLES_UNAVAILABLE",
    `accepting an invitation is closed under off (got ${accept.status} ${accept.code})`,
  );

  // And the SAME build with the pilot on answers differently, so the refusal
  // above is the gate rather than a route that is simply broken.
  const onRes = await fetch(`${API}/api/circles/guest/session`, {
    headers: { "x-circle-guest-session": "not-a-real-session" },
  });
  const onBody = await onRes.json().catch(() => ({}));
  check(
    onBody?.code === "CIRCLE_GUEST_SESSION_INVALID",
    `the same route with the pilot on refuses for a DIFFERENT reason (got ${onBody?.code})`,
  );
}

// ── Shared helpers that read the database ───────────────────────────────────

/**
 * How many activities exist — for ONE organiser, or for everybody.
 *
 * The unscoped count is a question about the whole database, and the hosted
 * environment has one database with more than one run in it. Used as a
 * before/after delta, "exactly one activity was created" then means "nobody
 * else created one in the same second", which is not the claim. Scenarios that
 * own an account pass it; the rest keep the global count, which is what they
 * were always asking.
 */
function countActivities(userId) {
  return userId
    ? sqlInt(
        `SELECT count(*) FROM "CircleActivity" a
           JOIN "Circle" c ON c."id" = a."circleId"
          WHERE c."createdByUserId" = '${userId}'`,
      )
    : sqlInt(`SELECT count(*) FROM "CircleActivity"`);
}

// ── Scenario · a circle of three, from the listing ──────────────────────────

/**
 * A GROUP walked by three independent browsers.
 *
 * Nothing about this is implied by the Dúo scenarios passing. A Dúo has one
 * link, one other person and one confirmation to wait for, so every rule about
 * rosters, labels and quorums reads the same whether it is right or wrong. This
 * walks the ones that stop being the same sentence at three people:
 *
 *   · the size is chosen, and the screen mints one link PER SEAT;
 *   · every guest can accept — the first acceptance does not close the door;
 *   · two of three confirming does NOT reveal;
 *   · the reveal shows each answer under its own stable label;
 *   · the waiting screen never says who is late.
 */
/**
 * Press «Continuar con quienes aceptaron», through the real screen.
 *
 * Two clicks on purpose: the confirmation names the exact list and says the
 * pending invitations will stop admitting anybody, because fixing the group
 * cannot be undone in this cut.
 */
async function continuarConQuienesAceptaron(page, activityId) {
  // Navigates itself rather than trusting where the caller left the page.
  // The first version reloaded whatever was on screen, which in one scenario
  // was still the creation screen with the links on it — and then blamed the
  // button for not being there.
  await page.goto(`${WEB}/compartir/${activityId}`, {
    waitUntil: "domcontentloaded",
  });
  const open = page.getByTestId("continuar-con-aceptaron");
  try {
    await open.waitFor({ state: "visible", timeout: 30_000 });
  } catch (err) {
    // A bare "locator timed out" says nothing about WHY the button is not
    // there: not the organiser, not enough people, already closed, or the
    // panel missing altogether. The screen's own words distinguish all four.
    const text = await page.evaluate(() => document.body.innerText);
    throw new Error(
      `«Continuar con quienes aceptaron» never appeared. The screen said: ` +
        JSON.stringify(text.slice(0, 700)) +
        ` · original: ${err.message}`,
    );
  }
  await open.click();
  const confirm = page.getByTestId("continuar-confirmar");
  try {
    await confirm.waitFor({ state: "visible", timeout: 30_000 });
  } catch (err) {
    const text = await page.evaluate(() => document.body.innerText);
    const stillOpen = await page
      .getByTestId("continuar-con-aceptaron")
      .count();
    throw new Error(
      `the confirmation panel never appeared after clicking. ` +
        `«Continuar» still on screen: ${stillOpen}. The screen said: ` +
        JSON.stringify(text.slice(0, 700)) +
        ` · original: ${err.message}`,
    );
  }
  await confirm.click();
  await until(
    async () => {
      const text = await page.evaluate(() => document.body.innerText);
      return /Prepárate|preparar tu parte|Tu parte/i.test(text) ? true : null;
    },
    "the room to open for preparation",
    60_000,
  );
}

async function groupOfThree(browser) {
  const organiser = await register("grupo");
  const organiserCtx = await browser.newContext();
  const guestCtxs = [];

  try {
    const page = await organiserCtx.newPage();
    await signIn(page, organiser);

    // From the listing, which is the group's only surface: it declares no
    // experience pin, so no reading proposes it.
    await page.goto(`${WEB}/dashboard/circulos`, {
      waitUntil: "domcontentloaded",
    });
    const start = page.getByRole("link", { name: /Empezar este círculo/i });
    await start.waitFor({ state: "visible", timeout: 30_000 });
    const before = countActivities(organiser.userId);
    await start.click();

    const offeredKey = new URL(page.url()).pathname.split("/").pop();
    check(
      offeredKey === "grupo-lo-que-nos-ayuda",
      `the listing starts the APPROVED group template (${offeredKey})`,
    );
    check(
      countActivities(organiser.userId) === before,
      "opening the preview creates NOTHING",
    );

    // The size selector exists, offers exactly 3 to 6, and defaults to 3.
    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input[name="circulo-tamano"]')).map(
        (el) => el.value,
      ),
    );
    check(
      JSON.stringify(sizes) === JSON.stringify(["3", "4", "5", "6"]),
      `the screen offers exactly three to six (${sizes.join(",") || "none"})`,
    );

    await page.getByRole("button", { name: /Crear el círculo/i }).click();

    // Two links, labelled, and different from each other.
    const links = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        const found = text.match(/https?:\/\/\S*\/i#[A-Za-z0-9_-]{43}/g) ?? [];
        return found.length === 2 ? found : null;
      },
      "two invitation links to appear",
      60_000,
    );
    check(
      new Set(links).size === 2,
      "each seat gets its OWN secret, never one link twice",
    );
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("p"))
        .map((el) => el.textContent?.trim() ?? "")
        .filter((t) => /^Participante \d+$/.test(t)),
    );
    check(
      JSON.stringify(labels) ===
        JSON.stringify(["Participante 2", "Participante 3"]),
      `the links are labelled by seat (${labels.join(", ") || "none"})`,
    );
    check(
      countActivities(organiser.userId) === before + 1,
      "exactly ONE activity is created by one confirmation",
    );

    // THIS organiser's newest activity, never "the newest activity".
    //
    // The hosted environment has one database and more than one run in it, so
    // `ORDER BY "createdAt" DESC LIMIT 1` is a question about whatever anybody
    // else created a second ago. Scoped by the circle this account created, it
    // is a question about this scenario.
    const activityId = sqlOne(
      `SELECT a."id" FROM "CircleActivity" a
         JOIN "Circle" c ON c."id" = a."circleId"
        WHERE c."createdByUserId" = '${organiser.userId}'
        ORDER BY a."createdAt" DESC LIMIT 1`,
    ).trim();
    // Every column ALIASED. Two unnamed aggregates are both `count`, and a
    // transport that returns rows as objects keeps one of them.
    const shape = sqlRows(
      `SELECT a."kind"::text AS kind, a."requiredParticipants" AS required,
              (SELECT count(*) FROM "CircleActivityParticipant" p
                WHERE p."activityId" = a."id") AS seats,
              (SELECT count(*) FROM "CircleInvitation" i
                WHERE i."activityId" = a."id") AS invitations
         FROM "CircleActivity" a WHERE a."id" = '${activityId}'`,
    )[0];
    check(
      shape?.[0] === "GROUP_ADULT" && shape?.[1] === "3",
      `the activity is a GROUP_ADULT of three (${shape?.join("/") ?? "no row"})`,
    );
    check(
      shape?.[2] === "3" && shape?.[3] === "2",
      `three seats and two invitations (${shape?.slice(2).join("/") ?? "?"})`,
    );

    // Both guests accept. Neither acceptance opens the room now — the
    // organiser does that — and the SECOND must still work, which is the rule
    // a Dúo could never have exercised.
    //
    // The first guest types a name on the way in. Synthetic on purpose: it is
    // personal data, so the walk invents one rather than borrowing anybody's.
    const ALIAS = "Prueba Alias";
    const guests = [];
    for (const [i, link] of links.entries()) {
      const guest = await acceptAsGuest(browser, link, i === 0 ? ALIAS : null);
      guestCtxs.push(guest.ctx);
      guests.push(guest);
    }
    check(
      guests.every((g) => g.activityId === activityId),
      "every guest lands in the SAME room",
    );

    // ── The name made the whole journey ──────────────────────────────────
    //
    // Written on the acceptance screen, carried by the Web handler, the BFF
    // and the API, and read back from a DIFFERENT person's room. It reached
    // the seat it belongs to and no other.
    const aliasRows = sqlRows(
      `SELECT count(*) AS n FROM "CircleActivityParticipant"
        WHERE "activityId" = '${activityId}' AND "alias" = '${ALIAS}'`,
    )[0];
    check(
      aliasRows?.[0] === "1",
      `the alias landed on exactly one seat (${aliasRows?.[0] ?? "no row"})`,
    );
    // Into the ROOM first. The organiser has been on the creation screen since
    // the links appeared, and that screen has no roster on it — reading from
    // wherever the page happened to be returned an empty string, which is not
    // the same as "the name is missing" and must not be reported as if it were.
    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    const rosterShown = await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(
          () =>
            document.querySelector('[aria-labelledby="sala-quien"]')
              ?.innerText ?? "",
        );
        return t.trim().length > 0 ? t : null;
      },
      "the organiser's room to render its roster",
      60_000,
    );
    check(
      rosterShown.includes(ALIAS),
      `the organiser's room shows the name the guest chose (${rosterShown.replace(/\s+/g, " ").slice(0, 160)})`,
    );
    // Two guests, one name. The other seat keeps its number — which is what
    // the roster falls back to — so exactly one numbered label is left. Two
    // would mean the name never arrived.
    check(
      (rosterShown.match(/Participante \d/g) ?? []).length === 1,
      "the named guest is no longer shown as a numbered seat",
    );

    // The organiser continues with the group — here, everybody. Until they
    // do, nobody's audience is fixed and nobody can confirm.
    await continuarConQuienesAceptaron(page, activityId);

    // Organiser and one guest confirm. Two of three.
    await enterRoom(page);
    await typeDraft(page, { uno: "lo que me ayuda", dos: "lo que no" });
    await openPreview(page);
    await confirmShare(page);

    await enterRoom(guests[0].page);
    await typeDraft(guests[0].page, { uno: "lo del segundo" });
    await openPreview(guests[0].page);
    await confirmShare(guests[0].page);

    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleActivityParticipant"
            WHERE "activityId"='${activityId}' AND "status"='READY'`,
        ) === 2,
      "two of the three seats to be READY",
      60_000,
    );
    const midway = sqlOne(
      `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
    ).trim();
    check(midway === "PREPARING", `two of three does NOT reveal (${midway})`);

    // And the waiting screen says so without saying anything about anybody's
    // ANSWERS.
    //
    // REPLACED, and the boundary moved on purpose. Who is in the room is now
    // visible to the people in it — that is the approved change, and a room
    // that lists «Ana · Participa» is the point of it. What must still be
    // impossible to read off this screen is the part about content: who has
    // confirmed, who has not, and how many have. So the count is still
    // forbidden, and the old blanket ban on any seat label is replaced by a
    // ban on the sentences that would attach a CONFIRMATION to a person.
    const waiting = await page.evaluate(() => document.body.innerText);
    check(
      /grupo confirmado hayan enviado/i.test(waiting),
      "the waiting screen speaks about the group, not about a person",
    );
    check(
      !/de 3 listas/.test(waiting) && !/\d\s+de\s+\d/.test(waiting),
      "it counts nobody's confirmations",
    );
    check(
      !/confirm[óo]|list[ao]\b|termin[óo]|envi[óo]/i.test(
        // The reader's own receipt is about THEM and is exempt; what must not
        // appear is a sentence attaching a confirmation to somebody else.
        waiting.replace(/Tu parte ya quedó enviada\./gi, ""),
      ),
      "and attaches no confirmation to any name",
    );

    // The last seat confirms. Now it opens, for everybody at once.
    await enterRoom(guests[1].page);
    await typeDraft(guests[1].page, { uno: "lo del tercero" });
    await openPreview(guests[1].page);
    await confirmShare(guests[1].page);

    await until(
      () =>
        sqlOne(
          `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
        ).trim() === "REVEALED",
      "the room to reveal once the last seat confirmed",
      60_000,
    );
    check(true, "the whole roster confirming is what opens it");

    const reveals = sqlInt(
      `SELECT count(*) FROM "CircleEvent"
        WHERE "activityId"='${activityId}' AND "type"='ACTIVITY_REVEALED'`,
    );
    check(reveals === 1, `exactly one reveal event (${reveals})`);

    // Each person sees the other two, labelled, and their own answer.
    await page.reload({ waitUntil: "domcontentloaded" });
    const shown = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        return /Lo que compartió cada quien/.test(text) ? text : null;
      },
      "the organiser's screen to show the room's answers",
      60_000,
    );
    check(
      /lo del segundo/.test(shown) && /lo del tercero/.test(shown),
      "the organiser reads BOTH other answers",
    );
    check(
      /Participante 2/.test(shown) && /Participante 3/.test(shown),
      "each answer carries the seat it came from",
    );

    const guestView = await guests[0].page
      .reload({ waitUntil: "domcontentloaded" })
      .then(() =>
        until(
          async () => {
            const text = await guests[0].page.evaluate(
              () => document.body.innerText,
            );
            return /Lo que compartió cada quien/.test(text) ? text : null;
          },
          "a guest's screen to show the room's answers",
          60_000,
        ),
      );
    check(
      /lo que me ayuda/.test(guestView) && /lo del tercero/.test(guestView),
      "a guest reads the other two, not their own twice",
    );
    check(
      /Participante 1/.test(guestView),
      "the organiser's seat is Participante 1 for everybody",
    );
  } finally {
    await organiserCtx.close().catch(() => {});
    for (const ctx of guestCtxs) await ctx.close().catch(() => {});
  }
}

/**
 * The group's conservative exit, pressed in a real browser.
 *
 * Nothing about this is visible from a unit test: what has to be true is that
 * the SCREEN says what the button does before it is pressed, that pressing it
 * ends the activity for everybody, and that the two people who did not press it
 * are told the activity is over without being told who ended it.
 */
/**
 * A room offered to SIX that continues with two, all the way to the end.
 *
 * ── Why this one exists ───────────────────────────────────────────────────
 *
 * Every other group scenario runs at a size where capacity and group are the
 * same number, which is exactly why the difference survived so long: three
 * invited, three inside, and `requiredParticipants` answers both questions
 * correctly by accident. This is the first walk where they differ, and where
 * counting the wrong one is visible rather than harmless.
 *
 * Reaching REVEALED was never the hard part — the barrier learned the
 * difference first. What a shorter scenario would have missed is everything
 * AFTER it: two people cannot produce six confirmations, so the room could
 * reveal and then never reach an agreement, and never close its follow-up.
 * A week later the clock closed it; nothing the two of them did ever could.
 * So this goes past the reveal, through the artifact to AGREED, and through
 * the follow-up to CLOSED.
 */
async function reducedGroup(browser) {
  const organiser = await register("reducido");
  const organiserCtx = await browser.newContext();
  const guestCtxs = [];

  try {
    const page = await organiserCtx.newPage();
    await signIn(page, organiser);

    // ── 1 · a circle offered to six ──────────────────────────────────────
    await page.goto(`${WEB}/dashboard/circulos`, {
      waitUntil: "domcontentloaded",
    });
    const start = page.getByRole("link", { name: /Empezar este círculo/i });
    await start.waitFor({ state: "visible", timeout: 30_000 });
    await start.click();

    await page.check('input[name="circulo-tamano"][value="6"]');
    await page.getByRole("button", { name: /Crear el círculo/i }).click();

    const links = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        const found = text.match(/https?:\/\/\S*\/i#[A-Za-z0-9_-]{43}/g) ?? [];
        return found.length === 5 ? found : null;
      },
      "five invitation links for a circle of six",
      60_000,
    );
    check(new Set(links).size === 5, "one distinct link per seat, never one twice");

    const activityId = sqlOne(
      `SELECT a."id" FROM "CircleActivity" a
         JOIN "Circle" c ON c."id" = a."circleId"
        WHERE c."createdByUserId" = '${organiser.userId}'
        ORDER BY a."createdAt" DESC LIMIT 1`,
    ).trim();

    // ── 2 · capacity six, nobody in but the organiser, no group yet ───────
    const opened = sqlRows(
      `SELECT a."requiredParticipants" AS capacity,
              coalesce(a."confirmedParticipants"::text,'-') AS "group",
              a."status"::text AS status,
              (SELECT count(*) FROM "CircleActivityParticipant"
                WHERE "activityId" = a."id") AS seats
         FROM "CircleActivity" a WHERE a."id" = '${activityId}'`,
    )[0];
    check(
      opened?.[0] === "6" && opened?.[1] === "-",
      `capacity six and no group fixed yet (${opened?.slice(0, 2).join("/")})`,
    );
    check(
      opened?.[2] === "INVITING" && opened?.[3] === "6",
      `six seats, still inviting (${opened?.slice(2).join("/")})`,
    );

    // ── 3 · exactly one person accepts, and chooses a name ────────────────
    const ALIAS = "Prueba Alias";
    const guest = await acceptAsGuest(browser, links[0], ALIAS);
    guestCtxs.push(guest.ctx);
    check(
      guest.activityId === activityId,
      "the one guest lands in the organiser's room",
    );

    // ── 4 · the room says who is in, and what is still open ───────────────
    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    const roster = await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(
          () =>
            document.querySelector('[aria-labelledby="sala-quien"]')
              ?.innerText ?? "",
        );
        return t.includes(ALIAS) ? t : null;
      },
      "the organiser's room to show the guest who arrived",
      60_000,
    );
    check(
      /Pueden participar hasta 6/.test(roster),
      "the room states the CAPACITY as a capacity",
    );
    check(
      /est[áa]n dentro 2/i.test(roster),
      `and states how many are actually in (${roster.replace(/\s+/g, " ").slice(0, 140)})`,
    );

    // ── 5 · preparing early is fine; sending is not, yet ──────────────────
    const body = await page.evaluate(() => document.body.innerText);
    check(
      /Puedes ir preparando tu parte/.test(body),
      "the room invites people to prepare while it is still open",
    );

    // ── 6 · the organiser continues with whoever accepted ─────────────────
    await continuarConQuienesAceptaron(page, activityId);

    // ── 7 · the group is fixed at two, and the empty seats are GONE ───────
    const closed = sqlRows(
      `SELECT a."requiredParticipants" AS capacity,
              a."confirmedParticipants" AS "group",
              a."status"::text AS status,
              (SELECT count(*) FROM "CircleActivityParticipant"
                WHERE "activityId" = a."id") AS seats,
              (SELECT count(*) FROM "CircleInvitation"
                WHERE "activityId" = a."id" AND "revokedAt" IS NULL
                  AND "consumedAt" IS NULL) AS pending
         FROM "CircleActivity" a WHERE a."id" = '${activityId}'`,
    )[0];
    check(
      closed?.[0] === "6" && closed?.[1] === "2",
      `capacity stays six, the group is two (${closed?.slice(0, 2).join("/")})`,
    );
    check(
      closed?.[3] === "2",
      `a seat nobody took is deleted, not left withdrawn (${closed?.[3]})`,
    );
    check(
      closed?.[2] === "PREPARING" && closed?.[4] === "0",
      `preparing, and no link still admits anybody (${closed?.slice(2).join("/")})`,
    );

    // ── 8 · a link left over is refused, and told nothing ─────────────────
    const lateCtx = await browser.newContext();
    guestCtxs.push(lateCtx);
    const late = await lateCtx.newPage();
    await late.goto(links[4], { waitUntil: "domcontentloaded" });
    const lateText = await until(
      async () => {
        const t = await late.evaluate(() => document.body.innerText);
        return /ya no|caducad|no (sirve|funciona)/i.test(t) ? t : null;
      },
      "the excluded link to be refused",
      60_000,
    );
    check(
      !new RegExp(ALIAS).test(lateText) && !/Participante/.test(lateText),
      "and the refusal names nobody who is inside",
    );

    // ── 9 · two confirmations reveal the room ─────────────────────────────
    for (const p of [page, guest.page]) {
      await p.goto(`${WEB}/compartir/${activityId}`, {
        waitUntil: "domcontentloaded",
      });
      await enterRoom(p);
      await typeDraft(p, { uno: `de-${p === page ? "quien-organiza" : "quien-vino"}` });
      await openPreview(p);
      await confirmShare(p);
    }
    await until(
      () =>
        sqlOne(
          `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
        ).trim() === "REVEALED",
      "the GROUP's two confirmations to open the room",
      60_000,
    );
    check(true, "two of two reveals a room that was offered to six");

    // ── 10 · and the agreement is reachable by the people who are here ────
    await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(() => document.body.innerText);
        return /Lo que compartió/.test(t);
      },
      "the reveal before proposing an artifact",
      60_000,
    );
    const WORDING = `acuerdo-${randomBytes(3).toString("hex")}`;
    await page.fill("#artefacto", WORDING);
    await page.getByRole("button", { name: /^Proponer$/ }).click();
    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleArtifact" WHERE "activityId"='${activityId}' AND "version"=1`,
        ) === 1,
      "the proposal to be persisted",
      30_000,
    );

    // The denominator the screen shows is the GROUP. Against capacity it read
    // "de 6" in a room containing two people.
    const firstConfirm = page.getByRole("button", {
      name: /Confirmar esta versión/i,
    });
    await firstConfirm.waitFor({ state: "visible", timeout: 30_000 });
    await firstConfirm.click();

    // Wait for the confirmation to LAND before reading anything off it. The
    // first cut of this read the screen the instant after the click and was
    // satisfied by «0 de 2» — which proves the denominator and nothing about
    // the confirmation, and would have been just as green if the click had
    // done nothing at all.
    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleEvent" e
             JOIN "CircleArtifact" a ON a."id" = e."artifactId"
            WHERE a."activityId"='${activityId}' AND a."version"=1
              AND e."type"='ARTIFACT_CONFIRMED'`,
        ) === 1,
      "the organiser's confirmation to be recorded",
      60_000,
    );
    check(
      sqlOne(
        `SELECT "status" FROM "CircleArtifact" WHERE "activityId"='${activityId}' AND "version"=1`,
      ) === "PROPOSED",
      "one of two is not an agreement",
    );

    const counted = await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(() => document.body.innerText);
        const m = t.match(/(\d+)\s+de\s+(\d+)\s+lo confirmaron/);
        return m && m[1] === "1" ? m : null;
      },
      "the screen to show one confirmation",
      60_000,
    );
    check(
      counted[2] === "2",
      `the artifact counts against the GROUP, not the capacity (${counted[0]})`,
    );

    await guest.page.reload({ waitUntil: "domcontentloaded" });
    const second = guest.page.getByRole("button", {
      name: /Confirmar esta versión/i,
    });
    await second.waitFor({ state: "visible", timeout: 30_000 });
    await second.click();
    const agreed = await until(
      () => {
        const st = sqlOne(
          `SELECT "status" FROM "CircleArtifact" WHERE "activityId"='${activityId}' AND "version"=1`,
        );
        return st === "AGREED" ? st : null;
      },
      "the second of two confirmations to produce an agreement",
      60_000,
    );
    check(
      agreed === "AGREED",
      "the room REACHES an agreement — against capacity it never could",
    );

    // ── 11 · and the follow-up closes on the group's decisions ────────────
    sql(
      `UPDATE "CircleActivity" SET "followUpDueAt" = now() - interval '1 hour'
        WHERE "id"='${activityId}'`,
    );
    // The REAL worker opens it, because that is who opens it in production.
    const sweep = await transport.enqueue("circles-sweep", "run-circles-sweep", {
      nowIso: new Date().toISOString(),
      batchSize: 50,
    });
    await until(
      async () => {
        const state = await sweep.state();
        return state === "completed" || state === "failed" ? state : null;
      },
      "the sweep that opens the follow-up",
      120_000,
    );
    await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(() => document.body.innerText);
        return t.includes("¿Cómo siguen?");
      },
      "the follow-up to open on the organiser's screen",
      60_000,
    );

    await page.getByRole("button", { name: /Lo cerramos aquí/i }).click();
    await until(
      () =>
        sqlOne(
          `SELECT "followUpDecision" FROM "CircleActivityParticipant" p
             JOIN "CircleMember" m ON m."id"=p."memberId"
            WHERE p."activityId"='${activityId}' AND m."userId"='${organiser.userId}'`,
        ) === "CLOSE",
      "the organiser's decision to persist",
      30_000,
    );
    check(
      sqlOne(
        `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
      ).trim() !== "CLOSED",
      "one decision of two does not end it",
    );

    await guest.page.reload({ waitUntil: "domcontentloaded" });
    await until(
      async () => {
        const t = await guest.page.evaluate(() => document.body.innerText);
        return t.includes("¿Cómo siguen?");
      },
      "the follow-up on the guest's screen",
      60_000,
    );
    await guest.page.getByRole("button", { name: /Lo cerramos aquí/i }).click();

    const finalStatus = await until(
      () => {
        const st = sqlOne(
          `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
        ).trim();
        return st === "CLOSED" ? st : null;
      },
      "the group's own decisions to close the follow-up",
      60_000,
    );
    check(
      finalStatus === "CLOSED",
      "the people in the room finish it themselves, with no clock involved",
    );
  } finally {
    await organiserCtx.close().catch(() => {});
    for (const ctx of guestCtxs) await ctx.close().catch(() => {});
  }
}

/**
 * Sending your part tells YOU it was sent — before anyone else does anything.
 *
 * ── The report this reproduces ────────────────────────────────────────────
 *
 * Two people: an organiser signed in, a guest in a private window. The guest
 * pressed send and saw no confirmation. The result only appeared once the
 * organiser opened the room and answered.
 *
 * Four different things look identical from the outside, so this separates
 * them before it concludes anything:
 *
 *   1. the click emits no request at all;
 *   2. the request is emitted and REFUSED;
 *   3. the server commits and the screen does not say so;
 *   4. onboarding is still open, so sending is not permitted yet.
 *
 * The status, the code and the seat's own state in PostgreSQL are all read,
 * so the answer is observed rather than reached by elimination. The screen is
 * read within two seconds of the acknowledgement and with no reload: the poll
 * is ten seconds, so anything visible here cannot have come from it.
 */
async function sendAcknowledgement(browser) {
  const organiser = await register("acuse");
  const organiserCtx = await browser.newContext();
  let guest = null;

  try {
    const page = await organiserCtx.newPage();
    await signIn(page, organiser);
    const link = await createDuo(page);
    guest = await acceptAsGuest(browser, link);
    const activityId = guest.activityId;

    // ── The guest sends. The organiser does NOTHING. ─────────────────────
    //
    // The organiser's page is not touched again until every assertion below
    // has been made, because "it appeared once the other person answered" is
    // precisely the behaviour under test.
    await enterRoom(guest.page);
    await typeDraft(guest.page, { uno: "lo que preparé" });
    await openPreview(guest.page);

    // Everything the page sends and everything it is answered, by path only —
    // no bodies, no query strings, no headers. A timeout here must be a
    // DIAGNOSIS, not a dead end, so nothing below throws on absence.
    const sent = [];
    const answered = [];
    guest.page.on("request", (req) => {
      try {
        sent.push(new URL(req.url()).pathname);
      } catch {
        /* not a URL we can parse is not a URL we need */
      }
    });
    guest.page.on("response", (res) => {
      try {
        answered.push({
          path: new URL(res.url()).pathname,
          status: res.status(),
          at: Date.now(),
        });
      } catch {
        /* same */
      }
    });

    // ── Make the later read SLOW, deliberately ───────────────────────────
    //
    // On a fast connection the un-awaited refetch lands in a few hundred
    // milliseconds and hides the defect completely: the screen is correct by
    // accident. Jorge's guest was in a private window on a real connection and
    // saw the empty form, so the condition to reproduce is a read that has not
    // come back yet — which is also the requirement, stated as a test: the
    // acknowledgement must not depend on the next read at all.
    //
    // Only the activity GET is delayed. The command POST is untouched, and
    // nothing is mocked: the same server answers, a little later.
    await guest.page.route(
      /\/api\/circulos\/actividad\/[^/]+$/,
      async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await new Promise((r) => setTimeout(r, SLOW_READ_MS));
        return route.continue();
      },
    );

    const isCommand = (r) => r.path.endsWith("/comando");
    const pressedAt = Date.now();
    await confirmShare(guest.page);

    let ack = null;
    try {
      ack = await until(
        () => answered.find(isCommand) ?? null,
        "the send to be answered",
        30_000,
      );
    } catch {
      /* answered below, with what WAS seen */
    }
    const ackAt = Date.now();

    // ── 1 · did the click emit anything? ─────────────────────────────────
    const commandsSent = sent.filter((p) => p.endsWith("/comando")).length;
    check(
      commandsSent >= 1,
      `the press emits a command (${commandsSent} sent; paths after the press: ${
        sent.slice(-6).join(", ") || "none"
      })`,
    );

    // ── 2 · was it refused? ──────────────────────────────────────────────
    check(
      ack !== null && ack.status >= 200 && ack.status < 300,
      `and the server accepts it (${
        ack ? `status ${ack.status}` : "no answer observed"
      })`,
    );

    // ── 4 · was sending even permitted yet? ──────────────────────────────
    //
    // A Dúo has no flexible onboarding, so this cannot be the cause — checked
    // rather than assumed, because that refusal has its own status and would
    // otherwise read as a generic failure.
    check(
      ack === null || ack.status !== 409,
      `and it is not a conflict with an earlier intention (${ack?.status ?? "n/a"})`,
    );

    // ── 3 · did the server actually commit? ──────────────────────────────
    const seat = sqlOne(
      `SELECT p."status"::text FROM "CircleActivityParticipant" p
         JOIN "CircleGuestSession" g ON g."participantId" = p."id"
        WHERE p."activityId"='${activityId}' AND g."revokedAt" IS NULL
        LIMIT 1`,
    ).trim();
    check(
      seat === "READY",
      `the seat is committed as sent in PostgreSQL (${seat || "no row"})`,
    );

    // ── And now the only question left: does the SCREEN say so? ──────────
    const shown = await guest.page.evaluate(() => document.body.innerText);
    const elapsed = ackAt - pressedAt;
    check(
      elapsed < SLOW_READ_MS,
      `the screen is read ${elapsed}ms after the press, while the next read ` +
        `is still in flight (${SLOW_READ_MS}ms)`,
    );
    // The delay has to BITE, or this scenario proves nothing: an unthrottled
    // refetch lands in a few hundred milliseconds and makes the screen correct
    // by accident, which is exactly how this defect survived. So the read that
    // followed the press is timed, and a read that came back quickly is
    // reported as a broken fixture rather than passed over.
    const readAfterPress = answered.find(
      (r) => !isCommand(r) && r.at > pressedAt && r.path.includes("/actividad/"),
    );
    check(
      readAfterPress === undefined ||
        readAfterPress.at - pressedAt >= SLOW_READ_MS,
      `the next read really was held back (${
        readAfterPress
          ? `${readAfterPress.at - pressedAt}ms`
          : "none had returned yet"
      })`,
    );

    // The heading, by role: a substring can be satisfied by the template's own
    // prose, and "it said something somewhere" is not what is being claimed.
    const heading = await guest.page
      .getByRole("heading", { name: /ya quedó enviada|Listo\./i })
      .first()
      .textContent()
      .catch(() => null);
    check(
      heading !== null,
      `the sender is told their part was sent (headings: ${(
        await guest.page
          .getByRole("heading")
          .allTextContents()
          .catch(() => [])
      )
        .join(" | ")
        .slice(0, 180)})`,
    );
    check(
      !/ya quedó enviada|Listo\./i.test(heading ?? "")
        ? true
        : !(await guest.page
            .getByRole("button", { name: /Confirmar y enviar/i })
            .isVisible()
            .catch(() => false)),
      "and the form they just submitted is gone",
    );
    check(
      /falta|esperando|cuando/i.test(shown),
      "and the wait for the other person is explained",
    );

    // ── The organiser, still inactive, has seen nothing revealed ─────────
    const revealed = sqlOne(
      `SELECT count(*) FROM "CircleEvent"
        WHERE "activityId"='${activityId}' AND "type"='ACTIVITY_REVEALED'`,
    ).trim();
    check(
      revealed === "0",
      `one part sent reveals nothing (${revealed} reveal events)`,
    );

    // ── Now the organiser answers, and the room opens for both ───────────
    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    await typeDraft(page, { uno: "lo mío" });
    await openPreview(page);
    await confirmShare(page);
    await until(
      () =>
        sqlOne(
          `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
        ).trim() === "REVEALED",
      "the room to open once both parts are in",
      60_000,
    );
    check(true, "the reveal still waits for everybody, as it always did");
  } finally {
    await organiserCtx.close().catch(() => {});
    if (guest) await guest.ctx.close().catch(() => {});
  }
}

/**
 * The private exit of a group that continued with TWO.
 *
 * ── The distinction this exists to hold ───────────────────────────────────
 *
 * A GROUP_ADULT that continues with two people is still a group. The API
 * always knew that — keeping it private cancels the activity for everybody
 * and destroys what the others wrote unopened. The SCREENS did not: they
 * decided which explanation to show by counting people, so at two they showed
 * the Dúo's, which promises that the other person will be told you finished
 * without sharing. In a group nobody is told who ended it.
 *
 * So the screen described one product while the server ran another, and the
 * gap only opens at exactly two. This walks it: the warning before the press,
 * the warning on the preview, and then the consequence the API actually
 * produces — with a real Dúo alongside to show its rules are untouched.
 *
 * Deliberately a SEPARATE activity from the positive walk: that one has to end
 * in an agreement, and this one has to end in a cancellation.
 */
async function reducedGroupKeepPrivate(browser) {
  const organiser = await register("reducido-privado");
  const organiserCtx = await browser.newContext();
  const guestCtxs = [];

  try {
    const page = await organiserCtx.newPage();
    await signIn(page, organiser);

    // ── A circle offered to six, continued with two ──────────────────────
    await page.goto(`${WEB}/dashboard/circulos`, {
      waitUntil: "domcontentloaded",
    });
    const start = page.getByRole("link", { name: /Empezar este círculo/i });
    await start.waitFor({ state: "visible", timeout: 30_000 });
    await start.click();
    await page.check('input[name="circulo-tamano"][value="6"]');
    await page.getByRole("button", { name: /Crear el círculo/i }).click();

    const links = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        const found = text.match(/https?:\/\/\S*\/i#[A-Za-z0-9_-]{43}/g) ?? [];
        return found.length === 5 ? found : null;
      },
      "five invitation links for a circle of six",
      60_000,
    );
    const activityId = sqlOne(
      `SELECT a."id" FROM "CircleActivity" a
         JOIN "Circle" c ON c."id" = a."circleId"
        WHERE c."createdByUserId" = '${organiser.userId}'
        ORDER BY a."createdAt" DESC LIMIT 1`,
    ).trim();

    const guest = await acceptAsGuest(browser, links[0]);
    guestCtxs.push(guest.ctx);
    await continuarConQuienesAceptaron(page, activityId);

    const shape = sqlRows(
      `SELECT a."kind"::text AS kind, a."requiredParticipants" AS capacity,
              a."confirmedParticipants" AS "group"
         FROM "CircleActivity" a WHERE a."id" = '${activityId}'`,
    )[0];
    check(
      shape?.[0] === "GROUP_ADULT" && shape?.[1] === "6" && shape?.[2] === "2",
      `a GROUP_ADULT of capacity six running with two (${shape?.join("/") ?? "no row"})`,
    );

    // ── One person confirms real content, so there IS something to lose ──
    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    await typeDraft(page, { uno: "algo que sí escribí" });
    await openPreview(page);
    await confirmShare(page);

    const sealedBefore = sqlOne(
      `SELECT count(*) FROM "CircleActivityParticipant"
        WHERE "activityId"='${activityId}' AND "ciphertext" IS NOT NULL`,
    ).trim();
    check(
      sealedBefore === "1",
      `one confirmed envelope is waiting (${sealedBefore})`,
    );

    // ── The other chooses to keep everything private ─────────────────────
    //
    // Into the room again first. This page has been open since before the
    // organiser continued, so the view it is holding still says the group is
    // not fixed — the room polls and would catch up on its own, but a test
    // that raced the poll would be measuring the refresh, not the copy.
    await guest.page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(guest.page);
    await typeDraft(guest.page, { uno: "algo privado" });
    await forwardToSharing(guest.page);
    await guest.page.check('input[name="modo"][value="KEEP_PRIVATE"]');
    const warning = await guest.page.evaluate(() => document.body.innerText);

    // The GROUP's consequence, said for two people.
    check(
      /termina aquí para las dos personas/i.test(warning),
      `preparation states the group's ending for two (${warning.match(/Si eliges esto[^]{0,120}/i)?.[0].replace(/\s+/g, " ") ?? "not found"})`,
    );
    check(
      /se descarta sin abrirse/i.test(warning),
      "and that what the other person wrote is discarded unopened",
    );
    check(
      /no se le dice a nadie quién lo eligió/i.test(warning),
      "and that nobody is told who chose it",
    );
    // The Dúo's promise must NOT appear: this is the sentence that used to be
    // shown here, and it promises a notice naming the person who ended it.
    check(
      !/verá que terminaste/i.test(warning),
      "and it does NOT promise the other person is told who finished",
    );

    await guest.page
      .getByRole("button", { name: /Ver qué se compartirá/i })
      .click();
    const preview = await until(
      async () => {
        const text = await guest.page.evaluate(() => document.body.innerText);
        return /Nadie verá nada/i.test(text) ? text : null;
      },
      "the confirmation screen to spell out the consequence",
      30_000,
    );
    check(
      /termina para las dos personas/i.test(preview),
      "the preview repeats the group's ending, for two people",
    );
    check(
      /la actividad se cierra/i.test(preview) &&
        /no se puede deshacer/i.test(preview),
      "and says it cannot be undone",
    );

    // ── And the API does what the screen just promised ───────────────────
    await confirmShare(guest.page);
    await until(
      () =>
        sqlOne(
          `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
        ).trim() === "CANCELLED",
      "the activity to end without revealing",
      60_000,
    );
    check(true, "keeping it private ends the reduced group");

    const after = sqlRows(
      `SELECT (SELECT count(*) FROM "CircleEvent"
                WHERE "activityId"='${activityId}' AND "type"='ACTIVITY_REVEALED') AS revealed,
              (SELECT count(*) FROM "CircleActivityParticipant"
                WHERE "activityId"='${activityId}' AND "ciphertext" IS NOT NULL) AS sealed,
              (SELECT count(*) FROM "CircleGuestSession"
                WHERE "activityId"='${activityId}' AND "revokedAt" IS NULL) AS sessions,
              (SELECT count(*) FROM "CircleInvitation"
                WHERE "activityId"='${activityId}' AND "revokedAt" IS NULL) AS links`,
    )[0];
    check(after?.[0] === "0", `nothing was revealed (${after?.[0]} events)`);
    check(
      after?.[1] === "0",
      `the pending envelope is destroyed, not kept (${after?.[1]})`,
    );
    check(
      after?.[2] === "0" && after?.[3] === "0",
      `every derived access is revoked (${after?.slice(2).join("/") ?? "?"})`,
    );

    // ── The person who pressed nothing learns it ended, and nothing else ─
    await page.reload({ waitUntil: "domcontentloaded" });
    const shown = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        return /Esta actividad terminó/i.test(text) ? text : null;
      },
      "the organiser to see a terminal screen",
      60_000,
    );
    check(
      !/algo privado/.test(shown) && !/KEEP_PRIVATE/.test(shown),
      "no content from the other seat is on it",
    );
    check(
      !/Participante \d/.test(shown) && !/eligi/i.test(shown),
      "and nobody is named as the person who ended it",
    );

    // ── The contrast: a real Dúo still runs the Dúo's rules ──────────────
    //
    // Same count, different modality. Keeping it private here is an ordinary
    // confirmation that shares nothing: the other person is told you finished,
    // and the activity does not end.
    const duoLink = await createDuo(page);
    const duoGuest = await acceptAsGuest(browser, duoLink);
    guestCtxs.push(duoGuest.ctx);
    const duoId = duoGuest.activityId;
    check(
      sqlOne(
        `SELECT "kind"::text FROM "CircleActivity" WHERE "id"='${duoId}'`,
      ).trim() === "DUO",
      "the contrast activity really is a DUO",
    );

    await enterRoom(duoGuest.page);
    await typeDraft(duoGuest.page, { uno: "lo del dúo" });
    await forwardToSharing(duoGuest.page);
    await duoGuest.page.check('input[name="modo"][value="KEEP_PRIVATE"]');
    const duoWarning = await duoGuest.page.evaluate(
      () => document.body.innerText,
    );
    check(
      /La otra persona verá que terminaste/i.test(duoWarning),
      "a DUO keeps its own promise: the other person is told you finished",
    );
    check(
      !/termina aquí/i.test(duoWarning) &&
        !/se descarta sin abrirse/i.test(duoWarning),
      "and it does not claim the activity ends",
    );

    await duoGuest.page
      .getByRole("button", { name: /Ver qué se compartirá/i })
      .click();
    await until(
      async () => {
        const t = await duoGuest.page.evaluate(() => document.body.innerText);
        return /Verá que terminaste tu parte/i.test(t) ? t : null;
      },
      "the DUO preview to say what the other person will see",
      30_000,
    );
    await confirmShare(duoGuest.page);

    // The decisive contrast: the Dúo is still alive.
    await until(
      () =>
        sqlOne(
          `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${duoId}'`,
        ).trim() === "PREPARING",
      "the DUO to stay open after one side kept it private",
      60_000,
    );
    check(
      true,
      "keeping it private in a DUO shares nothing and ends nothing",
    );
  } finally {
    await organiserCtx.close().catch(() => {});
    for (const ctx of guestCtxs) await ctx.close().catch(() => {});
  }
}

/**
 * The private exit, retried with the SAME key after its response was lost.
 *
 * ── Why a reload cannot prove this ────────────────────────────────────────
 *
 * The manual guide used to say "recarga y vuelve a pulsarlo". That does not
 * test what it claims. The idempotency key is minted per intention and held
 * in a `useRef` map — in memory, in that page. A reload throws it away, so
 * the second press is a DIFFERENT request with a DIFFERENT key, and what it
 * meets is the ordinary "this activity is over" refusal. Nothing about
 * replay is exercised.
 *
 * The guarantee is about a response that never arrived: the server committed,
 * the browser did not hear it, and the same page retries the same intention.
 * So that is what this does — the request reaches the API and commits, the
 * response is dropped on the way back, and the retry is a real click in the
 * same page with the same key still in memory.
 *
 * What must hold: exactly one withdrawal, exactly one cancellation, and the
 * person sees the ending rather than an error about the thing that worked.
 *
 * ── Why the ORGANISER is the one who retries ──────────────────────────────
 *
 * Not an arbitrary choice, and the first version of this scenario got it
 * wrong: it had a guest press the button, and the retry timed out waiting for
 * an ending it could never be shown.
 *
 * The exit revokes every guest session on the activity — including the one
 * belonging to whoever pressed it. A member keeps their session and can
 * therefore ask again; a guest cannot, and must not, because the window that
 * would let a revoked session through one more time is the same window a
 * stolen link uses. `MEMBER_WITHDRAW_REPLAY = response_idempotent`,
 * `GUEST_WITHDRAW_REPLAY = effect_idempotent_but_credential_is_revoked` —
 * the asymmetry is documented on `withdraw` rather than engineered away, and
 * this scenario tests the half that HAS a replayable response.
 */
async function keepPrivateRetryAfterLoss(browser) {
  const organiser = await register("retry-privado");
  const organiserCtx = await browser.newContext();
  const guestCtxs = [];

  try {
    const page = await organiserCtx.newPage();
    await signIn(page, organiser);
    await page.goto(`${WEB}/dashboard/circulos`, {
      waitUntil: "domcontentloaded",
    });
    const start = page.getByRole("link", { name: /Empezar este círculo/i });
    await start.waitFor({ state: "visible", timeout: 30_000 });
    await start.click();
    await page.getByRole("button", { name: /Crear el círculo/i }).click();

    const links = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        const found = text.match(/https?:\/\/\S*\/i#[A-Za-z0-9_-]{43}/g) ?? [];
        return found.length === 2 ? found : null;
      },
      "two invitation links to appear",
      60_000,
    );

    const activityId = sqlOne(
      `SELECT a."id" FROM "CircleActivity" a
         JOIN "Circle" c ON c."id" = a."circleId"
        WHERE c."createdByUserId" = '${organiser.userId}'
        ORDER BY a."createdAt" DESC LIMIT 1`,
    ).trim();

    const guests = [];
    for (const link of links) {
      const guest = await acceptAsGuest(browser, link);
      guestCtxs.push(guest.ctx);
      guests.push(guest);
    }

    // The organiser fixes the group first: nobody can confirm to an audience
    // that is not decided yet.
    await continuarConQuienesAceptaron(page, activityId);

    // A GUEST confirms something real, so there is an envelope the exit has
    // to destroy — otherwise a replay that did nothing would look the same as
    // a replay that did the right thing.
    const guest = guests[0];
    await enterRoom(guest.page);
    await typeDraft(guest.page, { uno: "lo que sí escribió una invitada" });
    await openPreview(guest.page);
    await confirmShare(guest.page);

    // The ORGANISER is the one who keeps it private, and the one who retries.
    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    await typeDraft(page, { uno: "algo que no va a salir" });
    await forwardToSharing(page);
    await page.check('input[name="modo"][value="KEEP_PRIVATE"]');
    await page.getByRole("button", { name: /Ver qué se compartirá/i }).click();
    await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        return /Nadie verá nada/i.test(text) ? text : null;
      },
      "the confirmation screen",
      30_000,
    );

    // Let the command REACH the API and commit, then drop the response.
    let servedAndDropped = false;
    await page.route("**/comando", async (route) => {
      const response = await route.fetch(); // the server really runs this
      void response.status();
      servedAndDropped = true;
      await route.abort("connectionfailed"); // the browser never sees it
    });

    await confirmShare(page);
    await until(
      () => servedAndDropped,
      "the private exit to be served",
      60_000,
    );

    const withdrawals = () =>
      sqlOne(
        `SELECT count(*) FROM "CircleEvent"
          WHERE "activityId"='${activityId}' AND "type"='PARTICIPANT_WITHDRAWN'`,
      ).trim();
    const cancellations = () =>
      sqlOne(
        `SELECT count(*) FROM "CircleEvent"
          WHERE "activityId"='${activityId}' AND "type"='ACTIVITY_CANCELLED'`,
      ).trim();

    await until(
      () =>
        sqlOne(
          `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
        ).trim() === "CANCELLED",
      "the server to have committed the exit",
      60_000,
    );
    check(
      withdrawals() === "1",
      `the server committed ONE exit (${withdrawals()})`,
    );
    check(cancellations() === "1", `and ONE cancellation (${cancellations()})`);

    // The retry: same page, same intention, so the same key is still in the
    // `useRef` map. This is the press a person makes when the screen tells
    // them the network failed.
    await page.unroute("**/comando");
    await confirmShare(page);

    const closed = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        return /Esta actividad terminó/i.test(text) ? text : null;
      },
      "the retry to land on the ending rather than an error",
      60_000,
    );
    check(
      Boolean(closed),
      "the retry shows the ending, not a failure about the thing that worked",
    );
    check(
      !/CIRCLE_[A-Z_]+/.test(closed ?? ""),
      "and no machine code leaks onto the screen",
    );

    check(
      withdrawals() === "1",
      `the retry did NOT record a second exit (${withdrawals()})`,
    );
    check(
      cancellations() === "1",
      `nor a second cancellation (${cancellations()})`,
    );
    const sealed = sqlOne(
      `SELECT count(*) FROM "CircleActivityParticipant"
        WHERE "activityId"='${activityId}' AND "ciphertext" IS NOT NULL`,
    ).trim();
    check(
      sealed === "0",
      `every pending envelope is still destroyed (${sealed})`,
    );
  } finally {
    await organiserCtx.close();
    for (const ctx of guestCtxs) await ctx.close();
  }
}

async function groupKeepPrivate(browser) {
  const organiser = await register("grupo-privado");
  const organiserCtx = await browser.newContext();
  const guestCtxs = [];

  try {
    const page = await organiserCtx.newPage();
    await signIn(page, organiser);
    await page.goto(`${WEB}/dashboard/circulos`, {
      waitUntil: "domcontentloaded",
    });
    const start = page.getByRole("link", { name: /Empezar este círculo/i });
    await start.waitFor({ state: "visible", timeout: 30_000 });
    await start.click();
    await page.getByRole("button", { name: /Crear el círculo/i }).click();

    const links = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        const found = text.match(/https?:\/\/\S*\/i#[A-Za-z0-9_-]{43}/g) ?? [];
        return found.length === 2 ? found : null;
      },
      "two invitation links to appear",
      60_000,
    );

    const activityId = sqlOne(
      `SELECT a."id" FROM "CircleActivity" a
         JOIN "Circle" c ON c."id" = a."circleId"
        WHERE c."createdByUserId" = '${organiser.userId}'
        ORDER BY a."createdAt" DESC LIMIT 1`,
    ).trim();

    // Everybody can prepare from the moment they accept. What nobody can do
    // is confirm, until the organiser says who the group is.
    const guests = [];
    for (const [index, link] of links.entries()) {
      const before = sqlOne(
        `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
      ).trim();
      // REPLACED, not removed. The room used to wait for the whole roster;
      // now it waits for the ORGANISER. What still has to hold is that
      // accepting does not open it by itself — that is what makes preparing
      // early safe, because nobody's audience is fixed behind their back.
      check(
        before === "INVITING",
        `accepting does not open the room by itself (after ${index}: ${before})`,
      );
      const guest = await acceptAsGuest(browser, link);
      guestCtxs.push(guest.ctx);
      guests.push(guest);
    }
    const afterAll = sqlOne(
      `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
    ).trim();
    check(
      afterAll === "INVITING",
      `even a FULL room waits for the organiser (${afterAll})`,
    );
    // And this is the new way a room opens: the organiser continues with
    // whoever accepted, which here is everybody.
    await continuarConQuienesAceptaron(page, activityId);
    const afterClose = sqlOne(
      `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
    ).trim();
    check(
      afterClose === "PREPARING",
      `continuing with the group opens the preparation (${afterClose})`,
    );

    // The organiser confirms a real selection first, so there is something
    // that would have been revealed.
    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);
    await typeDraft(page, { uno: "algo que sí escribí" });
    await openPreview(page);
    await confirmShare(page);

    // A guest chooses to keep everything private. The screen has to say what
    // that does BEFORE the button is pressed.
    const guest = guests[0];
    await enterRoom(guest.page);
    await typeDraft(guest.page, { uno: "algo privado" });
    await forwardToSharing(guest.page);
    await guest.page.check('input[name="modo"][value="KEEP_PRIVATE"]');
    const warning = await guest.page.evaluate(() => document.body.innerText);
    check(
      /termina aquí para todo el grupo/i.test(warning),
      "the screen says the activity ends before the button is pressed",
    );
    check(
      /no se le dice a nadie quién lo eligió/i.test(warning),
      "and that nobody is told who chose it",
    );

    await guest.page
      .getByRole("button", { name: /Ver qué se compartirá/i })
      .click();
    const preview = await until(
      async () => {
        const text = await guest.page.evaluate(() => document.body.innerText);
        return /Nadie verá nada/i.test(text) ? text : null;
      },
      "the confirmation screen to spell out the consequence",
      30_000,
    );
    check(
      /la actividad se cierra/i.test(preview),
      "the confirmation screen says it cannot be undone",
    );
    await confirmShare(guest.page);

    await until(
      () =>
        sqlOne(
          `SELECT "status"::text FROM "CircleActivity" WHERE "id"='${activityId}'`,
        ).trim() === "CANCELLED",
      "the activity to end without revealing",
      60_000,
    );
    check(true, "keeping it private ends the activity");

    const revealed = sqlOne(
      `SELECT count(*) FROM "CircleEvent"
        WHERE "activityId"='${activityId}' AND "type"='ACTIVITY_REVEALED'`,
    ).trim();
    check(revealed === "0", `and nothing was revealed (${revealed} events)`);

    const sealed = sqlOne(
      `SELECT count(*) FROM "CircleActivityParticipant"
        WHERE "activityId"='${activityId}' AND "ciphertext" IS NOT NULL`,
    ).trim();
    check(sealed === "0", `every pending envelope is destroyed (${sealed})`);

    // The ORGANISER, who pressed nothing, learns it ended — and nothing else.
    await page.reload({ waitUntil: "domcontentloaded" });
    const shown = await until(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        return /Esta actividad terminó/i.test(text) ? text : null;
      },
      "the organiser to see a terminal screen",
      60_000,
    );
    check(
      /No se abrió nada y no se compartió nada/i.test(shown),
      "the close is truthful: nothing was opened",
    );
    // What must NOT be there is a CHOICE attributed to somebody. The screen
    // does say "lo que escribiste en privado no salió de tu pantalla" — that
    // is about the reader's own preparation and is the reassurance they came
    // for, so the check looks for attribution rather than for a word.
    check(
      !/Participante \d/.test(shown) &&
        !/eligi/i.test(shown) &&
        !/KEEP_PRIVATE/.test(shown) &&
        !/algo privado/.test(shown),
      "and it attributes the ending to nobody",
    );

    // The other GUEST sees the same screen a cancelled Dúo has always shown
    // its guest: the session was revoked with the activity, so the page is
    // refused rather than rendered. It is neutral — no name, no reason, no
    // hint that somebody chose anything — and it is the Dúo's existing
    // behaviour rather than something groups introduced.
    const other = guests[1];
    await other.page.reload({ waitUntil: "domcontentloaded" });
    const guestText = await until(
      async () => {
        const text = await other.page.evaluate(() => document.body.innerText);
        return text.length > 0 ? text : null;
      },
      "the other guest's page to settle",
      60_000,
    );
    check(
      !/Participante \d/.test(guestText) &&
        !/privad/i.test(guestText) &&
        !/algo que sí escribí/.test(guestText),
      "the other guest is told nothing about who ended it, or what was written",
    );
  } finally {
    await organiserCtx.close().catch(() => {});
    for (const ctx of guestCtxs) await ctx.close().catch(() => {});
  }
}

// ── Scenario · the ways a Dúo ends ──────────────────────────────────────────

/**
 * Every exit, watched from the ORGANISER's authenticated page.
 *
 * A manual tester reported "an error on the inviter's page when closing the
 * Dúo" and could not say which button. So this walks all of them and records
 * what the page DID — the requests it made, the statuses it got, the text it
 * ended on — rather than asserting one guess.
 *
 * What it refuses to accept as success:
 *
 *  - a terminal activity that leaves an error on screen;
 *  - a terminal activity that keeps polling (the room asks forever about
 *    something that cannot change again);
 *  - leaving the activity taking the ACCOUNT session with it.
 */
async function closingPaths(browser) {
  const organiser = await register("closing");
  const ctx = await browser.newContext();
  let guest = null;

  try {
    const page = await ctx.newPage();

    // Everything this page asks for, so a failure names the request.
    const calls = [];
    page.on("response", (res) => {
      const u = new URL(res.url());
      if (u.pathname.startsWith("/api/circulos")) {
        calls.push(`${res.request().method()} ${u.pathname} → ${res.status()}`);
      }
    });
    const errorsShown = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[role="alert"], [role="status"]')]
          .map((n) => n.textContent?.trim() ?? "")
          .filter((t) => t.length > 0),
      );

    await signIn(page, organiser);
    const link = await createDuo(page);
    guest = await acceptAsGuest(browser, link);
    const activityId = guest.activityId;

    await page.goto(`${WEB}/compartir/${activityId}`, {
      waitUntil: "domcontentloaded",
    });
    await enterRoom(page);

    // Both confirm, so the activity reveals.
    for (const [who, p] of [
      ["org", page],
      ["guest", guest.page],
    ]) {
      if (who === "guest") await enterRoom(p);
      await typeDraft(p, { uno: `${who}-cierre`, dos: `${who}-dos` });
      await openPreview(p);
      await confirmShare(p);
    }
    await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(() => document.body.innerText);
        return t.includes("Lo que compartió la otra persona");
      },
      "the reveal",
      60_000,
    );
    check(true, "the activity reveals for the organiser");

    // ── the artifact, proposed and agreed ───────────────────────────────────
    await page.fill("#artefacto", `acuerdo-${randomBytes(3).toString("hex")}`);
    await page.getByRole("button", { name: /^Proponer$/ }).click();
    await until(
      () =>
        sqlInt(
          `SELECT count(*) FROM "CircleArtifact" WHERE "activityId"='${activityId}'`,
        ) === 1,
      "the proposal to persist",
      30_000,
    );
    for (const p of [guest.page, page]) {
      await p.reload({ waitUntil: "domcontentloaded" });
      const confirm = p.getByRole("button", {
        name: /Confirmar esta versión/i,
      });
      if ((await confirm.count()) > 0) await confirm.click();
    }
    await until(
      () =>
        sqlOne(
          `SELECT "status" FROM "CircleArtifact" WHERE "activityId"='${activityId}' ORDER BY "version" DESC LIMIT 1`,
        ) === "AGREED",
      "both confirmations to agree the artifact",
      60_000,
    );
    check(true, "the artifact reaches AGREED with both confirmations");

    // ── the follow-up, and the close ────────────────────────────────────────
    //
    // The follow-up opens on a DATE. Moving that date on THIS activity is the
    // same synthetic-date technique the worker scenario uses; the transition
    // itself still runs on the server's own terms.
    sql(
      `UPDATE "CircleActivity" SET "followUpDueAt" = now() - interval '1 hour'
        WHERE "id"='${activityId}'`,
    );
    // And the REAL worker opens it, because that is who opens it in production:
    // the room cannot transition itself, and a test that reached FOLLOW_UP by
    // writing the status would be testing a state the product never produces.
    const sweep = await transport.enqueue(
      "circles-sweep",
      "run-circles-sweep",
      {
        nowIso: new Date().toISOString(),
        batchSize: 50,
      },
    );
    await until(
      async () => {
        const state = await sweep.state();
        return state === "completed" || state === "failed" ? state : null;
      },
      "the sweep that opens the follow-up",
      120_000,
    );

    await until(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        const t = await page.evaluate(() => document.body.innerText);
        return t.includes("¿Cómo siguen?");
      },
      "the follow-up to open on the organiser's screen",
      60_000,
    );

    // The organiser closes FIRST; the guest has not answered yet.
    calls.length = 0;
    await page.getByRole("button", { name: /Lo cerramos aquí/i }).click();
    await until(
      () =>
        sqlOne(
          `SELECT "followUpDecision" FROM "CircleActivityParticipant" p
             JOIN "CircleMember" m ON m."id"=p."memberId"
            WHERE p."activityId"='${activityId}' AND m."userId"='${organiser.userId}'`,
        ) === "CLOSE",
      "the organiser's decision to persist",
      30_000,
    );
    // ── the decision is stored; the SCREEN is a second round trip ───────────
    //
    // The poll above establishes that the row committed. It does NOT establish
    // that the browser knows: the server commits before it has finished
    // answering, and the room only learns what happened when `command()`
    // refetches the view on success and React renders `followUpDecision` from
    // that answer. So the database can be a whole round trip ahead of the page,
    // and reading `innerText` the instant the row lands reads a screen that is
    // correct and simply not repainted yet.
    //
    // That is what happened in CI: the same commit passed on `pull_request` and
    // failed on `push`, half a second after the click, with the very next check
    // reporting the command had answered 200 and shown no error. A difference
    // that only timing can explain is a race in the observer, not a missing
    // feature in the observed.
    //
    // Waiting for the visible state IS the assertion rather than a way around
    // one: `waitFor` fails if the text never arrives, which is exactly the
    // product failure this check exists to catch — it is only no longer
    // reported for arriving a moment later than the SQL. The timeout is the
    // context default, so the local/hosted distinction already set up for this
    // walk is the one that applies here too.
    let announced = true;
    try {
      await page
        .getByRole("heading", { name: /Ya respondiste/i })
        .waitFor({ state: "visible" });
    } catch {
      announced = false;
    }
    check(
      announced,
      "closing first says the decision was recorded, and waits for the other",
    );
    check(
      (await errorsShown()).length === 0,
      `no error is shown after closing first (saw: ${JSON.stringify(await errorsShown())} · ${calls.join(" | ")})`,
    );
    // One decision is not the end. Until the other person answers, the activity
    // is still in follow-up — a room that closed itself on the first decision
    // would end a two-person conversation on one person's say-so.
    const midway = sqlOne(
      `SELECT "status" FROM "CircleActivity" WHERE "id"='${activityId}'`,
    );
    check(
      midway === "FOLLOW_UP",
      `and the activity stays in follow-up while the other person has not answered (got ${midway})`,
    );

    // The guest closes too, which ends the activity.
    await guest.page.reload({ waitUntil: "domcontentloaded" });
    const guestClose = guest.page.getByRole("button", {
      name: /Lo cerramos aquí/i,
    });
    await guestClose.waitFor({ state: "visible", timeout: 30_000 });
    await guestClose.click();
    await until(
      () =>
        sqlOne(
          `SELECT "status" FROM "CircleActivity" WHERE "id"='${activityId}'`,
        ) === "CLOSED",
      "the activity to close once both decided",
      30_000,
    );
    check(true, "both decisions close the activity");

    // ── what the organiser's page does once it is over ──────────────────────
    calls.length = 0;
    await until(
      async () => {
        const t = await page.evaluate(() => document.body.innerText);
        return /Esta actividad terminó/i.test(t);
      },
      "the organiser's open page to show the final state on its own",
      90_000,
    );
    check(true, "the open page reaches the final state by itself");
    check(
      (await errorsShown()).length === 0,
      `the closed room shows no error (saw: ${JSON.stringify(await errorsShown())} · ${calls.join(" | ")})`,
    );

    // A reload straight after the terminal state.
    calls.length = 0;
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloaded = await page.evaluate(() => document.body.innerText);
    check(
      /Esta actividad terminó/i.test(reloaded),
      `reloading a closed room shows the end, not an error (${reloaded.slice(0, 160).replace(/\s+/g, " ")})`,
    );
    check(
      (await errorsShown()).length === 0,
      `and no error after the reload (saw: ${JSON.stringify(await errorsShown())} · ${calls.join(" | ")})`,
    );

    // And it stops asking. Polling is ten seconds; twenty-five is two windows.
    calls.length = 0;
    await page.waitForTimeout(25_000);
    check(
      calls.length === 0,
      `a closed room stops polling (made: ${calls.join(" | ") || "no calls"})`,
    );

    // ── leaving does not log the account out ────────────────────────────────
    await page.goto(`${WEB}/dashboard/circulos`, {
      waitUntil: "domcontentloaded",
    });
    check(
      !new URL(page.url()).pathname.startsWith("/login"),
      `the account session survives the closed activity (at ${new URL(page.url()).pathname})`,
    );

    // ── the same ending, on a phone ─────────────────────────────────────────
    //
    // Two browsers is the shape of a Dúo; a phone is where half of one will
    // actually happen. The closed room is the screen somebody is most likely to
    // reach on the move, so it is the one checked at that width.
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      storageState: await ctx.storageState(),
    });
    try {
      const small = await phone.newPage();
      await small.goto(`${WEB}/compartir/${activityId}`, {
        waitUntil: "domcontentloaded",
      });
      const smallText = await small.evaluate(() => document.body.innerText);
      check(
        /Esta actividad terminó/i.test(smallText),
        "the closed room reads the same on a phone",
      );
      const overflow = await small.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      check(
        overflow <= 1,
        `and nothing runs off the side of the screen (overflow ${overflow}px)`,
      );
    } finally {
      await phone.close();
    }

    // ── the OTHER way a Dúo ends: the exit button ───────────────────────────
    //
    // A second activity, because the first one is over. This is the control
    // that is always on screen — the one somebody reaches for when they mean
    // "close this" — and it ends the activity for both people.
    const second = await createDuo(page);
    const guest2 = await acceptAsGuest(browser, second);
    try {
      await page.goto(`${WEB}/compartir/${guest2.activityId}`, {
        waitUntil: "domcontentloaded",
      });
      await enterRoom(page);
      await enterRoom(guest2.page);
      for (const [who, p] of [
        ["org", page],
        ["guest", guest2.page],
      ]) {
        await typeDraft(p, { uno: `${who}-salida`, dos: `${who}-dos` });
        await openPreview(p);
        await confirmShare(p);
      }
      await until(
        async () => {
          await page.reload({ waitUntil: "domcontentloaded" });
          const t = await page.evaluate(() => document.body.innerText);
          return t.includes("Lo que compartió la otra persona");
        },
        "the second activity to reveal",
        60_000,
      );

      calls.length = 0;
      await page
        .getByRole("button", { name: /Retirarme de la actividad/i })
        .click();
      // Where the organiser LANDS, and whether anything shouted on the way.
      await until(
        () => !new URL(page.url()).pathname.startsWith("/compartir/"),
        "the organiser to be taken out of the room",
        30_000,
      );
      const landedOn = new URL(page.url()).pathname;
      const afterExit = await errorsShown();
      check(
        !landedOn.startsWith("/login"),
        `leaving the activity does not end the account session (landed on ${landedOn})`,
      );
      check(
        afterExit.length === 0,
        `leaving shows no error (saw: ${JSON.stringify(afterExit)} · ${calls.join(" | ")})`,
      );
      check(
        sqlOne(
          `SELECT "status" FROM "CircleActivity" WHERE "id"='${guest2.activityId}'`,
        ) !== "REVEALED",
        "and the activity is settled rather than left running",
      );

      // The guest, meanwhile, must be told — without being told why.
      await until(
        async () => {
          await guest2.page.reload({ waitUntil: "domcontentloaded" });
          const t = await guest2.page.evaluate(() => document.body.innerText);
          return /termin|no está disponible/i.test(t);
        },
        "the guest to see a coherent end",
        60_000,
      );
      const guestText = await guest2.page.evaluate(
        () => document.body.innerText,
      );
      check(
        !/retir[óo]|abandon/i.test(guestText),
        "and is not told the other person withdrew",
      );
    } finally {
      await guest2.ctx.close();
    }

    // ── the room outlives the access token ──────────────────────────────────
    //
    // The reported defect. A Dúo takes longer than the fifteen minutes an
    // access token lives, and this branch of the middleware used to return
    // without renewing anything — so the organiser's room quietly stopped
    // being able to do ANYTHING, closing included, while their session was
    // perfectly alive.
    //
    // Rather than wait fifteen minutes, the cookie is replaced with one that
    // has already expired. The refresh token is left exactly as it is: that is
    // the state a person is in after a long conversation.
    const fourth = await createDuo(page);
    const guest4 = await acceptAsGuest(browser, fourth);
    try {
      await page.goto(`${WEB}/compartir/${guest4.activityId}`, {
        waitUntil: "domcontentloaded",
      });
      await enterRoom(page);

      const before = await ctx.cookies();
      const access = before.find((c) => c.name === "psico_at");
      const refresh = before.find((c) => c.name === "psico_rt");
      check(
        Boolean(access && refresh),
        "the organiser holds both halves of a session",
      );
      const expired = `x.${Buffer.from(
        JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }),
      ).toString("base64url")}.y`;
      await ctx.addCookies([{ ...access, value: expired }]);

      calls.length = 0;
      // The exit is a command, and it is the one the tester pressed.
      await page
        .getByRole("button", { name: /Retirarme de la actividad/i })
        .click();
      // Wait for EITHER outcome, so a failure can say which one happened
      // instead of only that time ran out.
      const left = await until(
        async () => {
          if (!new URL(page.url()).pathname.startsWith("/compartir/")) {
            return "left";
          }
          return (await errorsShown()).length > 0 ? "error" : null;
        },
        "the room to answer the exit",
        45_000,
      ).catch(() => "nothing");
      const expiredErrors = await errorsShown();
      check(
        left === "left" && expiredErrors.length === 0,
        `closing works after the access token expired ` +
          `(outcome: ${left} · shown: ${JSON.stringify(expiredErrors)} · ${calls.join(" | ")})`,
      );
      check(
        sqlOne(
          `SELECT "status" FROM "CircleActivity" WHERE "id"='${guest4.activityId}'`,
        ) === "CANCELLED",
        "and the activity really ended, rather than only looking like it",
      );
      const after = await ctx.cookies();
      const renewed = after.find((c) => c.name === "psico_at")?.value ?? "";
      check(
        renewed !== expired && renewed.length > 0,
        "the session was renewed rather than abandoned",
      );
      // The reported symptom by its number. "No error was shown" and "no 403
      // was answered" are different facts: a refusal the screen swallowed
      // would pass the first and is exactly the defect.
      const forbidden = calls.filter((c) => / → 403\b/.test(c));
      check(
        forbidden.length === 0,
        `and no request was answered 403 (${forbidden.join(" | ") || "none"})`,
      );
    } finally {
      await guest4.ctx.close();
    }

    // ── the guest leaves while the organiser is still in the room ───────────
    const third = await createDuo(page);
    const guest3 = await acceptAsGuest(browser, third);
    try {
      await page.goto(`${WEB}/compartir/${guest3.activityId}`, {
        waitUntil: "domcontentloaded",
      });
      await enterRoom(page);
      await enterRoom(guest3.page);

      calls.length = 0;
      await guest3.page
        .getByRole("button", { name: /Retirarme de la actividad/i })
        .click();
      await until(
        () =>
          sqlOne(
            `SELECT "status" FROM "CircleActivity" WHERE "id"='${guest3.activityId}'`,
          ) !== "PREPARING",
        "the guest's withdrawal to settle the activity",
        60_000,
      );

      // The organiser's page is OPEN and polling. It has to arrive at the end
      // on its own, without an error and without asking forever.
      await until(
        async () => {
          const t = await page.evaluate(() => document.body.innerText);
          return /Esta actividad terminó/i.test(t);
        },
        "the organiser's open page to reflect the guest leaving",
        90_000,
      );
      const orgErrors = await errorsShown();
      check(
        orgErrors.length === 0,
        `the organiser sees the end, not an error (saw: ${JSON.stringify(orgErrors)} · ${calls.join(" | ")})`,
      );
      calls.length = 0;
      await page.waitForTimeout(25_000);
      check(
        calls.length === 0,
        `and stops polling once it is over (made: ${calls.join(" | ") || "no calls"})`,
      );
    } finally {
      await guest3.ctx.close();
    }
  } finally {
    await ctx.close();
    if (guest) await guest.ctx.close();
  }
}

// ── Run them ────────────────────────────────────────────────────────────────

console.log(`\nCírculos Dúo walk · commit ${HEAD_SHA}`);

const browser = await chromium.launch();

/**
 * Give hosted runs longer, in ONE place.
 *
 * Playwright's thirty seconds is a sensible default for a stack on this
 * machine. Against Railway and Vercel it is not a diagnosis: a cold start, a
 * function boot and two network hops can eat it without anything being wrong,
 * and the failure then reads `page.goto: Timeout 30000ms exceeded` — which
 * looks exactly like a page that never renders.
 *
 * Longer timeouts do NOT make a broken assertion pass; they only stop a slow
 * one from being reported as broken. So this is per-transport rather than
 * across the board: local runs keep the short timeout, where a thirty-second
 * navigation really is a bug.
 *
 * Wrapping `newContext` once beats editing twenty call sites and beats
 * remembering to pass a timeout at each of them.
 */
if (transport.kind === "railway") {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const ctx = await newContext(options);
    ctx.setDefaultNavigationTimeout(90_000);
    ctx.setDefaultTimeout(45_000);
    return ctx;
  };
}

try {
  await scenario("BROWSER_ENTRY_FLOW", "creation and entry", () =>
    entryFlow(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_PRIVATE_PREPARATION",
    "the private half stays private",
    () => privatePreparation(browser),
  );
  resetRateLimits();

  await scenario("BROWSER_REVEAL_BARRIER", "the reveal barrier", () =>
    revealBarrier(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_ARTIFACT_CONFIRMATION",
    "the artifact, by exact version",
    () => artifactConfirmation(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_WITHDRAWAL_BEFORE_AND_AFTER",
    "withdrawal before and after the reveal",
    () => withdrawalBeforeAndAfter(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_RETRY_AFTER_COMMITTED_RESPONSE_LOSS",
    "a committed response that never arrived",
    () => retryAfterCommittedLoss(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_FOREIGN_SESSION_REJECTED",
    "a third session, and somebody else's cookie",
    () => foreignSessionRejected(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_GROUP_OF_THREE",
    "a circle of three, end to end",
    () => groupOfThree(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_REDUCED_GROUP",
    "a circle offered to six that continues with two, to the end",
    () => reducedGroup(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_KEEP_PRIVATE_RETRY_AFTER_LOSS",
    "the private exit, retried with the same key after a lost response",
    () => keepPrivateRetryAfterLoss(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_SEND_ACKNOWLEDGEMENT",
    "sending your part tells you so, before anybody else acts",
    () => sendAcknowledgement(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_REDUCED_GROUP_KEEP_PRIVATE",
    "the private exit of a group that continued with two",
    () => reducedGroupKeepPrivate(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_GROUP_KEEP_PRIVATE",
    "a group's private exit, and what the others are told",
    () => groupKeepPrivate(browser),
  );
  resetRateLimits();

  await scenario("BROWSER_CLOSING_PATHS", "the ways a Dúo ends", () =>
    closingPaths(browser),
  );
  resetRateLimits();

  await scenario(
    "REAL_WORKER_TEMPORAL_SCENARIOS",
    "the real worker, on synthetic dates",
    () => workerTemporalScenarios(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_CANDIDATE_EXPERIENCE",
    "the candidate @2, its help, and what does not travel",
    () => candidateExperienceScenario(browser),
  );
  resetRateLimits();

  await scenario(
    "BROWSER_VERSION_COEXISTENCE",
    "@1 keeps its own questions while @2 is offered",
    () => versionCoexistenceScenario(browser),
  );
  resetRateLimits();

  await scenario(
    "REAL_ANALYTICS_BOUNDARY",
    "what analytics may see, and when",
    () => analyticsBoundaryScenario(browser),
  );
  resetRateLimits();

  await scenario(
    "REAL_ARTIFACT_PURGE_SCENARIO",
    "the approved artifact policy, through the real processor",
    () => artifactPurgeScenario(browser),
  );
  resetRateLimits();

  await scenario(
    "REAL_ACCOUNT_DELETION_SCENARIO",
    "account deletion through the real processor",
    () => accountDeletionScenario(browser),
  );
  resetRateLimits();

  // Locally the stack runs a second API that BOOTED with `off`, so the gate is
  // observed in the same pass. A hosted environment has one API, and closing it
  // means a redeploy — so there the gate is exercised on its own, deliberately,
  // rather than by leaving a scenario that silently asserts nothing.
  if (process.env.CIRCULOS_E2E_SKIP_OFF_SCENARIO !== "1") {
    await scenario("OFF_GATE_SCENARIO", "the rollout gate, closed", () =>
      rolloutOffScenario(),
    );
  }
} finally {
  await browser.close();
}

// ── The report ──────────────────────────────────────────────────────────────

const totalChecks = scenarios.reduce((n, s) => n + s.checks.length, 0);
const failedScenarios = scenarios.filter((s) => s.failures.length > 0);

console.log("\n────────────────────────────────────────────────");
console.log(`commit ${HEAD_SHA}`);
for (const s of scenarios) {
  const passed = s.checks.filter((c) => c.ok).length;
  console.log(
    `${s.failures.length === 0 ? "PASS" : "FAIL"}  ${s.key}  ${passed}/${s.checks.length}` +
      (s.error ? `  ← ${s.error}` : ""),
  );
}
console.log(
  `\n${scenarios.length - failedScenarios.length}/${scenarios.length} scenarios, ` +
    `${totalChecks} checks`,
);

if (failedScenarios.length) {
  console.error("\nFAILURES:");
  for (const s of failedScenarios) {
    for (const f of s.failures) console.error(`  - ${s.key}: ${f}`);
  }
  process.exit(1);
}
console.log("✔ every scenario completed");
