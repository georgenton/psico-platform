#!/usr/bin/env node
/**
 * Negative controls for the pilot-readiness guarantees.
 *
 * A passing test proves nothing on its own: it might assert something that
 * cannot fail. Each control here breaks the PRODUCTION code the guarantee lives
 * in and requires the NAMED test to go red for it, then restores the file
 * byte-for-byte and requires green again.
 *
 * What counts as a detection is deliberately narrow:
 *
 *   · the file must actually change (sha compared before and after — a `find`
 *     string that silently matched nothing is a failed control, not a pass);
 *   · the named filter must select at least one test (vitest `-t` is a REGEX,
 *     and a pattern with unescaped parentheses selects NOTHING and exits 0 —
 *     which would score a no-op as a detection);
 *   · a compile error, a timeout or a crash is a FAILED control. Those prove
 *     the file was broken, not that the assertion was watching.
 *
 * Usage:
 *   node src/circles/negative-controls.mjs            # all of them
 *   node src/circles/negative-controls.mjs --only=RATE  # substring filter
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = resolve(API, "../web");

const PG_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:55440/psico_locks";

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
/** vitest `-t` is a regex. An unescaped `(` matches nothing and exits 0. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const f = (rel) => resolve(API, rel);
const w = (rel) => resolve(WEB, rel);

/** Which runner, and therefore which working directory and config. */
const UNIT = "unit"; // apps/api, default vitest config
const PGSPEC = "pg"; // apps/api, vitest.locks.config.ts, real PostgreSQL
const WEBT = "web"; // apps/web

const CONTROLS = [
  // ── The account deletion decides under authority, then acts ──────────────
  {
    property: "DELETION_AUTHORITY_BEFORE_FIRST_MUTATION",
    mutation: "the cleanup runs before the request has been revalidated",
    file: f("src/jobs/processors/account-deletion.processor.ts"),
    // Genuinely REORDERS authority and effect: the cancellation check moves to
    // after the cleanup has already run. Duplicating the cleanup would not do
    // it — on the cancelled path the code returns before reaching that line at
    // all, so the mutation has to move the check past the effect.
    find:
      '        if (!row.deleteRequestedAt) {\n' +
      '          return { deleted: false as const, reason: "cancelled" as const };\n' +
      "        }\n" +
      "        if (Date.now() - row.deleteRequestedAt.getTime() < this.COOLDOWN_MS) {\n" +
      "          return {\n" +
      "            deleted: false as const,\n" +
      '            reason: "cooldown-restarted" as const,\n' +
      "          };\n" +
      "        }\n\n" +
      "        // Only past this point does anything change.\n" +
      "        const circles = await this.circles.detachUser(userId, tx as never);",
    replace:
      "        if (\n" +
      "          Date.now() - (row.deleteRequestedAt?.getTime() ?? 0) <\n" +
      "          this.COOLDOWN_MS\n" +
      "        ) {\n" +
      "          return {\n" +
      "            deleted: false as const,\n" +
      '            reason: "cooldown-restarted" as const,\n' +
      "          };\n" +
      "        }\n\n" +
      "        const circles = await this.circles.detachUser(userId, tx as never);\n" +
      "        if (!row.deleteRequestedAt) {\n" +
      '          return { deleted: false as const, reason: "cancelled" as const };\n' +
      "        }",
    runner: UNIT,
    test: "src/jobs/processors/account-deletion.processor.spec.ts",
    t: "touches NOTHING in Círculos when the cancellation wins",
  },
  {
    property: "CANCELLATION_BEATS_A_LATE_JOB",
    mutation: "the cooldown restart is no longer checked",
    file: f("src/jobs/processors/account-deletion.processor.ts"),
    find: "if (Date.now() - row.deleteRequestedAt.getTime() < this.COOLDOWN_MS) {",
    replace: "if (false) {",
    runner: UNIT,
    test: "src/jobs/processors/account-deletion.processor.spec.ts",
    t: "does NOT delete when the cooldown restarted mid-job",
  },
  {
    property: "CONCURRENT_CREATE_DURING_DELETION_ABORTS",
    mutation: "a Dúo that raced in after the inventory is ignored",
    file: f("src/jobs/processors/account-deletion.processor.ts"),
    find: "if (live > 0) {",
    replace: "if (false) {",
    runner: UNIT,
    test: "src/jobs/processors/account-deletion.processor.spec.ts",
    t: "aborts when a Dúo appeared after the inventory was taken",
  },

  // ── What the deletion actually erases, against real PostgreSQL ───────────
  {
    property: "TERMINAL_ENVELOPES_PURGED",
    mutation: "envelopes in already-closed activities are left behind",
    file: f("src/circles/circles-account-deletion.service.ts"),
    find: "const envelopesPurged = await this.eraseEnvelopes(memberIds, tx);",
    replace: "const envelopesPurged = 0;",
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "purges the envelope in an activity that was already CLOSED",
  },
  {
    property: "DELETION_TAKES_THE_CANONICAL_LOCK_ORDER",
    mutation: "the member lock is dropped from the chain",
    file: f("src/circles/circles-account-deletion.service.ts"),
    find:
      "      // 1 · the member whose seat this is\n" +
      "      await this.members.lockById(seat.memberId, tx);",
    replace: "      // (member lock removed)",
    // Retargeted at the sequence test, not the PostgreSQL wait test. Removing
    // a lock leaves the wait test green: PostgreSQL serialises the two
    // transactions on the rows the deletion writes anyway, so "it waits" holds
    // whether or not the lock was asked for in the agreed order. Order is a
    // claim about a SEQUENCE, and that is where it is now pinned.
    runner: UNIT,
    test: "src/circles/circles-account-deletion.lock-order.spec.ts",
    t: "takes member → invitations → guest sessions → activity",
  },
  {
    property: "LEDGER_SCRUB_NEEDS_THE_ACCOUNT_GONE",
    mutation: "the append-only exception drops its authorisation clause",
    file: f(
      "prisma/migrations/20260913000000_circles_account_deletion/migration.sql",
    ),
    // Must LOOSEN the rule. Replacing the inner SELECT made
    // `NOT EXISTS (SELECT 1)` always false — which refuses MORE, so the test
    // asserting a refusal stayed green. Dropping the whole clause is the
    // mutation that actually removes the authorisation requirement.
    find:
      '     AND NOT EXISTS (\n' +
      '       SELECT 1 FROM public."User" u WHERE u."id" = OLD."actorUserId"\n' +
      "     )",
    replace: "     AND TRUE",
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "refuses the scrub SHAPE while the account still exists",
  },

  // ── The clock may only decide two things ─────────────────────────────────
  {
    property: "SWEEP_NEVER_CLOSES_A_FOLLOW_UP",
    mutation: "a due date is allowed to close a follow-up nobody decided",
    file: f("src/circles/circles-sweep.service.ts"),
    // Widening the status alone was not enough: `openFollowUpIfDue` on an
    // activity already in FOLLOW_UP is a no-op, so nothing closed and the test
    // stayed green. This replaces the transition with a real close.
    find:
      '    const due = await this.prisma.circleActivity.findMany({\n' +
      "      where: {\n" +
      '        status: "REVEALED",\n' +
      "        followUpDueAt: { not: null, lte: now },\n" +
      "      },\n" +
      "      select: { id: true },\n" +
      '      orderBy: { id: "asc" },\n' +
      "      take: batchSize,\n" +
      "    });\n\n" +
      "    if (dryRun) return due.length;\n\n" +
      "    let opened = 0;\n" +
      "    for (const activity of due) {\n" +
      "      const moved = await this.activities.openFollowUpIfDue(\n" +
      "        activity.id,\n" +
      "        now,\n" +
      "        this.prisma as never,\n" +
      "      );\n" +
      "      if (moved) opened += 1;\n" +
      "    }\n" +
      "    return opened;",
    replace:
      "    const due = await this.prisma.circleActivity.findMany({\n" +
      "      where: {\n" +
      '        status: { in: ["REVEALED", "FOLLOW_UP"] },\n' +
      "        followUpDueAt: { not: null, lte: now },\n" +
      "      },\n" +
      "      select: { id: true },\n" +
      '      orderBy: { id: "asc" },\n' +
      "      take: batchSize,\n" +
      "    });\n\n" +
      "    if (dryRun) return due.length;\n\n" +
      "    let opened = 0;\n" +
      "    for (const activity of due) {\n" +
      "      await this.prisma.circleActivity.update({\n" +
      "        where: { id: activity.id },\n" +
      '        data: { status: "CLOSED" },\n' +
      "      });\n" +
      "      opened += 1;\n" +
      "    }\n" +
      "    return opened;",
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "NEVER closes a follow-up just because its date arrived",
  },
  {
    property: "SWEEP_IS_IDEMPOTENT",
    mutation:
      "both re-entry guards are removed — the selection re-picks a cancelled " +
      "activity AND the status guard lets it be cancelled again",
    file: f("src/circles/circles-sweep.service.ts"),
    // TWO edits, because idempotency here is over-determined: the outer query
    // only selects `INVITING`, and the inner `cancel` is status-guarded to
    // `INVITING` as well. Disabling either one alone leaves the sweep
    // idempotent — which is defence in depth working, not a test that fails to
    // watch. Falsifying the property therefore requires removing both, and a
    // control that could not falsify it would prove nothing.
    edits: [
      {
        find: '        status: "INVITING",\n        invitations: {',
        replace:
          '        status: { in: ["INVITING", "CANCELLED"] },\n' +
          "        invitations: {",
      },
      { find: '["INVITING"],', replace: '["INVITING", "CANCELLED"],' },
    ],
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "is idempotent, and two concurrent passes do not double up",
  },
  {
    property: "OFF_DISABLES_THE_SWEEP",
    mutation: "the rollout gate is removed from the sweep",
    file: f("src/circles/circles-sweep.service.ts"),
    find: 'currentMode() === "off"',
    replace: "false",
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "does nothing at all while the rollout is off",
  },

  // ── The rate limiter buckets by network client, and fails closed ─────────
  {
    property: "RATE_LIMIT_IGNORES_RAW_PROXY_HEADERS",
    mutation: "the tracker falls back to reading X-Forwarded-For itself",
    file: f("src/shared/throttler/attested-client-throttler.guard.ts"),
    find: 'return `ip:${String(req.ip ?? "unknown")}`;',
    replace:
      'const xff = req.headers?.["x-forwarded-for"];\n' +
      '    if (typeof xff === "string") return `ip:${xff.split(",")[0]?.trim()}`;\n' +
      '    return `ip:${String(req.ip ?? "unknown")}`;',
    runner: UNIT,
    test: "src/shared/throttler/attested-client-throttler.spec.ts",
    t: "does NOT read X-Forwarded-For or X-Real-IP itself",
  },
  {
    property: "ATTESTATION_SIGNATURE_IS_VERIFIED",
    mutation: "a forged claim is accepted without checking its signature",
    file: f("src/shared/throttler/client-attestation.ts"),
    find:
      "if (!sameSignature(signature, expected)) {\n" +
      '    return { clientId: null, rejected: "bad-signature" };\n' +
      "  }",
    replace: "void expected;",
    runner: UNIT,
    test: "src/shared/throttler/attested-client-throttler.spec.ts",
    t: "ignores one signed with the wrong secret",
  },
  {
    property: "RATE_LIMIT_FAILS_CLOSED",
    mutation: "a storage failure is waved through instead of refused",
    file: f("src/shared/throttler/attested-client-throttler.guard.ts"),
    find: 'this.logger.error("rate-limit store unavailable — refusing");',
    replace:
      'this.logger.error("rate-limit store unavailable");\n      return true;',
    runner: UNIT,
    test: "src/shared/throttler/attested-client-throttler.spec.ts",
    t: "turns a storage failure into 503 RATE_LIMIT_UNAVAILABLE",
  },

  // ── The guest path the browser walk found broken ─────────────────────────
  {
    property: "ACCEPTANCE_IS_EXPLICIT",
    mutation: "the explicit acceptance flag is dropped from the request",
    file: w("src/lib/circulos/bff.ts"),
    find: "body: { secret, accept: true }",
    replace: "body: { secret }",
    runner: WEBT,
    test: "src/app/api/circulos/handlers.test.ts",
    t: "sends the explicit accept:true the API requires to consume an invitation",
  },
  {
    property: "GUEST_SECRET_USES_ITS_OWN_HEADER",
    mutation: "the guest secret travels as a bearer token again",
    file: w("src/lib/circulos/bff.ts"),
    find:
      "  if (init.guestToken) {\n" +
      "    headersOut.set(GUEST_SESSION_HEADER, init.guestToken);\n" +
      "  }",
    replace:
      "  if (init.guestToken) {\n" +
      "    headersOut.set(\"Authorization\", `Bearer ${init.guestToken}`);\n" +
      "  }",
    runner: WEBT,
    test: "src/lib/circulos/bff.test.ts",
    t: "never sends a guest secret as a bearer token",
  },
];

function runTest(c) {
  const cwd = c.runner === WEBT ? WEB : API;
  const cfg =
    c.runner === PGSPEC ? ["--config", "vitest.locks.config.ts"] : [];
  const env =
    c.runner === PGSPEC
      ? { ...process.env, TEST_DATABASE_URL: PG_URL }
      : process.env;

  try {
    const out = execFileSync(
      "npx",
      [
        "vitest",
        "run",
        ...cfg,
        c.test,
        "-t",
        escapeRe(c.t),
        "--reporter=basic",
      ],
      {
        cwd,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 900_000,
      },
    );
    return { code: 0, out };
  } catch (err) {
    if (err.killed || err.signal) return { code: -1, out: "TIMEOUT" };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/**
 * How many tests actually RAN.
 *
 * Zero is the dangerous case: a filter that selects nothing exits 0 and looks
 * exactly like a pass.
 */
function ranCount(out) {
  const m = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(?:(\d+)\s+passed)?/.exec(out);
  if (!m) return 0;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) : 0);
}

const results = [];
let passed = 0;

for (const c of CONTROLS) {
  if (only && !c.property.includes(only)) continue;

  const original = readFileSync(c.file, "utf8");
  const before = sha(c.file);
  let why = "";

  // 1 · the named test must be green and must actually select something.
  const pre = runTest(c);
  const preRan = ranCount(pre.out);
  if (pre.code !== 0 || preRan === 0) {
    why =
      preRan === 0
        ? "the -t filter selected NO tests"
        : `baseline was not green (exit ${pre.code})`;
    results.push({ ...c, ok: false, why });
    console.log(`FAIL  ${c.property} — ${why}`);
    continue;
  }

  // 2 · break it, and prove the file really changed.
  //
  // Some properties are held up by more than one guard, and a mutation that
  // removes only one of them cannot falsify the property at all. Those
  // controls list several edits; EVERY one must match, or the control fails
  // rather than quietly applying a partial mutation.
  const edits = c.edits ?? [{ find: c.find, replace: c.replace }];
  let mutated = original;
  let allMatched = true;
  for (const edit of edits) {
    if (!mutated.includes(edit.find)) {
      allMatched = false;
      break;
    }
    mutated = mutated.replace(edit.find, edit.replace);
  }
  if (!allMatched) {
    why = "a find string is not present — the mutation would be a no-op";
    results.push({ ...c, ok: false, why });
    console.log(`FAIL  ${c.property} — ${why}`);
    continue;
  }
  writeFileSync(c.file, mutated);
  const applied = sha(c.file) !== before;

  let red = false;
  if (!applied) {
    why = "the file did not change";
  } else {
    const broken = runTest(c);
    const ran = ranCount(broken.out);
    red = broken.code > 0 && ran > 0 && !/TIMEOUT/.test(broken.out);
    if (!red) {
      why =
        broken.code === -1
          ? "timed out — not a detection"
          : ran === 0
            ? "no tests ran while mutated"
            : /error TS\d|Cannot find module|SyntaxError/.test(broken.out)
              ? "compile error — proves the file broke, not that the test watched"
              : "STAYED GREEN — the assertion does not cover this";
    }
  }

  // 3 · restore, byte for byte, and require green again.
  writeFileSync(c.file, original);
  const restored = sha(c.file) === before;

  let green = false;
  if (applied && red && restored) {
    const after = runTest(c);
    green = after.code === 0 && ranCount(after.out) > 0;
    if (!green) why = "did not return to green after restore";
  }

  const ok = applied && red && restored && green;
  if (ok) passed += 1;
  results.push({ ...c, ok, why });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.property}` +
      `  [changed=${applied} red=${red} restored=${restored} green=${green}]` +
      (ok ? "" : `  ← ${why}`),
  );
}

console.log(`\nNEGATIVE_CONTROLS ${passed}/${results.length}\n`);
console.log("| property | mutation applied | test that must fail | result |");
console.log("|---|---|---|---|");
for (const r of results) {
  console.log(
    `| \`${r.property}\` | ${r.mutation} | \`${r.t}\` | ${r.ok ? "**RED**, then green on restore" : `FAILED — ${r.why}`} |`,
  );
}

process.exit(passed === results.length ? 0 : 1);
