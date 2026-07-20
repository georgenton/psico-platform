import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKIN_ITEMS } from "@psico/types";
import type { EmotionalMapResult } from "@psico/types";

import { EmotionalMapService } from "../emotional-map/emotional-map.service";
import {
  IMPORTANT_CONF_N,
  IMPORTANT_GOOD_N,
  RESONANCE_CONF_N,
  RESONANCE_GOOD_N,
} from "../emotional-map/emotional-map.scoring";
import type { IEmotionalMapProvider } from "../emotional-map/providers/provider.interface";
import { MoodService } from "../mood/mood.service";
import { deriveMoodNormalization } from "../mood/mood-normalization";
import type { PrismaService } from "../prisma";
import { createRedisClient } from "../redis/redis.module";
import { ResonancesService } from "../resonances/resonances.service";
import type { ConfirmResonanceDto } from "../resonances/dto/confirm-resonance.dto";
import { LearningEventRepository } from "./learning-event.repository";
import type { ValidatedLearningEvent } from "./validated-learning-event";

/**
 * CC-7.2 — the DYNAMIC firewall, DB-level, in two independent parts
 * (ADR 0017 §8, ADR 0018 transition plan):
 *
 *   Part 1 (educational): persisting the seven V1 learning events PLUS every
 *   real educational surface (ReadingSession, UserProgress, Highlight,
 *   Annotation) leaves the CANONICAL MAP PROJECTION byte-for-byte identical —
 *   no exception of any kind. The negative control (a legitimate check-in
 *   DOES move the projection) proves within Part 1 itself that the
 *   projection is neither frozen nor served from a stale cache.
 *
 *   Part 2 (ARC): Resonance operations produce EXACTLY the T0–T7 transition
 *   matrix — deltas confined to conexion (ARC-C1) / proposito (ARC-P1) with
 *   their registered evidence, duplicate idempotency, and full reversibility
 *   back to the T0 baseline.
 *
 * Real PostgreSQL, real migrations, real services (EmotionalMapService with
 * its cache identity over the real redis factory's ioredis-mock,
 * ResonancesService, MoodService), never a byte-identical raw-response
 * comparison. Runs under `test:locks`; skipped without TEST_DATABASE_URL.
 */

// The map read path fails closed without the kill switch (PR-0.2); flags are
// env-read at call time, so declaring it here is the real mechanism.
process.env.EMOTIONAL_MAP_PUBLIC = "on";

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc72_firewall_db";
const API_DIR = process.cwd();

const U1 = "u-cc72-fw-edu";
const U2 = "u-cc72-fw-arc";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const key = (n: number) =>
  `bbbbbbbb-bbbb-4bbb-9bbb-${String(n).padStart(12, "0")}`;

/** Served dimension values are rounded to 2 decimals by the scoring. */
const round2 = (v: number) => Math.round(v * 100) / 100;

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/**
 * The canonical projection: everything semantically meaningful — axes and
 * their order, value, confidence, status/measured, sources, evidence,
 * provenance, momento, affect dynamics, coverage, pct, v2 marker — with ONLY
 * the operational/non-deterministic fields excluded (`computedAt` is the
 * compute clock; `narrative` is the optional non-deterministic LLM copy).
 * The JSON round-trip normalizes `undefined` vs absent.
 */
function canonicalMapProjection(
  map: EmotionalMapResult,
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the excluded fields, keep the rest
  const { computedAt: _clock, narrative: _copy, ...semantic } = map;
  return JSON.parse(JSON.stringify(semantic)) as Record<string, unknown>;
}

type Projection = ReturnType<typeof canonicalMapProjection>;
interface ProjectedDimension {
  key: string;
  value: number;
  confidence: number;
  measured?: boolean;
  evidence?: { modelId: string; n: number } | null;
  sources: string;
}
const dim = (p: Projection, k: string): ProjectedDimension => {
  const d = (p.dimensions as ProjectedDimension[]).find((x) => x.key === k);
  if (!d) throw new Error(`projection has no dimension '${k}'`);
  return d;
};

suite("CC-7.2 · dynamic emotional firewall (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let emotionalMap: EmotionalMapService;
  let resonances: ResonancesService;
  let mood: MoodService;
  let repo: LearningEventRepository;
  let chapterId: string;
  let blockId: string;

  /** Real recompute path: bump the user's cache generation, then read. */
  async function freshProjection(userId: string): Promise<Projection> {
    await emotionalMap.invalidate(userId);
    return canonicalMapProjection(await emotionalMap.getForUser(userId));
  }

  async function seedSignal(
    userId: string,
    moodLogs: number,
    checkins: number,
  ): Promise<void> {
    // Backdated ELIGIBLE mood observations built by the REAL normalizer, so
    // every server-owned column (and the INV-1 CHECK) matches what the mood
    // surface itself would have written.
    const cycle = ["good", "ok", "good", "great", "good"] as const;
    for (let i = 0; i < moodLogs; i++) {
      const raw = cycle[i % cycle.length];
      const norm = deriveMoodNormalization({
        raw,
        source: "MOOD_LOG",
        selectionVersion: "mood-log-v1",
      });
      await prisma.moodLog.create({
        data: {
          userId,
          mood: norm.moodNormalized as string,
          ...norm,
          createdAt: daysAgo(2 + i * 2),
        },
      });
    }
    // Diary metadata (opaque dummy cipher — scoring reads mood/tags only).
    const diaryMoods = ["good", "hard", "good", "low", "good", "hard"];
    for (let i = 0; i < Math.min(6, moodLogs); i++) {
      await prisma.diaryEntry.create({
        data: {
          userId,
          textCiphertext: "b64stub-cipher",
          textNonce: "b64stub-nonce",
          mood: diaryMoods[i % diaryMoods.length],
          tags: i % 2 === 0 ? ["familia", "trabajo"] : [],
          createdAt: daysAgo(3 + i * 3),
        },
      });
    }
    for (let i = 0; i < checkins; i++) {
      await prisma.checkinResponse.create({
        data: {
          userId,
          itemKey: CHECKIN_ITEMS[i % CHECKIN_ITEMS.length].key,
          score: 3,
          createdAt: daysAgo(4 + i * 2),
        },
      });
    }
  }

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    // Real cache-identity semantics over the REAL redis factory (no
    // REDIS_URL → the same ioredis-mock production dev-mode would use).
    const redis = createRedisClient({
      get: () => undefined,
    } as never);

    // Under V2 the provider must NEVER score (decision L3) — a throwing stub
    // turns any regression into a hard failure. No `narrate` ⇒ deterministic
    // maps with narrative null.
    const provider: IEmotionalMapProvider = {
      name: "cc72-firewall-stub",
      score: () => {
        throw new Error(
          "provider.score() was invoked — the V2 contract forbids LLM axis scoring",
        );
      },
    };

    emotionalMap = new EmotionalMapService(
      prisma as unknown as PrismaService,
      provider,
      redis,
    );
    resonances = new ResonancesService(
      prisma as unknown as PrismaService,
      emotionalMap,
    );
    mood = new MoodService(prisma as unknown as PrismaService, emotionalMap);
    repo = new LearningEventRepository(prisma);

    await prisma.user.createMany({
      data: [
        { id: U1, email: "cc72-fw-edu@test.local", name: "FW Edu" },
        { id: U2, email: "cc72-fw-arc@test.local", name: "FW Arc" },
      ],
    });
    // Content rows for the educational surfaces' FKs.
    const book = await prisma.book.create({
      data: { slug: "cc72-fw-book", title: "CC72 FW" },
    });
    const chapter = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "Cap 1" },
    });
    chapterId = chapter.id;
    const block = await prisma.chapterBlock.create({
      data: {
        chapterId,
        order: 0,
        kind: "PARAGRAPH",
        content: "contenido público del capítulo",
      },
    });
    blockId = block.id;

    await seedSignal(U1, 20, 4);
    await seedSignal(U2, 10, 3);
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PART 1 — educational activity ⇒ ZERO delta (no exception of any kind)
  // ─────────────────────────────────────────────────────────────────────────

  it("Parte 1 · the full educational batch leaves the canonical projection identical", async () => {
    const before = await freshProjection(U1);

    // The baseline is a REAL, stable emotional signal — this test must never
    // pass by comparing two empty maps.
    expect(before.coverage as number).toBeGreaterThan(0.15);
    expect(before.momento).not.toBeNull();
    expect(before.v2).toBe(true);
    expect(dim(before, "calma").confidence).toBeGreaterThan(0);
    expect(dim(before, "claridad").confidence).toBeGreaterThan(0);

    // 1) The seven V1 learning events, persisted through the single writer.
    //    (guide_session_* are persisted RECORDS with their typed payloads —
    //    no GuideSession model exists yet, by design of this PR.)
    const batch: ValidatedLearningEvent[] = [
      {
        userId: U1,
        idempotencyKey: key(1),
        type: "unit_opened",
        payload: { editionKey: "cc72-fw-book-1e", unitKey: "unit-1" },
      },
      {
        userId: U1,
        idempotencyKey: key(2),
        type: "unit_completed",
        payload: {
          editionKey: "cc72-fw-book-1e",
          unitKey: "unit-1",
          revisionNumber: 1,
        },
      },
      {
        userId: U1,
        idempotencyKey: key(3),
        type: "concept_explored",
        payload: { conceptKey: "familia-ensamblada", unitKey: "unit-1" },
      },
      {
        userId: U1,
        idempotencyKey: key(4),
        type: "guide_session_started",
        payload: { guideSessionId: "gs-fw-1" },
        guideSessionId: "gs-fw-1",
      },
      {
        userId: U1,
        idempotencyKey: key(5),
        type: "guide_session_completed",
        payload: { guideSessionId: "gs-fw-1", stepsCompleted: 5 },
        guideSessionId: "gs-fw-1",
      },
      {
        userId: U1,
        idempotencyKey: key(6),
        type: "active_recall_attempted",
        payload: {
          unitKey: "unit-1",
          itemKey: "item-1",
          conceptKey: "familia-ensamblada",
          evaluationSource: "server",
          selectedOptionKey: "option-b",
          result: "correct",
        },
      },
      {
        userId: U1,
        idempotencyKey: key(7),
        type: "practice_completed",
        payload: { exerciseKey: "respiracion-1", unitKey: "unit-1" },
      },
    ];
    for (const event of batch) {
      const res = await repo.appendValidated(event);
      expect(res.created).toBe(true);
    }

    // 2) Every REAL educational surface that exists today. (There is no
    //    standalone quiz/recall table yet — the V1 event above IS the recall
    //    record; nothing is invented.)
    await prisma.readingSession.create({
      data: {
        userId: U1,
        chapterId,
        progressPct: 82,
        timeSpentSec: 940,
        completedAt: new Date(),
      },
    });
    await prisma.userProgress.create({
      data: { userId: U1, chapterId },
    });
    await prisma.highlight.create({
      data: {
        userId: U1,
        blockId,
        startOffset: 0,
        endOffset: 12,
        color: "YELLOW",
        quote: "contenido púb",
      },
    });
    await prisma.annotation.create({
      data: { userId: U1, blockId, text: "nota del lector" },
    });

    // 3) Real invalidation + real recompute — a cached equality would prove
    //    nothing (the negative control below guards against exactly that).
    const after = await freshProjection(U1);
    expect(after).toEqual(before);
  });

  it("Parte 1 · negative control: a legitimate check-in DOES move the projection", async () => {
    const baseline = await freshProjection(U1);

    // Real surface, real invalidation path (logCheckin busts the cache; we
    // force the recompute deterministically through the same real mechanism).
    await mood.logCheckin(U1, CHECKIN_ITEMS[0].key, 4);

    const afterCheckin = await freshProjection(U1);
    expect(afterCheckin).not.toEqual(baseline);
    // The moved axis is the check-in's own (claridad for item 0):
    expect(dim(afterCheckin, CHECKIN_ITEMS[0].axis)).not.toEqual(
      dim(baseline, CHECKIN_ITEMS[0].axis),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PART 2 — ARC transition matrix T0–T7 (ADR 0018)
  // ─────────────────────────────────────────────────────────────────────────

  it("Parte 2 · Resonance transitions produce exactly the T0–T7 matrix and revert to baseline", async () => {
    const OTHERS = ["calma", "claridad", "compasion", "consciencia"] as const;
    const confirmDto = (conceptKey: string): ConfirmResonanceDto =>
      ({
        conceptKey,
        conceptLabel: `Tema ${conceptKey}`,
        bookSlug: "cc72-fw-book",
        chapterOrder: 1,
        source: "highlight",
      }) as ConfirmResonanceDto;

    // T0 — baseline (isolated user, zero resonances).
    expect(await prisma.resonance.count({ where: { userId: U2 } })).toBe(0);
    const B = await freshProjection(U2);
    expect(dim(B, "conexion").confidence).toBe(0);
    expect(dim(B, "proposito").confidence).toBe(0);

    // T1 — confirm A (important=false): only conexion may change.
    const a = await resonances.confirm(U2, confirmDto("concepto-a"));
    const T1 = await freshProjection(U2);
    expect(dim(T1, "conexion")).not.toEqual(dim(B, "conexion"));
    expect(dim(T1, "conexion").value).toBe(round2(1 / RESONANCE_GOOD_N));
    expect(dim(T1, "conexion").confidence).toBe(round2(1 / RESONANCE_CONF_N));
    expect(dim(T1, "conexion").measured).toBe(true);
    expect(dim(T1, "conexion").evidence).toEqual({ modelId: "ARC-C1", n: 1 });
    expect(dim(T1, "proposito")).toEqual(dim(B, "proposito"));
    for (const axis of OTHERS) {
      expect(dim(T1, axis), axis).toEqual(dim(B, axis));
    }

    // T2 — confirm A again: idempotent (one row, same projection as T1).
    await resonances.confirm(U2, confirmDto("concepto-a"));
    const T2 = await freshProjection(U2);
    expect(await prisma.resonance.count({ where: { userId: U2 } })).toBe(1);
    expect(dim(T2, "conexion")).toEqual(dim(T1, "conexion"));
    expect(dim(T2, "conexion").evidence).toEqual({ modelId: "ARC-C1", n: 1 });
    expect(dim(T2, "proposito")).toEqual(dim(T1, "proposito"));

    // T3 — mark A important: only proposito may change.
    await resonances.setImportant(U2, a.resonance.id, true);
    const T3 = await freshProjection(U2);
    expect(dim(T3, "proposito")).not.toEqual(dim(T2, "proposito"));
    expect(dim(T3, "proposito").value).toBe(round2(1 / IMPORTANT_GOOD_N));
    expect(dim(T3, "proposito").confidence).toBe(
      round2(Math.min(1, 1 / IMPORTANT_CONF_N)),
    );
    expect(dim(T3, "proposito").measured).toBe(true);
    expect(dim(T3, "proposito").evidence).toEqual({ modelId: "ARC-P1", n: 1 });
    expect(dim(T3, "conexion")).toEqual(dim(T2, "conexion"));
    for (const axis of OTHERS) {
      expect(dim(T3, axis), axis).toEqual(dim(B, axis));
    }

    // T4 — unmark important: proposito reverts to its pre-T3 state; ARC-P1
    // stops contributing signal.
    await resonances.setImportant(U2, a.resonance.id, false);
    const T4 = await freshProjection(U2);
    expect(dim(T4, "proposito")).toEqual(dim(T2, "proposito"));
    expect(dim(T4, "proposito").measured).toBe(false);
    expect(dim(T4, "proposito").confidence).toBe(0);
    expect(dim(T4, "conexion")).toEqual(dim(T2, "conexion"));

    // T5 — confirm B, C, D, E: distinct concepts saturate value (GOOD_N=4)
    // and confidence (CONF_N=2); a duplicate does NOT increment n.
    const others = ["concepto-b", "concepto-c", "concepto-d", "concepto-e"];
    const created: string[] = [];
    for (const c of others) {
      const r = await resonances.confirm(U2, confirmDto(c));
      created.push(r.resonance.id);
    }
    await resonances.confirm(U2, confirmDto("concepto-b")); // duplicate
    const T5 = await freshProjection(U2);
    expect(await prisma.resonance.count({ where: { userId: U2 } })).toBe(5);
    expect(RESONANCE_GOOD_N).toBe(4);
    expect(RESONANCE_CONF_N).toBe(2);
    expect(dim(T5, "conexion").value).toBe(1); // clamp01(5/4)
    expect(dim(T5, "conexion").confidence).toBe(1); // clamp01(5/2)
    expect(dim(T5, "conexion").evidence).toEqual({ modelId: "ARC-C1", n: 5 });
    for (const axis of OTHERS) {
      expect(dim(T5, axis), axis).toEqual(dim(B, axis));
    }

    // T6 — mark three important: proposito saturates per IMPORTANT_*.
    for (const id of [a.resonance.id, created[0], created[1]]) {
      await resonances.setImportant(U2, id, true);
    }
    const T6 = await freshProjection(U2);
    expect(IMPORTANT_GOOD_N).toBe(3);
    expect(IMPORTANT_CONF_N).toBe(1);
    expect(dim(T6, "proposito").value).toBe(1); // clamp01(3/3)
    expect(dim(T6, "proposito").confidence).toBe(1); // clamp01(3/1)
    expect(dim(T6, "proposito").evidence).toEqual({ modelId: "ARC-P1", n: 3 });
    for (const axis of OTHERS) {
      expect(dim(T6, axis), axis).toEqual(dim(B, axis));
    }

    // T7 — remove every resonance: the ENTIRE canonical projection reverts
    // to the T0 baseline (full reversibility, INV-5).
    const list = await resonances.list(U2);
    for (const r of list.resonances) {
      await resonances.remove(U2, r.id);
    }
    expect(await prisma.resonance.count({ where: { userId: U2 } })).toBe(0);
    const T7 = await freshProjection(U2);
    expect(T7).toEqual(B);

    // Throughout the whole matrix: no LearningEvent was created for (or read
    // into) this user's scoring — the ARC path never touches the log.
    expect(await prisma.learningEvent.count({ where: { userId: U2 } })).toBe(0);
  });
});
