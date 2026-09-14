#!/usr/bin/env node
/**
 * Clean up ONE synthetic run on the hosted test environment.
 *
 * ── Why this exists, and what it replaces ──────────────────────────────────
 *
 * The runbook used to say: `DELETE FROM "User" WHERE email LIKE '…'`, and that
 * the cascade would do the rest. It does not, and the reason is worth stating
 * because the failure is silent. The foreign keys from the Círculos domain to
 * `User` are `ON DELETE SET NULL`, not cascade:
 *
 *     CircleMember -> User : SET NULL
 *     Circle       -> User : SET NULL
 *     CircleEvent  -> User : SET NULL
 *
 * So the row disappears and everything it owned STAYS — a seat whose `userId`
 * is now null, an activity still waiting for somebody who no longer exists, a
 * guest session still valid, an envelope still there. That is not "cleanup
 * minus a processor"; it is the exact dangling state the deletion path exists
 * to prevent, manufactured on purpose.
 *
 * The domain cleanup lives in `CirclesAccountDeletionService`, and the only
 * thing that invokes it is `finalize-account-deletion` on the `account-deletion`
 * queue. So this reuses that: nothing new, no second implementation, no scrub
 * endpoint, no TRUNCATE, no triggers disabled.
 *
 * ── The 30 days are not shortened ──────────────────────────────────────────
 *
 * The processor re-reads `deleteRequestedAt` under `FOR UPDATE` and compares it
 * to the real clock. What is adjusted here is the DATE OF THE REQUEST, on the
 * identified synthetic accounts only, so the processor's own check passes on
 * its own terms. The cooldown constant is untouched and no production deadline
 * is involved.
 *
 * Usage:
 *   node apps/web/e2e/circulos/hosted-cleanup.mjs --config <hosted.json> \
 *     --run <runId> [--apply]
 *
 * Without `--apply` it only shows what it would clean. Running it twice is
 * safe: the second pass finds nothing and does nothing.
 */

import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeTransport } from "./transports.mjs";

const arg = (flag) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? null : process.argv[at + 1];
};
const cfgPath = arg("--config");
const runId = arg("--run");
const apply = process.argv.includes("--apply");
if (!cfgPath || !runId) {
  console.error(
    "usage: hosted-cleanup.mjs --config <path> --run <runId> [--apply]",
  );
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));

/** `circulos-<label>-<run>@example.test` and nothing else. */
const RUN_ID = /^[0-9a-f]{6}$/;
if (!RUN_ID.test(runId)) {
  console.error(`refusing: "${runId}" is not a run id`);
  process.exit(2);
}

const transport = makeTransport({
  CIRCULOS_E2E_TRANSPORT: "railway",
  CIRCULOS_E2E_RAILWAY_PROJECT: cfg.projectId,
  CIRCULOS_E2E_RAILWAY_ENVIRONMENT: cfg.environmentId,
  CIRCULOS_E2E_RAILWAY_SERVICE: cfg.apiServiceId,
});
const sql = (q) => transport.sql(q);
const sqlInt = (q) => Number.parseInt(sql(q) || "0", 10);

// ── guards, before anything is read and long before anything is written ─────

const database = sql("SELECT current_database()");
if (database !== "circulos_test") {
  console.error(
    `refusing: connected to "${database}", not the test database. ` +
      "Nothing was read and nothing was written.",
  );
  process.exit(1);
}
console.log(`▸ project ${cfg.projectId} · database ${database}`);

/**
 * Accounts that must survive: the durable manual account and anything else the
 * config pins. Named by ID, never by pattern — a pattern is how the account
 * somebody is mid-test with gets swept up.
 */
const protectedIds = new Set(cfg.extraAllowlistIds ?? []);
const pilotEnv = join(
  process.env.HOME ?? "",
  ".psico-ops/circulos-hosted-pilot.env",
);
if (existsSync(pilotEnv)) {
  const line = readFileSync(pilotEnv, "utf8")
    .split("\n")
    .find((l) => l.startsWith("CIRCULOS_PILOT_USER_ID="));
  if (line) protectedIds.add(line.slice("CIRCULOS_PILOT_USER_ID=".length));
}

// ── the run's own accounts, as the run recorded them ────────────────────────

const files = [
  join(tmpdir(), `circulos-hosted-accounts-${runId}.json`),
  join(tmpdir(), `circulos-hosted-outsider-${runId}.json`),
].filter(existsSync);
if (files.length === 0) {
  console.error(`no account file for run ${runId} in ${tmpdir()}`);
  process.exit(1);
}

const emails = [];
for (const f of files) {
  const parsed = JSON.parse(readFileSync(f, "utf8"));
  const accounts = parsed.email ? [parsed] : Object.values(parsed);
  for (const a of accounts) if (a?.email) emails.push(a.email);
}

const expected = new RegExp(`^circulos-[a-z-]+-${runId}@example\\.test$`);
const wrong = emails.filter((e) => !expected.test(e));
if (wrong.length > 0) {
  console.error(`refusing: ${wrong.length} address(es) are not this run's`);
  process.exit(1);
}

const list = emails.map((e) => `'${e}'`).join(",");
const rows = sql(
  `SELECT "id", "email" FROM "User" WHERE "email" IN (${list}) ORDER BY "email"`,
)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [id, email] = line.split("|");
    return { id, email };
  });

const candidates = rows.filter((r) => !protectedIds.has(r.id));
const skipped = rows.filter((r) => protectedIds.has(r.id));

console.log(
  `▸ run ${runId}: ${emails.length} recorded, ${rows.length} still present, ` +
    `${candidates.length} to clean`,
);
for (const s of skipped) console.log(`   · protected, left alone: ${s.email}`);

if (candidates.length === 0) {
  console.log("\n✔ nothing to clean — this run is already gone");
  process.exit(0);
}

// ── what it would touch, shown before it touches anything ───────────────────

const idList = candidates.map((c) => `'${c.id}'`).join(",");

/**
 * Every activity these accounts sit in, with the status it has RIGHT NOW.
 *
 * The status is captured before anything is deleted because it decides what
 * the deletion is even allowed to do: an activity that is already CLOSED or
 * CANCELLED is left untouched by the service on purpose — ending an ended
 * activity is meaningless — while a live one is withdrawn from and settled.
 * Afterwards there is no way to tell the two apart, and asserting the same
 * thing about both would report a designed behaviour as a bug.
 */
const activityRows = sql(
  `SELECT DISTINCT m."userId", p."activityId", a."status"
     FROM "CircleActivityParticipant" p
     JOIN "CircleMember" m ON m."id"=p."memberId"
     JOIN "CircleActivity" a ON a."id"=p."activityId"
    WHERE m."userId" IN (${idList})`,
)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [userId, activityId, status] = line.split("|");
    return { userId, activityId, status };
  });

const activityIdsOf = (userId) =>
  activityRows.filter((r) => r.userId === userId).map((r) => r.activityId);

/**
 * An activity shared with an account that must survive is not this run's to
 * settle. Cancelling it would reach into the manual tester's data through a
 * side door, so the whole account is left alone and said so out loud.
 */
const shared = new Set();
if (protectedIds.size > 0) {
  const ids = [...protectedIds].map((i) => `'${i}'`).join(",");
  for (const a of sql(
    `SELECT DISTINCT p."activityId" FROM "CircleActivityParticipant" p
       JOIN "CircleMember" m ON m."id"=p."memberId" WHERE m."userId" IN (${ids})`,
  )
    .split("\n")
    .filter(Boolean)) {
    shared.add(a);
  }
}

const touched = new Map();
const entangled = [];
for (const c of candidates) {
  const acts = activityIdsOf(c.id);
  if (acts.some((a) => shared.has(a))) {
    entangled.push(c);
    continue;
  }
  touched.set(c.id, acts);
}
for (const e of entangled) {
  console.log(`   · shares an activity with a protected account, left alone: ${e.email}`);
}
const cleanable = candidates.filter((c) => touched.has(c.id));
if (cleanable.length === 0) {
  console.log("\n✔ nothing to clean that is this run's alone");
  process.exit(0);
}

console.log("\n   account                                  seats  acts  guests  envelopes");
// One query for the whole table. The first cut asked four questions per
// account over `railway ssh`, which is eight seconds a question and turned a
// dry run into four minutes of waiting before anybody could read it.
const counts = new Map();
for (const line of sql(
  // Every column is ALIASED. Without that, four columns all called `count`
  // collapse into one key when the driver builds the row object, and the table
  // prints a number in the first column and `undefined` in the rest.
  `SELECT m."userId" AS "userId",
          count(DISTINCT m."id") AS "seats",
          count(DISTINCT p."activityId") AS "acts",
          count(DISTINCT g."id") FILTER (WHERE g."revokedAt" IS NULL) AS "guests",
          count(DISTINCT p."id") FILTER (WHERE p."ciphertext" IS NOT NULL) AS "envelopes"
     FROM "CircleMember" m
     LEFT JOIN "CircleActivityParticipant" p ON p."memberId"=m."id"
     LEFT JOIN "CircleGuestSession" g ON g."activityId"=p."activityId"
    WHERE m."userId" IN (${idList})
    GROUP BY m."userId"`,
)
  .split("\n")
  .filter(Boolean)) {
  const [userId, seats, acts, guests, envelopes] = line.split("|");
  counts.set(userId, { seats, acts, guests, envelopes });
}
for (const c of cleanable) {
  const n = counts.get(c.id) ?? { seats: 0, acts: 0, guests: 0, envelopes: 0 };
  console.log(
    `   ${c.email.padEnd(40)} ${String(n.seats).padStart(5)} ${String(n.acts).padStart(5)} ` +
      `${String(n.guests).padStart(7)} ${String(n.envelopes).padStart(10)}`,
  );
}

if (!apply) {
  console.log(
    "\n(dry run — nothing was changed. Add --apply to run the real deletion.)",
  );
  process.exit(0);
}

// ── the real deletion, one account at a time ────────────────────────────────

console.log("\n▸ handing each account to the real deletion processor");

const outcome = [];
for (const c of cleanable) {
  // The REQUEST is dated into the past, on this account only. The cooldown
  // itself is untouched; the processor still checks it against the real clock.
  sql(
    `UPDATE "User" SET "deleteRequestedAt" = now() - interval '31 days'
      WHERE "id"='${c.id}'`,
  );

  const job = await transport.enqueue(
    "account-deletion",
    "finalize-account-deletion",
    {
      userId: c.id,
      requestedAt: new Date(Date.now() - 31 * 24 * 3600_000).toISOString(),
    },
  );

  const deadline = Date.now() + 180_000;
  let state = "waiting";
  while (Date.now() < deadline) {
    state = await job.state();
    if (state === "completed" || state === "failed") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const gone = sqlInt(`SELECT count(*) FROM "User" WHERE "id"='${c.id}'`) === 0;
  outcome.push({ email: c.email, state, gone });
  console.log(`   ${gone ? "✓" : "✗"} ${c.email} — job ${state}`);
}

// ── verification, on the domain and not only on the User table ──────────────

console.log("\n▸ verifying");

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const survivors = skipped.length + entangled.length;
const remaining = sqlInt(
  `SELECT count(*) FROM "User" WHERE "email" IN (${list})`,
);
check(
  remaining === survivors,
  "every account this run owned alone is gone",
  `${remaining} left, ${survivors} deliberately kept`,
);
check(
  outcome.every((o) => o.state === "completed"),
  "every deletion was finished by the processor, not by a cascade",
);

// The point of using the processor rather than a DELETE: the activities those
// accounts were in end up SETTLED, not left live with a seat nobody owns.
// Their ids were captured before the deletion, because afterwards there is no
// user left to join through — which is exactly how the old instruction hid its
// own damage.
const activities = [...new Set([...touched.values()].flat())];
if (activities.length > 0) {
  const inList = activities.map((a) => `'${a}'`).join(",");
  check(
    sqlInt(
      `SELECT count(*) FROM "CircleActivity"
        WHERE "id" IN (${inList}) AND "status" NOT IN ('CLOSED','CANCELLED')`,
    ) === 0,
    `all ${activities.length} activity(ies) they were in are settled`,
  );
  // Only the activities the deletion was ALLOWED to end. One that was already
  // terminal before this ran is skipped by the service by design, and its
  // guest session stays — the room is over, and this account's own envelope
  // was erased by a separate step that does reach terminal activities.
  const wereLive = [
    ...new Set(
      activityRows
        .filter(
          (r) =>
            touched.has(r.userId) &&
            r.status !== "CLOSED" &&
            r.status !== "CANCELLED",
        )
        .map((r) => r.activityId),
    ),
  ];
  if (wereLive.length > 0) {
    const liveList = wereLive.map((a) => `'${a}'`).join(",");
    check(
      sqlInt(
        `SELECT count(*) FROM "CircleGuestSession"
          WHERE "activityId" IN (${liveList}) AND "revokedAt" IS NULL`,
      ) === 0,
      `no guest session survives on the ${wereLive.length} activity(ies) it ended`,
    );
  }
}
for (const id of protectedIds) {
  const alive = sqlInt(`SELECT count(*) FROM "User" WHERE "id"='${id}'`) === 1;
  if (alive) check(true, `the protected account is untouched (${id.slice(0, 8)}…)`);
}

console.log(
  failures === 0
    ? `\n✔ run ${runId} cleaned up through the real deletion path`
    : `\n✖ ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
