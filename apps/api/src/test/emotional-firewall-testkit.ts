import type { PrismaClient } from "@prisma/client";
import { expect } from "vitest";
import { CHECKIN_ITEMS } from "@psico/types";
import type { EmotionalMapResult } from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmotionalMapService } from "../emotional-map/emotional-map.service";
import type { IEmotionalMapProvider } from "../emotional-map/providers/provider.interface";
import { deriveMoodNormalization } from "../mood/mood-normalization";
import type { PrismaService } from "../prisma";
import { createRedisClient } from "../redis/redis.module";

/**
 * The SHARED definition of the emotional firewall.
 *
 * Two suites assert that an educational transition changes NOTHING emotional:
 * `learning-firewall.pg-spec.ts` (CC-7.2, domain level) and
 * `guide-firewall.e2e-spec.ts` (CC-7.4D, the full HTTP stack). They must not
 * each carry their own idea of what "the Map" is or what counts as "an
 * emotional signal" — a drift between two independent lists would let a real
 * leak pass in one while the other still reported a green firewall.
 *
 * So the canonical projection, the real recompute path, the seeding of a real
 * signal and the non-empty baseline assertion live HERE, once.
 */

/**
 * The canonical projection: everything semantically meaningful — axes and
 * their order, value, confidence, status/measured, sources, evidence,
 * provenance, momento, affect dynamics, coverage, pct, v2 marker — with ONLY
 * the operational/non-deterministic fields excluded (`computedAt` is the
 * compute clock; `narrative` is the optional non-deterministic LLM copy).
 * The JSON round-trip normalizes `undefined` vs absent.
 */
export function canonicalMapProjection(
  map: EmotionalMapResult,
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the excluded fields, keep the rest
  const { computedAt: _clock, narrative: _copy, ...semantic } = map;
  return JSON.parse(JSON.stringify(semantic)) as Record<string, unknown>;
}

export type MapProjection = ReturnType<typeof canonicalMapProjection>;

export interface ProjectedDimension {
  key: string;
  value: number;
  confidence: number;
  measured?: boolean;
  evidence?: { modelId: string; n: number } | null;
  sources: string;
}

/** Read one axis out of a projection, failing loudly if it is absent. */
export function projectedDimension(
  projection: MapProjection,
  key: string,
): ProjectedDimension {
  const found = (projection.dimensions as ProjectedDimension[]).find(
    (d) => d.key === key,
  );
  if (!found) throw new Error(`projection has no dimension '${key}'`);
  return found;
}

/**
 * An `EmotionalMapService` wired exactly as a firewall needs it: the REAL
 * redis factory (no `REDIS_URL` ⇒ the same ioredis-mock production dev-mode
 * uses, so cache identity and invalidation are real), and a provider whose
 * `score()` THROWS — under V2 the LLM must never score an axis (decision L3),
 * so a regression becomes a hard failure instead of a silent value. No
 * `narrate` ⇒ deterministic maps with `narrative: null`.
 */
export function createFirewallEmotionalMapService(
  prisma: PrismaClient,
  stubName: string,
): EmotionalMapService {
  const redis = createRedisClient({ get: () => undefined } as never);
  const provider: IEmotionalMapProvider = {
    name: stubName,
    score: () => {
      throw new Error(
        "provider.score() was invoked — the V2 contract forbids LLM axis scoring",
      );
    },
  };
  return new EmotionalMapService(
    prisma as unknown as PrismaService,
    provider,
    redis,
  );
}

/**
 * The REAL recompute path: bump the user's cache generation, then read. An
 * equality that skipped this would only prove the cache stayed warm.
 */
export async function freshProjection(
  emotionalMap: EmotionalMapService,
  userId: string,
): Promise<MapProjection> {
  await emotionalMap.invalidate(userId);
  return canonicalMapProjection(await emotionalMap.getForUser(userId));
}

const DAY = 86_400_000;
export const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);

/**
 * Seed a REAL emotional signal for a user.
 *
 * Mood observations go through the REAL normalizer, so every server-owned
 * column (and the INV-1 eligibility CHECK) matches what the mood surface
 * itself would have written. Diary rows carry opaque dummy ciphertext — the
 * scoring reads only the plaintext `mood`/`tags` metadata, never the body.
 * Check-ins use the real catalog.
 *
 * This is what makes a firewall meaningful: comparing two EMPTY maps proves
 * nothing at all.
 */
export async function seedEmotionalSignal(
  prisma: PrismaClient,
  userId: string,
  options: { moodLogs: number; checkins: number },
): Promise<void> {
  const cycle = ["good", "ok", "good", "great", "good"] as const;
  for (let i = 0; i < options.moodLogs; i++) {
    const norm = deriveMoodNormalization({
      raw: cycle[i % cycle.length],
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

  const diaryMoods = ["good", "hard", "good", "low", "good", "hard"];
  for (let i = 0; i < Math.min(6, options.moodLogs); i++) {
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

  for (let i = 0; i < options.checkins; i++) {
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

/**
 * Refuse to certify a firewall over an EMPTY map. Without coverage, without a
 * momento and without a single axis carrying signal, "nothing changed" is
 * trivially true and proves nothing about the code under test.
 */
export function assertNonEmptyEmotionalBaseline(
  projection: MapProjection,
): void {
  expect(
    typeof projection.coverage === "number" ? projection.coverage : 0,
  ).toBeGreaterThan(0);
  expect(projection.momento ?? null).not.toBeNull();
  const dimensions = (projection.dimensions ?? []) as ProjectedDimension[];
  expect(dimensions.some((d) => d.confidence > 0)).toBe(true);
}
