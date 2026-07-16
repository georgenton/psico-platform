import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { closeE2EApp, createE2EApp, type E2EHarness } from "../test/e2e-app";
import { EmotionalMapService } from "./emotional-map.service";
import type { IEmotionalMapProvider } from "./providers/provider.interface";

/**
 * PR-0.2 — real HTTP contract for the fail-closed kill switch.
 *
 * When EMOTIONAL_MAP_PUBLIC is off, `GET /api/emotional-map` must answer 503
 * with the machine-readable `EMOTIONAL_MAP_UNAVAILABLE` code, and it must do so
 * BEFORE touching any user data: the provider (LLM), Prisma (the map's reads)
 * and Redis (the map's cache) are never called on this path. The kill switch
 * is the first line of `getForUser`, so this is enforced structurally — this
 * spec proves it end-to-end through the real guards + exception filter.
 */
describe("GET /api/emotional-map — EMOTIONAL_MAP_PUBLIC off (PR-0.2)", () => {
  let h: E2EHarness;
  let bearer: string;
  let providerScore: MockInstance;
  let redisGet: MockInstance;
  let prevPublic: string | undefined;

  beforeAll(async () => {
    h = await createE2EApp();

    // A valid access token. JwtStrategy (ADR 0015) does a small User lookup to
    // check isActive + authRevision — that's on `user`, not the map's own
    // `diaryEntry` reads, so the kill-switch invariant below (map never queries
    // its data) still holds. The `ar` claim must match the mocked revision.
    const jwt = h.app.get(JwtService, { strict: false });
    bearer = jwt.sign({
      sub: "user-1",
      email: "user@example.com",
      role: "USER",
      plan: "PRO",
      ar: 0,
    });

    // Tripwire the map's own dependencies through the live service instance.
    const service = h.app.get(EmotionalMapService);
    const provider = (service as unknown as { provider: IEmotionalMapProvider })
      .provider;
    providerScore = vi.spyOn(provider, "score");
    redisGet = vi.spyOn(h.redis, "get");
  });

  afterAll(async () => {
    providerScore.mockRestore();
    redisGet.mockRestore();
    await closeE2EApp(h);
  });

  beforeEach(async () => {
    await h.resetMocks();
    providerScore.mockClear();
    redisGet.mockClear();
    // JwtStrategy looks the user up on every authed request (ADR 0015).
    h.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      role: "USER",
      plan: "PRO",
      isActive: true,
      authRevision: 0,
    });
    prevPublic = process.env.EMOTIONAL_MAP_PUBLIC;
    process.env.EMOTIONAL_MAP_PUBLIC = "off";
  });

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.EMOTIONAL_MAP_PUBLIC;
    else process.env.EMOTIONAL_MAP_PUBLIC = prevPublic;
  });

  it("returns 503 EMOTIONAL_MAP_UNAVAILABLE and never touches provider/Prisma/Redis", async () => {
    const res = await request(h.app.getHttpServer())
      .get("/api/emotional-map")
      .set("Authorization", `Bearer ${bearer}`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("EMOTIONAL_MAP_UNAVAILABLE");
    expect(typeof res.body.message).toBe("string");

    // The kill switch short-circuits before any user data is read: the LLM
    // provider is never asked to score, the map never queries Prisma, and the
    // map cache (redis.get) is never consulted.
    expect(providerScore).not.toHaveBeenCalled();
    expect(h.prisma.diaryEntry.findMany).not.toHaveBeenCalled();
    expect(redisGet).not.toHaveBeenCalled();
  });
});
