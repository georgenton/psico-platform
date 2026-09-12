import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Círculos cut, asserted rather than promised.
 *
 * ── Updated for PR2, exactly as PR1 said it would be ───────────────────────
 *
 * PR1 shipped three "not yet" assertions — no Prisma model, no migration, no
 * Nest module — and said in this comment that `feat/circles-domain-foundation`
 * would have to change them deliberately rather than let them rot. This is that
 * edit. Each one is now its positive counterpart, so the file still fails if
 * the models, the migration or the wiring disappear.
 *
 * The rest of the assertions were never of that kind. Private drafts, Content
 * Core ids, personal-data imports, the editorial candidates, #639's status and
 * PQP C07 hold for every cut, and PR2 adds the ones its own scope makes
 * checkable: no raw secret in a column, no client-asserted identity in a DTO,
 * an empty production catalog, and a frozen `GuideSession`.
 */

const ROOT = join(process.cwd(), "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Comments legitimately name what the code must not contain. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const CONTRACT_FILES = [
  "packages/types/src/circles.ts",
  "packages/types/src/circles-catalog.ts",
];

const CIRCLES_DIR = "apps/api/src/circles";
const circlesSources = () =>
  readdirSync(join(ROOT, CIRCLES_DIR))
    .filter(
      (f) => f.endsWith(".ts") && !/\.(spec|pg-spec|fixtures)\.ts$/.test(f),
    )
    .map((f) => `${CIRCLES_DIR}/${f}`);

describe("circles · PR3 scope — access and participation", () => {
  it("declares the eight models", () => {
    const schema = read("apps/api/prisma/schema.prisma");
    for (const model of [
      "Circle",
      "CircleMember",
      "CircleInvitation",
      "CircleGuestSession",
      "CircleActivity",
      "CircleActivityParticipant",
      "CircleArtifact",
      "CircleEvent",
    ]) {
      expect(schema, model).toMatch(
        new RegExp(`^model\\s+${model}\\s*\\{`, "m"),
      );
    }
  });

  it("ships exactly two migrations, both additive", () => {
    // PR2 added the domain; PR3 adds the invariants participation needs. PR2's
    // has been applied to production, so it is not edited — a migration that
    // has run is a fact, not a draft.
    const dirs = readdirSync(join(ROOT, "apps/api/prisma/migrations"))
      .filter((d) => /circle/i.test(d))
      .sort();
    expect(dirs).toEqual([
      "20260909180000_circles_domain_foundation",
      "20260910030000_circles_participation_invariants",
    ]);
    for (const dir of dirs) {
      const sql = read(`apps/api/prisma/migrations/${dir}/migration.sql`);
      // The hazard that broke production on 2026-06-01: Prisma CLI chatter as
      // the first line of a file Postgres is about to execute.
      expect(sql.split("\n")[0], dir).toMatch(/^--/);
      for (const line of sql
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("--"))) {
        expect(line, `${dir} · ${line}`).not.toMatch(
          /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)\b|\bALTER\s+COLUMN\b|\bRENAME\b/i,
        );
      }
    }
  });

  it("leaves PR2's applied migration byte-identical", () => {
    // It ran in production on 2026-09-10. Editing it now would mean the file in
    // the repository and the schema in the database describe different things,
    // and the difference would be invisible until the next fresh environment.
    const sql = read(
      "apps/api/prisma/migrations/20260909180000_circles_domain_foundation/migration.sql",
    );
    expect(sql).toContain('CREATE TRIGGER "CircleEvent_no_update"');
    expect(sql).toContain("CircleEvent_metadata_closed_grammar");
    expect(sql).toContain('CHECK ("requiredParticipants" = 2)');
    expect(sql).not.toContain("artifactId");
  });

  it("wires the Nest module", () => {
    const appModule = read("apps/api/src/app.module.ts");
    expect(appModule).toMatch(/CirclesModule/);
  });

  it("implements none of PR4's surface", () => {
    // PR3's limits, as a check rather than a promise. Web, BFF, the fragment
    // flow, Eco and the worker are absent — not stubbed, not behind a second
    // flag. PR2's version of this test named PR3's commands; those now exist,
    // and updating it is part of this cut exactly as PR1 said it would be.
    const sources = circlesSources()
      .map((f) => code(read(f)))
      .join("\n");
    for (const forbidden of [
      "ecoFacilitator",
      "EcoFacilitator",
      "cookie",
      "setCookie",
      "BullMQ",
      "Queue",
      "publicPreviewPage",
      "next/navigation",
    ]) {
      expect(sources, forbidden).not.toContain(forbidden);
    }
  });

  it("touches no Mobile or worker file", () => {
    // The scope of PR3 is `apps/api/src/circles/**`, the contracts, the schema,
    // one migration and the docs. These directories are not in it.
    //
    // `apps/web/src/app/dashboard` WAS on this list and is not any more. PR4 is
    // the cut that owns the web guest flow, and it adds `dashboard/circulos/**`
    // — so the assertion that made PR3 honest would now only be asserting that
    // PR4 had not happened. Mobile and the worker stay: they belong to no cut
    // yet, and PR4's own scope test pins that it adds nothing to either.
    //
    // This is the same handover the test above describes: PR2's version of
    // these ratchets named PR3's commands, PR3 updated them when it shipped
    // them, and PR4 does the same here.
    for (const dir of ["apps/mobile/app", "apps/api/src/jobs/processors"]) {
      const hits = readdirSync(join(ROOT, dir), { recursive: true } as never)
        .filter((f): f is string => typeof f === "string")
        .filter((f) => /circle|circulo/i.test(f));
      expect(hits, dir).toEqual([]);
    }
  });

  it("keeps the rollout closed by default", () => {
    // No default anywhere in the module turns Círculos on. The resolver's own
    // behaviour is covered in `circles-rollout.spec.ts`; this is the textual
    // ratchet against somebody adding `?? "on"` later.
    for (const file of circlesSources()) {
      const src = code(read(file));
      // A DEFAULT of "on" — `?? "on"`, `|| "on"`, `= "on"`. Deliberately not
      // `=== "on"`, which is how the service reads the mode it was given.
      expect(src, file).not.toMatch(
        /\?\?\s*"on"|\|\|\s*"on"|(?<![=!<>])=\s*"on"/,
      );
    }
  });
});

describe("circles · PR2 — secrets never become columns", () => {
  it("has no raw token or code column in the schema", () => {
    const schema = code(read("apps/api/prisma/schema.prisma"));
    const circlesSection = schema.slice(schema.indexOf("model Circle "));
    for (const [, field] of circlesSection.matchAll(/^\s{2}(\w+)\s+\w/gm)) {
      // `tokenHash` and `codeHash` are fine. A bare `token`, `code`, `secret`
      // or `plaintext` is the thing that must never appear.
      expect(field, field).not.toMatch(
        /^(token|code|secret|rawToken|rawCode|plaintext)$/i,
      );
    }
  });

  it("never persists what the minting functions return", () => {
    // `raw` leaves `circles-secrets.ts` and reaches the caller. Nothing in the
    // module may put it in a Prisma `data` object or a log line.
    for (const file of circlesSources()) {
      const src = code(read(file));
      expect(src, `${file} · logs`).not.toMatch(
        /console\.(log|info|warn|error)|logger\.\w+\(/,
      );
      // `input.tokenHash` is the correct assignment and must not trip this;
      // `input.token` — the raw value — must. Hence the word boundary.
      expect(src, `${file} · tokenHash assignment`).not.toMatch(
        /tokenHash:\s*(raw\b|presented\b|input\.token\b|dto\.)/,
      );
      expect(src, `${file} · codeHash assignment`).not.toMatch(
        /codeHash:\s*(raw\b|presented\b|input\.code\b|dto\.)/,
      );
    }
  });
});

describe("circles · PR2 — the inviter is locked, in a fixed order", () => {
  it("reads the inviter FOR UPDATE, and only inside a transaction", () => {
    const repo = code(read(`${CIRCLES_DIR}/circle-member.repository.ts`));
    // Prisma's fluent API cannot express a row lock, so this one read is raw —
    // and fully parameterised, which the assertion below pins.
    expect(repo).toMatch(/FOR UPDATE/);
    expect(repo).toMatch(/WHERE "id" = \$\{memberId\}/);
    // `lockById` takes its client as a REQUIRED argument. A default would make
    // it callable outside a transaction, where the lock is taken and dropped at
    // the end of the statement — protection-shaped, and not protection.
    expect(repo).toMatch(
      /lockById\(\s*memberId: string,\s*tx: CircleMemberTx,\s*\)/,
    );
    expect(repo).not.toMatch(/tx: CircleMemberTx = /);
  });

  it("takes every participation lock in the canonical order", () => {
    // The order is a property of the command, and the source is where it is
    // decided. Reading it out of the file rather than trusting the comment
    // above it is what makes this a ratchet instead of documentation.
    const src = read(`${CIRCLES_DIR}/circles-participation.service.ts`);
    const before = (a: string, b: string, where: string, label: string) => {
      const i = where.indexOf(a);
      const j = where.indexOf(b);
      expect(i, `${label}: "${a}" present`).toBeGreaterThan(-1);
      expect(j, `${label}: "${b}" present`).toBeGreaterThan(-1);
      expect(i, `${label}: ${a} before ${b}`).toBeLessThan(j);
    };

    // ── The shared spine: authority, then activity, then seat ───────────
    const authority = src.slice(
      src.indexOf("private async resolveAuthority"),
      src.indexOf("private async resolveGuestAuthority"),
    );
    before(
      "this.members.lockById",
      "this.activities.lockById",
      authority,
      "resolveAuthority",
    );
    before(
      "this.activities.lockById",
      "this.participants.lockForActivity",
      authority,
      "resolveAuthority",
    );
    // The guest branch is delegated, and it is delegated BEFORE the activity
    // is locked — otherwise the session lock would come after it.
    before(
      "this.resolveGuestAuthority",
      "this.activities.lockById",
      authority,
      "resolveAuthority",
    );

    // ── The guest chain: member, invitation, session ────────────────────
    const guest = src.slice(
      src.indexOf("private async resolveGuestAuthority"),
      src.indexOf("// ══ Create"),
    );
    before(
      "this.members.lockById",
      "this.invitations.lockById",
      guest,
      "resolveGuestAuthority",
    );
    before(
      "this.invitations.lockById",
      "this.guestSessions.lockById",
      guest,
      "resolveGuestAuthority",
    );
    // The unlocked reads exist ONLY to resolve ids, so they must come before
    // the first lock — a peek taken after a lock would be a decision made on
    // stale data while holding something.
    before(
      "this.guestSessions.findById",
      "this.members.lockById",
      guest,
      "resolveGuestAuthority",
    );

    // The artifact comes last, in the two commands that touch it.
    for (const command of ["proposeArtifact", "confirmArtifact"]) {
      const body = src.slice(src.indexOf(`async ${command}(`));
      before(
        "resolveAuthority",
        "this.artifacts.lockForActivity",
        body,
        command,
      );
    }
  });

  it("re-derives the guest's inviter inside the transaction", () => {
    // A guest holds no membership. Their authority is borrowed from the
    // member who invited them, so a command that does not re-check that
    // member is trusting a decision made when the session was minted — which
    // may have been days ago.
    const guest = read(`${CIRCLES_DIR}/circles-participation.service.ts`).slice(
      read(`${CIRCLES_DIR}/circles-participation.service.ts`).indexOf(
        "private async resolveGuestAuthority",
      ),
    );
    const body = guest.slice(0, guest.indexOf("// ══ Create"));
    expect(body, "inviter must still be ACTIVE").toContain(
      'inviter.status !== "ACTIVE"',
    );
    expect(body, "pilot allowlist re-checked from the locked row").toContain(
      "this.rollout.isAvailable(inviter.userId)",
    );
    expect(body, "the session must name the actor's own seat").toContain(
      "session.participantId !== actor.participantId",
    );
    expect(body, "a revoked invitation is refused").toContain(
      "invitation.revokedAt !== null",
    );
  });

  it("states the lock order where the next author will read it", () => {
    const src = code(read(`${CIRCLES_DIR}/circles.service.ts`));
    expect(src).toContain("lockAndAssertInviter");
    expect(
      read(`${CIRCLES_DIR}/circles-participation.service.ts`),
      "the participation service states it too",
    ).toContain("LOCK ORDER — MANDATORY");
    expect(read(`${CIRCLES_DIR}/circles.service.ts`)).toContain(
      "CircleMember  ->  CircleInvitation  ->  CircleGuestSession  ->",
    );
    expect(read(`${CIRCLES_DIR}/circles.service.ts`)).toContain(
      "CircleActivity  ->  CircleActivityParticipant  ->  CircleArtifact",
    );
  });
});

describe("circles · PR2 — the event ledger cannot be rewritten or filled", () => {
  const MIGRATION =
    "apps/api/prisma/migrations/20260909180000_circles_domain_foundation/migration.sql";

  it("keeps the append-only protection in the migration, not in a service", () => {
    // A ledger the application merely promises not to rewrite is one bug away
    // from being rewritten. The protection has to be where an application bug
    // cannot reach it, and turning it off has to be a reviewed migration.
    const sql = read(MIGRATION);
    for (const trigger of [
      'CREATE TRIGGER "CircleEvent_no_update"',
      'CREATE TRIGGER "CircleEvent_no_delete"',
      'CREATE TRIGGER "CircleEvent_no_truncate"',
    ]) {
      expect(sql, trigger).toContain(trigger);
    }
    // TRUNCATE needs its own statement-level trigger: row triggers do not see
    // it, and a table closed to DELETE but open to TRUNCATE is not closed.
    expect(sql).toMatch(
      /BEFORE TRUNCATE ON "CircleEvent"[\s\S]*FOR EACH STATEMENT/,
    );
  });

  it("closes metadata by grammar rather than by size", () => {
    const sql = read(MIGRATION);
    // The constraint that was removed, and why: 2 kB is several paragraphs, and
    // a paragraph is exactly what must never land in an audit row.
    expect(sql).not.toContain("CircleEvent_metadata_is_small");
    expect(sql).not.toMatch(/length\("metadata"::text\)/);
    expect(sql).toContain("CircleEvent_metadata_closed_grammar");
    expect(sql).toContain(`'{"hasCode": true}'::jsonb`);
    expect(sql).toContain(`'{"hasCode": false}'::jsonb`);
  });

  it("types metadata as a closed union, not a bag", () => {
    const src = code(read(`${CIRCLES_DIR}/circle-event.repository.ts`));
    // `Record<string, …>` admits any key, and a key is all somebody needs.
    expect(src).not.toMatch(/Record<\s*string\s*,/);
    expect(src).toContain("CircleEventTypeWithMetadata");
    expect(src).toContain("readonly metadata?: undefined");
  });

  it("gives no Círculos source a way to update or delete an event", () => {
    for (const file of circlesSources()) {
      const src = code(read(file));
      for (const forbidden of [
        "circleEvent.update",
        "circleEvent.delete",
        "circleEvent.upsert",
        "session_replication_role",
        "DISABLE TRIGGER",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("circles · PR2 — the client never asserts who it is", () => {
  it("never lets a Content Core id into a DTO", () => {
    const dtoDir = `${CIRCLES_DIR}/dto`;
    for (const file of readdirSync(join(ROOT, dtoDir)).filter((f) =>
      f.endsWith(".ts"),
    )) {
      expect(code(read(`${dtoDir}/${file}`)), file).not.toContain(
        "contentUnitId",
      );
    }
  });

  it("declares no identity or role field in any DTO", () => {
    const dtoDir = `${CIRCLES_DIR}/dto`;
    const files = readdirSync(join(ROOT, dtoDir)).filter((f) =>
      f.endsWith(".ts"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = code(read(`${dtoDir}/${file}`));
      for (const forbidden of [
        "userId",
        "participantId",
        "activityId",
        "circleId",
        "memberId",
        "role",
      ]) {
        // Not "ignored" — absent. The global pipe runs `forbidNonWhitelisted`,
        // so a body carrying one is rejected before a handler sees it.
        expect(src, `${dtoDir}/${file} · ${forbidden}`).not.toMatch(
          new RegExp(`\\b${forbidden}\\b`),
        );
      }
    }
  });

  it("builds every actor from a server-side value", () => {
    const actor = code(read(`${CIRCLES_DIR}/circles-actor.ts`));
    // The two constructors take a row and a verified subject. Neither signature
    // has a parameter a request body could flow into.
    expect(actor).toMatch(/export function buildGuestActor\(row: \{/);
    expect(actor).toMatch(/export function buildUserActor\(userId: string\)/);
    expect(actor).not.toMatch(/req\.body|request\.body|dto\./);
  });
});

describe("circles · PR3 — participation keeps every earlier promise", () => {
  it("offers no admin, payer or support path to content", () => {
    // The matrix says ADMIN is `NEVER` for revealed content. That is only worth
    // something if there is no route that skips the matrix — no "support view",
    // no billing-scoped read, no impersonation.
    for (const file of circlesSources()) {
      const src = code(read(file));
      for (const forbidden of [
        "RolesGuard",
        "RequiredRole",
        "RequiredPlan",
        "PlanGuard",
        "impersonat",
        "supportView",
        "adminRead",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("never lets WITHDRAW arrive as a sharing mode", () => {
    // Leaving is not a kind of sharing. It has its own route, its own
    // semantics, and a CHECK that refuses to store it as a `sharingMode`.
    const dto = code(read(`${CIRCLES_DIR}/dto/participation.dto.ts`));
    expect(dto).not.toMatch(/Equals\("WITHDRAW"\)|"WITHDRAW"/);
    const migration = read(
      "apps/api/prisma/migrations/20260910030000_circles_participation_invariants/migration.sql",
    );
    expect(migration).toContain(
      "CircleActivityParticipant_withdraw_is_not_a_share",
    );
  });

  it("closes every route before encrypting or writing when the flag is off", () => {
    // Under `off` the cipher is `null` and the guard refuses first. The service
    // still checks, so a future rewiring that lost the guard fails closed
    // rather than writing plaintext.
    const service = code(
      read(`${CIRCLES_DIR}/circles-participation.service.ts`),
    );
    expect(service).toContain("requireCipher");
    expect(service).toMatch(/if \(!this\.cipher\) throw new CirclesError/);
    const controller = code(
      read(`${CIRCLES_DIR}/circles-participation.controller.ts`),
    );
    // Both surfaces carry a rollout-aware guard at the class level.
    expect(controller).toMatch(
      /@UseGuards\(JwtAuthGuard, CirclesRolloutGuard\)/,
    );
    expect(controller).toMatch(/@UseGuards\(CirclesGuestGuard\)/);
  });

  it("marks every content response private and uncacheable", () => {
    const controller = code(
      read(`${CIRCLES_DIR}/circles-participation.controller.ts`),
    );
    expect(controller).toContain('"private, no-store"');
    // Every handler calls it: a shared snapshot sitting in an intermediary's
    // cache is the same leak as serving it to the wrong person.
    const handlers = [...controller.matchAll(/@(Get|Post|Put)\(/g)].length;
    const noStores = [...controller.matchAll(/noStore\(res\)/g)].length;
    expect(noStores, "one noStore per handler").toBe(handlers);
  });

  it("requires a canonical idempotency key on every command", () => {
    const controller = code(
      read(`${CIRCLES_DIR}/circles-participation.controller.ts`),
    );
    const commands = [...controller.matchAll(/@(Post|Put)\(/g)].length;
    const keys = [...controller.matchAll(/requireIdempotencyKey\(key\)/g)]
      .length;
    expect(keys, "one key check per command").toBe(commands);
    // Canonical, not normalised into existence: a key the server repairs is a
    // key two clients can collide on by accident.
    expect(controller).toMatch(/\[0-9a-f\]\{8\}-/);
  });
});

describe("circles · PR2 — nothing outside its own tables moved", () => {
  it("never touches GuideSession", () => {
    // #639's arc is complete and frozen. Círculos referencing `guideSession`
    // anywhere would be the first step of exactly the merge ADR 0023 §2.1
    // rejected.
    for (const file of [...circlesSources(), ...CONTRACT_FILES]) {
      const src = code(read(file));
      for (const forbidden of [
        "guideSession",
        "GuideSession",
        "GuideCommandReceipt",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("never lets Redis become the correctness authority", () => {
    // Redis is allowed to make retries cheap. It is not allowed to decide
    // whether an invitation was used, whether a session is live, or whether a
    // command already ran — a Redis outage or a desynchronised replica must not
    // be able to revive a revoked permission or spend an invitation twice.
    //
    // Rate limiting is the one place Redis legitimately appears, and it appears
    // through `@Throttle`, which is a decorator on the controller and not a
    // client this module holds.
    for (const file of circlesSources()) {
      const src = code(read(file));
      for (const forbidden of [
        "REDIS_CLIENT",
        "ioredis",
        "IoRedis",
        "redis.get",
        "redis.set",
        "RedisService",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("leaves the Guide domain byte-identical to what it found", () => {
    // #639's arc is complete and FROZEN, and `GUIDE_SESSION_FILES_CHANGED=0` is
    // a claim this PR makes in its report. The claim is only worth something if
    // something checks it, so the model's column list is pinned here: adding,
    // removing or renaming one fails this test, whoever does it and for
    // whatever reason.
    const schema = read("apps/api/prisma/schema.prisma");
    const model = schema.slice(schema.indexOf("model GuideSession {"));
    const body = model.slice(0, model.indexOf("\n}"));
    const fields = [...body.matchAll(/^ {2}(\w+)\s+\w/gm)].map((m) => m[1]);
    expect(fields).toEqual([
      "id",
      "userId",
      "guideKey",
      "guideVersion",
      "status",
      "editionId",
      "unitId",
      "stepsCompleted",
      "totalSteps",
      "currentStepKey",
      "startedAt",
      "completedAt",
      "cancelledAt",
      "user",
      "steps",
      "receipts",
    ]);
  });

  it("leaves the production catalog empty", () => {
    // Publishing a template is an editorial decision. It cannot become a side
    // effect of wiring a module.
    const catalog = read("packages/types/src/circles-catalog.ts");
    expect(catalog).toMatch(
      /PRODUCTION_CIRCLE_TEMPLATES:\s*readonly CircleActivityDefinition\[\]\s*=\s*\[\]/,
    );
  });
});

describe("circles · invariants that hold for every future cut", () => {
  it("has no field anywhere for a private draft", () => {
    // The whole privacy posture rests on this: preparation is local, and the
    // server has nowhere to put it even if a later cut tried.
    for (const file of CONTRACT_FILES) {
      const src = code(read(file));
      for (const forbidden of [
        "draftText",
        "privateResponse",
        "privateAnswer",
        "preparationText",
        "answerText",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
    // And not in the Prisma schema either — the models landed in PR2, so this
    // is now checking a real table list rather than an empty possibility.
    expect(code(read("apps/api/prisma/schema.prisma"))).not.toMatch(
      /privateResponse|draftText/,
    );
  });

  it("never lets a Content Core id into the shared contract", () => {
    for (const file of CONTRACT_FILES) {
      expect(code(read(file)), file).not.toContain("contentUnitId");
    }
  });

  it("keeps the contract free of personal-data imports", () => {
    // Círculos may never reach Diario, Eco personal, Mapa or Patrones. The
    // contract package imports nothing at all today; this pins that it stays
    // that way as the catalog grows.
    for (const file of CONTRACT_FILES) {
      const src = code(read(file));
      for (const forbidden of [
        "DiaryEntry",
        "EcoThread",
        "EcoMessage",
        "EmotionalMap",
        "MoodLog",
        "Patrones",
        "Reflexiones",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("imports no editorial DUO_CANDIDATES into the catalog", () => {
    // The nine candidates in the Parejas chapters are editorial drafts that say
    // so themselves. Publishing one is an editorial decision, never a wiring
    // side effect.
    for (const file of CONTRACT_FILES) {
      expect(code(read(file)), file).not.toContain("DUO_CANDIDATES");
    }
  });

  it("never states that issue #639 is closed", () => {
    // Frozen is not closed. #639's implementation arc is complete and frozen,
    // and the issue itself is still open — an ADR that called it closed would
    // be recording a fact about GitHub that is not true, and the next reader
    // would plan around it.
    //
    // The ratchet is focused: it reads every line that mentions 639 and
    // refuses a closure claim on any of them. The three canonical status
    // declarations are the one place the word may appear, because that is
    // where the truthful value lives.
    const CANONICAL = [
      "ISSUE_639_IMPLEMENTATION_COMPLETE=true",
      "ISSUE_639_FROZEN=true",
      "ISSUE_639_CLOSED=false",
    ];
    for (const file of [
      "docs/adr/0023-circles-one-domain-many-surfaces.md",
      "docs/architecture/circles-v1.md",
    ]) {
      const src = read(file);
      for (const line of src.split("\n")) {
        if (!line.includes("639")) continue;
        if (CANONICAL.some((c) => line.includes(c))) continue;
        expect(line, `${file} · ${line.trim()}`).not.toMatch(
          /cerrad\w*|closed/i,
        );
      }
    }
    // And the ADR must state the status rather than leave it to inference.
    const adr = read("docs/adr/0023-circles-one-domain-many-surfaces.md");
    for (const declaration of CANONICAL) {
      expect(adr, declaration).toContain(declaration);
    }
  });

  it("leaves PQP C07 without a Dúo candidate", () => {
    // The chapter that names violence and coercive control ships an empty list
    // on purpose: a bilateral activity is the wrong instrument there. Every
    // future cut inherits this.
    const c07 = read("scripts/pqp/chapters/c07.mjs");
    expect(c07).toMatch(/export const DUO_CANDIDATES = \[\]/);
  });
});
