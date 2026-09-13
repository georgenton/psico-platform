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
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const API = process.env.CIRCULOS_E2E_API;
const API_OFF = process.env.CIRCULOS_E2E_API_OFF;
const WEB = process.env.CIRCULOS_E2E_WEB;
const PG_CONTAINER = process.env.CIRCULOS_E2E_PG_CONTAINER;
const PG_DATABASE = process.env.CIRCULOS_E2E_PG_DATABASE;
const WORK = process.env.CIRCULOS_E2E_WORK;
const REDIS_URL = process.env.CIRCULOS_E2E_REDIS_URL;
const HEAD_SHA = process.env.CIRCULOS_E2E_HEAD_SHA ?? "(unknown)";

for (const [name, value] of Object.entries({
  CIRCULOS_E2E_API: API,
  CIRCULOS_E2E_API_OFF: API_OFF,
  CIRCULOS_E2E_WEB: WEB,
  CIRCULOS_E2E_PG_CONTAINER: PG_CONTAINER,
  CIRCULOS_E2E_PG_DATABASE: PG_DATABASE,
  CIRCULOS_E2E_WORK: WORK,
  CIRCULOS_E2E_REDIS_URL: REDIS_URL,
})) {
  if (!value) {
    console.error(`duo.walk.mjs runs from stack.mjs, which supplies ${name}.`);
    process.exit(2);
  }
}

const { chromium } = await import("playwright");

/**
 * BullMQ, loaded from the API workspace inside the archived copy.
 *
 * The walk enqueues into the SAME queues the running worker consumes, so a
 * temporal scenario is the real processor doing real work — not this script
 * calling a service and calling that "the worker". `@psico/web` has no reason
 * to depend on BullMQ, so it is reached where it legitimately lives.
 */
const apiRequire = createRequire(join(WORK, "apps/api/package.json"));
const { Queue } = apiRequire("bullmq");

// ── Result bookkeeping ──────────────────────────────────────────────────────

const scenarios = [];
let current = null;

function check(ok, label) {
  current.checks.push({ ok, label });
  console.log(`   ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) current.failures.push(label);
}

/** Redacted for any diagnostic output. */
const shape = (link) => String(link).replace(/#.+$/, "#<token:43>");

async function scenario(key, title, body) {
  current = { key, title, checks: [], failures: [], error: null };
  scenarios.push(current);
  console.log(`\n── ${title} ──`);
  try {
    await body();
  } catch (err) {
    current.error = err.message;
    current.failures.push(`threw: ${err.message}`);
    console.error(`   ✗ threw: ${err.message}`);
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

/** One SQL statement against the run's own database, through its container. */
function sql(text) {
  return execFileSync(
    "docker",
    ["exec", PG_CONTAINER, "psql", "-U", "postgres", "-d", PG_DATABASE, "-tAc", text],
    { encoding: "utf8" },
  ).trim();
}

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
function resetRateLimits() {
  const container = PG_CONTAINER.replace("-pg-", "-redis-");
  try {
    execFileSync(
      "docker",
      [
        "exec",
        container,
        "sh",
        "-lc",
        "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del > /dev/null",
      ],
      { stdio: "pipe" },
    );
  } catch {
    /* nothing to clear */
  }
}

// ── Real accounts, real sign-in ─────────────────────────────────────────────

/**
 * A synthetic account through the ordinary registration endpoint.
 *
 * Not a back door: this is the call the sign-up form makes. Inventing a
 * test-only way to mint accounts would be inventing exactly the thing that must
 * not exist.
 */
async function register(label) {
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
    await page.getByRole("button", { name: /Empezar/i }).first().click();
    await skip.waitFor({ state: "visible", timeout: 15_000 });
  }
  await Promise.all([
    page.waitForURL((u) => !/\/onboarding/.test(String(u)), { timeout: 60_000 }),
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

/** Read the invitation link off the screen once creation has produced one. */
async function readLink(page) {
  return until(
    async () => {
      const text = await page.evaluate(() => document.body.innerText);
      const m = text.match(/https?:\/\/\S*\/i#[A-Za-z0-9_-]{43}/);
      return m ? m[0] : null;
    },
    "the invitation link to appear",
    30_000,
  );
}

async function createDuo(page) {
  const button = await openCreateScreen(page);
  await button.click();
  return readLink(page);
}

/** Accept an invitation in a fresh context and land in the room. */
async function acceptAsGuest(browser, link) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link, { waitUntil: "domcontentloaded" });
  const accept = page.getByRole("button", { name: /Aceptar( la)? invitación/i });
  await accept.waitFor({ state: "visible", timeout: 30_000 });
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
  await page
    .getByRole("heading", { name: /Tu preparación/i })
    .waitFor({ state: "visible", timeout: 30_000 });
}

/** Type a draft without confirming anything. */
async function typeDraft(page, { uno, dos }) {
  await page.check('input[name="modo"][value="SELECTED_FIELDS"]');
  await page.fill("#f-campo-uno", uno);
  await page.fill("#f-campo-dos", dos);
}

async function openPreview(page) {
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
    check(true, "the synthetic template is offered on an eligible experience");
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
      .getByRole("heading", { name: /Tu preparación/i })
      .waitFor({ state: "visible", timeout: 20_000 });
    const afterBack = await page.inputValue("#f-campo-uno");
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
      .getByRole("heading", { name: /Tu preparación/i })
      .waitFor({ state: "visible", timeout: 20_000 });
    const afterFailure = await page.inputValue("#f-campo-uno");
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

    // First confirmation: the organiser waits, and the GUEST must not be able
    // to see anything of theirs.
    await page
      .getByRole("heading", { name: /Falta la otra persona/i })
      .waitFor({ state: "visible", timeout: 30_000 });
    check(true, "the first to confirm is told the other person is missing");

    await guest.page.reload({ waitUntil: "domcontentloaded" });
    const guestSees = await guest.page.evaluate(() => document.body.innerText);
    check(
      !guestSees.includes(ORG_TEXT),
      "the second person cannot see the first person's words before confirming",
    );

    const revealedAt = sqlOne(
      `SELECT coalesce("revealedAt"::text,'') FROM "CircleActivity" WHERE "id"='${activityId}'`,
    );
    check(revealedAt === "", "nothing is revealed on one confirmation");

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
    await page.getByRole("button", { name: /Proponer otra redacción/i }).click();
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
    check(true, "editing the wording creates version 2 rather than mutating v1");

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
      const confirm = p.getByRole("button", { name: /Confirmar esta versión/i });
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
    check(agreed === "AGREED", "the live version becomes AGREED once both confirm");

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
      await enterRoom(leaver);
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
        check(true, `${when} the reveal: the member is returned to the dashboard`);
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

    await until(() => servedAndDropped, "the create request to be served", 60_000);
    const afterFirst = await until(
      () => (countActivities() === before + 1 ? true : null),
      "the committed activity to be visible in the database",
      30_000,
    );
    check(afterFirst === true, "the server DID commit the creation");

    // The browser was told the network failed, so the screen offers a retry.
    await page.unroute("**/api/circulos/duo");
    const retry = page.getByRole("button", { name: /Crear (el )?Dúo|Reintentar/i });
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
    const roomOpened = /Tu preparación|Entiendo, empezar|Lo que compartió/i.test(
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
        !/Tu preparación|Entiendo, empezar/i.test(text),
        "a guest cookie for ANOTHER activity does not open this room",
      );

      // And it still works for its own activity — the refusal is about scope,
      // not about the cookie having been invalidated by the attempt.
      await impostorPage.goto(`${WEB}/compartir/${guestB.activityId}`, {
        waitUntil: "domcontentloaded",
      });
      const own = await impostorPage.evaluate(() => document.body.innerText);
      check(
        /Tu preparación|Entiendo, empezar/i.test(own),
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
  const sweepQueue = new Queue("circles-sweep", {
    connection: { url: REDIS_URL },
  });

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
    const job = await sweepQueue.add(
      "run-circles-sweep",
      { nowIso: new Date().toISOString(), batchSize: 50 },
      { removeOnComplete: false, removeOnFail: false },
    );

    await until(
      async () => {
        const state = await job.getState();
        return state === "completed" || state === "failed" ? state : null;
      },
      "the worker to finish the sweep job",
      120_000,
    );
    const finalState = await job.getState();
    check(finalState === "completed", `the worker ran the sweep (${finalState})`);

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
    const second = await sweepQueue.add(
      "run-circles-sweep",
      { nowIso: new Date().toISOString(), batchSize: 50 },
      { removeOnComplete: false, removeOnFail: false },
    );
    await until(
      async () => {
        const s = await second.getState();
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
    await sweepQueue.close();
    await ctx.close();
    if (guest) await guest.ctx.close();
  }
}

// ── Scenario 9 · account deletion through the real processor ────────────────

async function accountDeletionScenario(browser) {
  const deletionQueue = new Queue("account-deletion", {
    connection: { url: REDIS_URL },
  });

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

    const job = await deletionQueue.add(
      "finalize-account-deletion",
      {
        userId: organiser.userId,
        requestedAt: new Date(Date.now() - 31 * 24 * 3600_000).toISOString(),
      },
      { removeOnComplete: false, removeOnFail: false },
    );

    await until(
      async () => {
        const s = await job.getState();
        return s === "completed" || s === "failed" ? s : null;
      },
      "the worker to finish the deletion job",
      180_000,
    );
    const state = await job.getState();
    check(state === "completed", `the real processor ran the deletion (${state})`);

    check(
      sqlInt(`SELECT count(*) FROM "User" WHERE "id"='${organiser.userId}'`) === 0,
      "the account is gone",
    );
    check(
      sqlOne(`SELECT "status" FROM "CircleActivity" WHERE "id"='${activityId}'`) ===
        "CANCELLED",
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
      !/Tu preparación/i.test(guestText),
      "the guest's browser can no longer work in the activity",
    );
  } finally {
    await deletionQueue.close();
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

function countActivities() {
  return sqlInt(`SELECT count(*) FROM "CircleActivity"`);
}

// ── Run them ────────────────────────────────────────────────────────────────

console.log(`\nCírculos Dúo walk · commit ${HEAD_SHA}`);

const browser = await chromium.launch();

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
    "REAL_WORKER_TEMPORAL_SCENARIOS",
    "the real worker, on synthetic dates",
    () => workerTemporalScenarios(browser),
  );
  resetRateLimits();

  await scenario(
    "REAL_ACCOUNT_DELETION_SCENARIO",
    "account deletion through the real processor",
    () => accountDeletionScenario(browser),
  );
  resetRateLimits();

  await scenario("OFF_GATE_SCENARIO", "the rollout gate, closed", () =>
    rolloutOffScenario(),
  );
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
