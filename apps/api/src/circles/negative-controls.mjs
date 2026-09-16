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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One redactor, shared with the harness whose output this stores. A second
// implementation here would be a second list of what counts as a credential,
// and the two would drift in the direction that does not fail anything.
import { redactDiagnostics } from "../../../web/e2e/circulos/redact.mjs";

const API = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = resolve(API, "../web");
const ROOT = resolve(API, "../..");

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
/**
 * The full-stack browser walk.
 *
 * Expensive — each invocation builds and runs the whole stack — so it is used
 * only where nothing cheaper can see the property. A reveal barrier is a claim
 * about what the OTHER person's screen shows, and no unit test renders the
 * other person's screen.
 */
const WALK = "walk"; // apps/web/e2e/circulos/stack.mjs

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
      "        if (!row.deleteRequestedAt) {\n" +
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
      "     AND NOT EXISTS (\n" +
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
      "    const due = await this.prisma.circleActivity.findMany({\n" +
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
      '    headersOut.set("Authorization", `Bearer ${init.guestToken}`);\n' +
      "  }",
    runner: WEBT,
    test: "src/lib/circulos/bff.test.ts",
    t: "never sends a guest secret as a bearer token",
  },

  // ── What this round added ────────────────────────────────────────────────
  {
    property: "WITHDRAWAL_IS_POSSIBLE_AT_ALL",
    mutation: "the command wrapper demands a payload key again",
    file: w("src/app/api/circulos/actividad/[activityId]/comando/route.ts"),
    find: '  if (!onlyKeys(raw, ["kind", "idempotencyKey", "payload"])) {',
    replace: '  if (!exactKeys(raw, ["kind", "idempotencyKey", "payload"])) {',
    runner: WEBT,
    test: "src/app/api/circulos/handlers.test.ts",
    t: "accepts a withdrawal, whose body carries no payload key at all",
  },
  {
    property: "COMMAND_WRAPPER_STAYS_CLOSED",
    mutation: "unknown keys in the wrapper are tolerated",
    file: w("src/app/api/circulos/actividad/[activityId]/comando/route.ts"),
    find: "function onlyKeys(obj: Record<string, unknown>, keys: string[]): boolean {\n  return Object.keys(obj).every((k) => keys.includes(k));",
    replace:
      "function onlyKeys(obj: Record<string, unknown>, keys: string[]): boolean {\n  void keys;\n  void obj;\n  return true;",
    runner: WEBT,
    test: "src/app/api/circulos/handlers.test.ts",
    t: "still refuses an unknown key in the wrapper",
  },
  {
    property: "TEARDOWN_SPARES_A_REUSED_PID",
    mutation: "the start time is dropped from the identity check",
    file: w("e2e/circulos/ownership.mjs"),
    find: "  if (observedStart === null || observedStart === undefined) return false;\n  return observedStart === service.lstart;",
    replace:
      "  if (observedStart === null || observedStart === undefined) return false;\n  return true;",
    runner: WEBT,
    test: "src/lib/circulos/stack-ownership.test.ts",
    t: "SPARES a live pid whose start time does not match",
  },
  {
    property: "TEARDOWN_READS_A_ZOMBIE_AS_GONE",
    mutation: "a reaped-but-unwaited child counts as still running",
    file: w("e2e/circulos/ownership.mjs"),
    find: '  if (state.startsWith("Z")) return null;',
    replace: "  void state;",
    runner: WEBT,
    test: "src/lib/circulos/stack-ownership.test.ts",
    t: "reads a ZOMBIE as gone, not as running",
  },
  {
    property: "TEARDOWN_NAMES_ONLY_WHAT_IT_OWNS",
    mutation: "the owned-resource list is replaced by a glob",
    file: w("e2e/circulos/ownership.mjs"),
    find: "    containers: [...(state?.containers ?? [])],",
    replace: '    containers: ["circulos-e2e-*"],',
    runner: WEBT,
    test: "src/lib/circulos/stack-ownership.test.ts",
    t: "names only the containers and directories the run recorded",
  },
  {
    property: "REAL_DELETION_RACE_IS_OBSERVED",
    mutation:
      "the deletion stops erasing the envelope the racing guest just committed",
    file: f("src/circles/circles-account-deletion.service.ts"),
    // Removing the activity LOCK does not falsify this test, and that is worth
    // knowing rather than hiding: the deletion writes those same rows moments
    // later, so it still queues behind the guest and `pg_blocking_pids` still
    // names them. The property the race actually establishes is the payoff —
    // the guest's confirmation commits, and the deletion then erases what it
    // produced. So the mutation removes the purge of the racing counterpart's
    // envelope, which is the only thing that clears the guest's snapshot here.
    find:
      "        for (const other of others) {\n" +
      "          await this.participants.purgeEnvelope(other.id, seat.activityId, tx);\n" +
      "        }",
    replace: "        void others;",
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "the guest acquires first: the deletion waits, then cleans up what the guest committed",
  },
  {
    property: "OWN_DRAFTS_ARE_ACTUALLY_PURGED",
    mutation:
      "the purge quietly skips proposals and only reaches superseded drafts",
    file: f("src/circles/circle-artifact.repository.ts"),
    // The commonest way this policy would rot: narrowing the status filter so
    // the visible draft — the one the counterpart can still see — survives,
    // while the historical versions are cleaned and the counts still look
    // plausible.
    find: `          status: { in: ["PROPOSED", "SUPERSEDED"] },`,
    replace: `          status: { in: ["SUPERSEDED"] },`,
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "purges the content of a PROPOSED artifact the deleted account wrote",
  },
  {
    property: "AGREEMENTS_SURVIVE_THE_AUTHOR",
    mutation: "the purge also takes agreements the deleted account wrote",
    file: f("src/circles/circle-artifact.repository.ts"),
    // The opposite failure, and the worse one: it destroys the counterpart's
    // copy of something they confirmed. The database refuses it too, so this
    // control also proves the service filter is not the only thing standing
    // between an agreement and deletion.
    find: `          status: { in: ["PROPOSED", "SUPERSEDED"] },`,
    replace: `          status: { in: ["PROPOSED", "SUPERSEDED", "AGREED"] },`,
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "keeps an AGREED artifact the deleted account wrote",
  },
  {
    property: "AUTHORSHIP_DECIDES_WHOSE_DRAFT_GOES",
    mutation:
      "artifacts are selected by the ACTIVITY instead of by their author",
    file: f("src/circles/circles-account-deletion.service.ts"),
    // The mistake a Dúo hides best. When one person creates the circle, sends
    // the invitation and writes the proposal, selecting by activity, by circle
    // or by inviter gives the same answer as selecting by author — until the
    // OTHER person writes one. Then it purges their text too.
    find: `    const seats = await tx.circleActivityParticipant.findMany({
      where: { memberId: { in: memberIds } },
      select: { id: true },
    });
    if (seats.length === 0) return 0;
    return this.artifacts.purgeAuthoredBy(
      seats.map((s) => s.id),
      new Date(),
      tx,
    );`,
    replace: `    const mine = await tx.circleActivityParticipant.findMany({
      where: { memberId: { in: memberIds } },
      select: { activityId: true },
    });
    if (mine.length === 0) return 0;
    const everySeatThere = await tx.circleActivityParticipant.findMany({
      where: { activityId: { in: mine.map((s) => s.activityId) } },
      select: { id: true },
    });
    return this.artifacts.purgeAuthoredBy(
      everySeatThere.map((s) => s.id),
      new Date(),
      tx,
    );`,
    runner: PGSPEC,
    test: "src/circles/circles-account-deletion.pg-spec.ts",
    t: "does not touch a draft the COUNTERPART wrote",
  },
  // ── The experience block: help, context, analytics, and the panel ────────
  {
    property: "PREPARED_HELP_NEVER_CALLS_A_MODEL",
    mutation:
      "the help card fetches its text instead of rendering what it was given",
    file: w("src/components/circulos/AyudaEcho.tsx"),
    // The exact shape this would take if somebody "improved" it: a lazy fetch
    // on open. The body would not even have to contain anything — a request
    // whose TIMING says somebody is stuck on a question is the leak, and the
    // walk's listener sees it.
    find: `  const abrir = (next: "explanation" | "example") => {
    setPieza(next);`,
    replace: `  const abrir = (next: "explanation" | "example") => {
    void fetch("/api/eco/help", { method: "POST" });
    setPieza(next);`,
    runner: WEBT,
    test: "src/components/circulos/plantilla-aprobada.test.tsx",
    t: "carries prepared help on every question, and asks nothing of the network",
  },
  {
    property: "OPTIONAL_CONTEXT_IS_NOT_SHARED_BY_DEFAULT",
    mutation: "an optional answer counts as shared the moment it has text",
    file: w("src/components/circulos/PreparacionPrivada.tsx"),
    // The default this replaces was the old behaviour and looks harmless:
    // "share whatever was written". For a question somebody may answer only
    // for themselves, writing it and showing it are different acts.
    find: `  return draft.shared?.[field.fieldKey] ?? field.optional !== true;`,
    replace: `  return draft.shared?.[field.fieldKey] ?? true;`,
    runner: WEBT,
    test: "src/components/circulos/plantilla-aprobada.test.tsx",
    t: "never shares the context by having been typed",
  },
  {
    property: "ANALYTICS_NEEDS_A_YES",
    mutation: "the optional question sends its answer even when declined",
    file: w("src/components/circulos/OpinionOpcional.tsx"),
    // Opt-in collapses into opt-out with one line. The counters would go with
    // it, which is the part nobody would notice: they were gathered during a
    // private preparation.
    find: `            onClick={() => setFase("declinado")}
          >
            No, gracias`,
    replace: `            onClick={() => void enviar()}
          >
            No, gracias`,
    runner: WEBT,
    test: "src/components/circulos/opinion-opcional.test.tsx",
    t: "sends nothing at all when declined",
  },
  {
    property: "DECLINING_IS_NOT_A_TOPIC",
    mutation: "«prefiero no responder» becomes a category of its own",
    file: w("src/components/circulos/OpinionOpcional.tsx"),
    // It reads like a tidy-up and is a substantive change: an omission would
    // start appearing in a distribution as though declining were a kind of
    // situation somebody was in.
    find: `            topics: temas,`,
    replace: `            topics: temas.length > 0 ? temas : ["prefiero-no-responder"],`,
    runner: WEBT,
    test: "src/components/circulos/opinion-opcional.test.tsx",
    t: "treats «prefiero no responder» as an omission, not a category",
  },
  {
    property: "THE_SERVER_DECIDES_WHOSE_CONTRIBUTION_IT_IS",
    mutation:
      "the forwarded body is spread from the request instead of rebuilt",
    file: w("src/app/api/circulos/actividad/[activityId]/feedback/route.ts"),
    // ── Why this control was rewritten ───────────────────────────────────
    //
    // It used to mutate the API facade and run a pg-spec that calls the
    // analytics SERVICE directly — the facade is not in that test's path at
    // all, so no edit to it could ever turn the test red. Worse, the "mutation"
    // appended `void who;` beside a `who` that is still used three lines later:
    // the file changed, the hash moved, and the behaviour did not. A control
    // that cannot fail is not evidence, and this one reported STAYED GREEN and
    // condemned a guarantee that in fact holds.
    //
    // The place a browser's payload is actually stopped is the BFF route, which
    // REBUILDS the body field by field. That is one `...raw` away from a
    // pass-through, and the edit reads like a tidy-up — so that is the
    // mutation, and it goes red on the test written for it.
    find: `  const body = {
    topics: cleanTopics(raw.topics),`,
    replace: `  const body = {
    ...raw,
    topics: cleanTopics(raw.topics),`,
    runner: WEBT,
    test: "src/app/api/circulos/handlers.test.ts",
    t: "rebuilds the body, so nothing unnamed reaches the API",
  },
  {
    property: "SMALL_CELLS_STAY_SUPPRESSED",
    mutation:
      "the threshold drops to one, so a single contributor is reportable",
    file: f("src/circles/circles-analytics.service.ts"),
    // Suppression lives where the data is shaped precisely so the screen and
    // the CSV cannot disagree. Lowering it here lowers it everywhere, which is
    // the point of the control: one number governs both.
    find: `export const CIRCLE_SMALL_CELL_THRESHOLD = 10;`,
    replace: `export const CIRCLE_SMALL_CELL_THRESHOLD = 1;`,
    runner: PGSPEC,
    test: "src/circles/circles-analytics.pg-spec.ts",
    t: "says «insufficient sample» below the threshold, not zero",
  },
  {
    property: "RETENTION_ACTUALLY_DELETES",
    mutation: "the sweep folds the aggregate and keeps the linkable rows",
    file: f("src/circles/circles-analytics.service.ts"),
    // The failure that leaves everything looking right: the panel is correct,
    // the aggregates exist, and nothing was ever deleted.
    find: `      this.prisma.circleFeedback.deleteMany({
        where: { createdAt: { lt: cutoff } },
      }),`,
    replace: `      Promise.resolve({ count: 0 }),`,
    runner: PGSPEC,
    test: "src/circles/circles-analytics.pg-spec.ts",
    t: "turns aged contributions into counts and deletes the rows",
  },
  {
    property: "GUEST_CREDENTIAL_NEVER_REACHES_SENTRY",
    mutation: "the guest session header is dropped from the redaction list",
    file: f("../../packages/types/src/observability-redaction.ts"),
    // A guest has no account, so this header IS the identity. Removing one
    // line from a list is exactly how it would go missing, and nothing would
    // fail — the events would simply start carrying a working key.
    find: `  "x-circle-guest-session",`,
    replace: ``,
    // `@psico/types` resolves through its package exports to `dist/`, so the
    // API imports the BUILT redactor and not the file this control edits.
    // Without a rebuild the mutated source would never reach the test, which
    // would stay green and be scored as "the assertion does not cover this" —
    // a control that condemns a guarantee that in fact holds. The rebuild runs
    // in all three phases so the built artifact matches the source in each.
    rebuild: "types",
    runner: UNIT,
    test: "src/observability/sentry.spec.ts",
    t: "finds none of them anywhere in the serialized event",
  },
  {
    property: "CLOSING_ANNOUNCES_THE_DECISION_ON_SCREEN",
    mutation: "the room stops saying the decision was recorded",
    file: w("src/components/circulos/Seguimiento.tsx"),
    // The failure this guards is not "the decision was lost" — the row commits
    // either way, and the walk proves that separately with SQL. It is the one
    // where a person presses the button, nothing on screen changes, and they
    // press it again or conclude it did not work.
    //
    // The mutation is the copy itself rather than the condition around it:
    // `already` is typed, and every way of forcing that branch shut either
    // fails the build or trips a lint rule, which would score a compile error
    // as a detection. Removing the words is type-safe, lint-clean, and exactly
    // the regression the check is named after.
    find: `          Ya respondiste`,
    replace: `          Listo`,
    runner: WALK,
    scenario: "BROWSER_CLOSING_PATHS",
    test: "apps/web/e2e/circulos/stack.mjs",
    t: "closing first says the decision was recorded, and waits for the other",
  },
  {
    property: "DIAGNOSTICS_ARE_REDACTED_BEFORE_THEY_ARE_PUBLISHED",
    mutation: "the redactor returns its input untouched",
    file: w("e2e/circulos/redact.mjs"),
    // Retiring the redactor, in the way it would actually be retired: one
    // condition at the top that hands the text straight back. Removing a single
    // RULE proves nothing here and that is by design — a token in a query
    // string is caught by the URL rule, by the key-name rule and by the
    // opaque-run rule, so any one of them can go without the value escaping.
    // Defence in depth is only worth having if a control cannot mistake it for
    // a test that is watching, so the mutation removes the function's effect
    // rather than one of its rules.
    find: `  if (typeof text !== "string" || text.length === 0) return text;`,
    replace: `  if (typeof text === "string") return text;`,
    runner: WEBT,
    test: "src/lib/circulos/diagnostic-redaction.test.ts",
    t: "drops the token from both places the email puts it",
  },
  {
    property: "REVEAL_BARRIER_HOLDS_IN_THE_BROWSER",
    mutation: "one confirmation is enough to reveal",
    file: f("src/circles/circle-activity.repository.ts"),
    // `revealIfAllReady` holds both halves shut until both are in: the READY
    // count must EQUAL the required number of participants. Turning that into
    // "at least one" reveals the first person's words to the second before they
    // have confirmed anything — the failure the barrier exists to prevent, and
    // one that shows only on the OTHER person's screen.
    find: `             SELECT count(*) FROM "CircleActivityParticipant" p
              WHERE p."activityId" = a."id" AND p."status" = 'READY'
           ) = a."requiredParticipants"`,
    replace: `             SELECT count(*) FROM "CircleActivityParticipant" p
              WHERE p."activityId" = a."id" AND p."status" = 'READY'
           ) >= 1`,
    runner: WALK,
    scenario: "BROWSER_REVEAL_BARRIER",
    test: "apps/web/e2e/circulos/stack.mjs",
    // The assertion that must FIRE, not merely a scenario that must break: the
    // barrier is a fact about the activity, so it is checked as one before any
    // screen is consulted.
    t: "nothing is revealed on one confirmation",
  },

  // ── The second shape: rules that read the same as the Dúo's when wrong ───
  {
    property: "THE_MODALITY_GATE_READS_THE_TEMPLATE",
    mutation: "the gate is asked of the request instead of the catalogue",
    file: f("src/circles/circles-participation.service.ts"),
    // The gate's whole point is WHERE it asks. Reading `input.size` instead of
    // the resolved template's audience means a caller can open groups by
    // sending a number — and for a Dúo request the two answers agree, so the
    // Dúo's own tests would never notice.
    find: `        if (
          kind === "GROUP_ADULT" &&
          !this.rollout.isGroupCreationAvailable(input.userId)
        ) {`,
    replace: `        if (
          (input.size ?? 2) > 2 &&
          !this.rollout.isGroupCreationAvailable(input.userId)
        ) {`,
    runner: PGSPEC,
    test: "src/circles/circles-groups.pg-spec.ts",
    // The case that separates the two readings. A request that SENDS a size
    // satisfies both the right gate and the wrong one, so it cannot tell them
    // apart; a request that lets the template decide is refused by the right
    // one and creates a group under the wrong one. This control is why that
    // test exists.
    t: "refuses a group template that sends no size at all",
  },
  {
    property: "THE_MODALITY_SWITCH_CAN_ONLY_NARROW",
    mutation: "the switch is consulted before availability",
    file: f("src/circles/circles-rollout.service.ts"),
    // The order of two lines IS the guarantee. Swapped, `CIRCLES_GROUPS=on`
    // becomes an enrolment: somebody outside the allowlist creates a group
    // because a flag is open. Every other answer the service gives is
    // unchanged, which is exactly why a total would not move.
    find: `    if (!this.isAvailable(userId)) return false;
    return this.groups;`,
    replace: `    if (this.groups) return true;
    return this.isAvailable(userId);`,
    runner: UNIT,
    test: "src/circles/circles-rollout.spec.ts",
    t: "does not admit somebody Círculos is closed for",
  },
  {
    property: "EVERY_SECRET_IS_PART_OF_THE_REQUEST",
    mutation: "a retry is compared by its first secret and a count",
    file: f("src/circles/circles-participation.service.ts"),
    // The shape this had before a group spec asked: same key, same first
    // secret, same count — and the third person holds a link the server never
    // saw. For a Dúo there IS only a first secret, so the mutation is
    // invisible to every Dúo test in the suite.
    find: `          const sameSecrets =
            priorHashes.size === tokenHashes.length &&
            tokenHashes.every((hash) => priorHashes.has(hash));`,
    replace: `          const sameSecrets =
            priorHashes.size === tokenHashes.length &&
            priorHashes.has(tokenHashes[0] ?? "");`,
    runner: PGSPEC,
    test: "src/circles/circles-groups.pg-spec.ts",
    t: "conflicts when the retry keeps the size but changes a later secret",
  },
  {
    property: "A_CELL_NEEDS_MORE_THAN_ONE_ROOM",
    mutation: "suppression rests on the contributor count alone",
    file: f("src/circles/circles-analytics.service.ts"),
    // The rule groups broke. Ten contributors implied five rooms while every
    // activity had two seats; two rooms of six clear it, and each organiser
    // can subtract their own. Dropping the second condition restores a rule
    // that every Dúo-era test still passes.
    find: `        cell.contributors >= CIRCLE_SMALL_CELL_THRESHOLD &&
        cell.activities >= CIRCLE_SMALL_ACTIVITY_THRESHOLD`,
    replace: `        cell.contributors >= CIRCLE_SMALL_CELL_THRESHOLD`,
    runner: PGSPEC,
    test: "src/circles/circles-analytics.pg-spec.ts",
    t: "suppresses twelve contributors that came from two rooms",
  },
  {
    property: "EVERY_SEAT_MAY_ACCEPT_ITS_OWN_INVITATION",
    mutation: "acceptance requires the room to be untouched",
    file: f("src/circles/circles.service.ts"),
    // The bug as it shipped: a room of six admits one guest, because the first
    // acceptance moves the activity to PREPARING and the next one is refused.
    // A Dúo has one guest, so this reads as correct there forever.
    find: `        if (activity.status !== "INVITING" && activity.status !== "PREPARING") {`,
    replace: `        if (activity.status !== "INVITING") {`,
    runner: PGSPEC,
    test: "src/circles/circles-groups.pg-spec.ts",
    t: "reveals only when the last seat confirms",
  },
  {
    property: "A_GROUP_MINTS_ONE_LINK_PER_SEAT",
    mutation: "every seat's link opens the same seat",
    file: f("src/circles/circles-participation.service.ts"),
    // `seatIndex` is what makes "one live invitation per seat" expressible.
    // Pinning it to 1 puts every link into seat one — which the partial unique
    // index then refuses, so no group can be created at all. The Dúo, whose
    // only guest IS seat one, is untouched.
    find: `              seatIndex: index + 1,`,
    replace: `              seatIndex: 1,`,
    runner: PGSPEC,
    test: "src/circles/circles-groups.pg-spec.ts",
    t: "opens one numbered seat per link, all live at once",
  },
];

/**
 * Rebuild a workspace package the mutation lives in, before the test reads it.
 *
 * Only needed where the code under test is consumed as a BUILT artifact rather
 * than as source. A failure here is returned as the phase's result rather than
 * thrown, so it is reported as a failed control instead of killing the run —
 * and the restore still happens.
 */
function rebuild(target) {
  if (target !== "types") throw new Error(`unknown rebuild target: ${target}`);
  try {
    execFileSync("pnpm", ["--filter", "@psico/types", "build"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 600_000,
    });
    return null;
  } catch (err) {
    return {
      code: err.status ?? 1,
      out: `REBUILD FAILED\n${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

function runTest(c) {
  if (c.rebuild) {
    const failed = rebuild(c.rebuild);
    if (failed) return failed;
  }
  if (c.runner === WALK) return runWalk(c);
  const cwd = c.runner === WEBT ? WEB : API;
  const cfg = c.runner === PGSPEC ? ["--config", "vitest.locks.config.ts"] : [];
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
    return {
      code: err.status ?? 1,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

/**
 * Build and run the whole stack against the CURRENT working tree.
 *
 * `--worktree` is what makes this usable as a control: the mutation lives in
 * the working tree, and the harness otherwise archives a commit — which would
 * faithfully build the UNMUTATED source and report a green walk, scoring a
 * no-op as a detection.
 */
function runWalk(c) {
  const runId = randomBytes(5).toString("hex");
  try {
    const out = execFileSync(
      "node",
      ["apps/web/e2e/circulos/stack.mjs", "--worktree", "--run-id", runId],
      {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 2_700_000,
        // Narrow the walk to the scenario whose property is under test, when
        // the control names one. Three phases of the FULL walk is most of an
        // hour to learn one thing, and the scenarios are independent by
        // construction — each owns its own accounts and activities — so running
        // one proves exactly as much about that one as running fifteen does.
        env: c.scenario
          ? { ...process.env, CIRCULOS_E2E_ONLY: c.scenario }
          : process.env,
      },
    );
    return { code: 0, out };
  } catch (err) {
    if (err.killed || err.signal) return { code: -1, out: "TIMEOUT" };
    return {
      code: err.status ?? 1,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  } finally {
    // The stack tears itself down, but a crash before that leaves resources
    // named after a run id we chose, so they can always be named again.
    try {
      execFileSync(
        "node",
        ["apps/web/e2e/circulos/stack.mjs", "--down", runId],
        { cwd: ROOT, stdio: "pipe", timeout: 300_000 },
      );
    } catch {
      /* already clean */
    }
  }
}

/**
 * How many tests actually RAN.
 *
 * Zero is the dangerous case: a filter that selects nothing exits 0 and looks
 * exactly like a pass.
 */
function ranCount(out, control) {
  if (control?.runner === WALK) {
    // "10/10 scenarios, 62 checks" — a run that printed no tally executed
    // nothing, however it exited.
    const m = /(\d+)\/(\d+) scenarios, (\d+) checks/.exec(out);
    return m ? Number(m[3]) : 0;
  }
  const m = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(?:(\d+)\s+passed)?/.exec(out);
  if (!m) return 0;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) : 0);
}

/**
 * Did the NAMED scenario fail, rather than merely something failing?
 *
 * A mutation to production code can easily break a different scenario than the
 * one whose property is under test; counting that as a detection would be
 * scoring the wrong evidence.
 */
function namedScenarioFailed(out, control) {
  return new RegExp(`^FAIL\\s+${control.scenario}\\b`, "m").test(out);
}

/**
 * Where each phase's output is kept.
 *
 * The runner used to hold it only in memory, so when a control failed the
 * evidence for WHY died with the process — and the walk controls, which take
 * half an hour a phase, are exactly the ones you cannot casually re-run to look
 * again.
 */
const LOG_DIR = resolve(API, ".negative-controls");
mkdirSync(LOG_DIR, { recursive: true });

function keep(control, phase, result) {
  const file = resolve(LOG_DIR, `${control.property}.${phase}.log`);
  // Redacted BEFORE it is written, not before it is read. These files outlive
  // the run by design — that is their whole point — and a walk control's phase
  // log is the full output of a stack that prints emails to stdout. Something
  // written to disk unredacted is already published to whatever backs up that
  // disk.
  writeFileSync(
    file,
    redactDiagnostics(`exit=${result.code}\n\n${result.out}`),
  );
  return file;
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
  keep(c, "1-baseline", pre);
  const preRan = ranCount(pre.out, c);
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
    keep(c, "2-mutated", broken);
    const ran = ranCount(broken.out, c);
    red =
      broken.code > 0 &&
      ran > 0 &&
      !/TIMEOUT/.test(broken.out) &&
      (c.runner !== WALK || namedScenarioFailed(broken.out, c));
    if (!red) {
      why =
        broken.code === -1
          ? "timed out — not a detection"
          : ran === 0
            ? "no tests ran while mutated"
            : /error TS\d|Cannot find module|SyntaxError/.test(broken.out)
              ? "compile error — proves the file broke, not that the test watched"
              : c.runner === WALK && !namedScenarioFailed(broken.out, c)
                ? `something failed, but NOT ${c.scenario}`
                : "STAYED GREEN — the assertion does not cover this";
    }
  }

  // 3 · restore, byte for byte, and require green again.
  writeFileSync(c.file, original);
  const restored = sha(c.file) === before;

  let green = false;
  if (applied && red && restored) {
    const after = runTest(c);
    const where = keep(c, "3-restored", after);
    green = after.code === 0 && ranCount(after.out, c) > 0;
    if (!green) {
      why = `did not return to green after restore — see ${where}`;
    }
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
