import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";

import { EmotionalMapService } from "./emotional-map.service";
import { EmotionalMapSnapshotProcessor } from "../jobs/processors/emotional-map-snapshot.processor";
import { JobName, QueueName } from "../jobs/queue-names";
import type { IEmotionalMapProvider } from "./providers/provider.interface";

/**
 * PR-0.2 — the EMOTIONAL_MAP_PUBLIC fail-closed kill switch.
 *
 * When the switch is off, the WHOLE surface goes down deliberately: the endpoint
 * 503s, Home returns null, the worker persists nothing — and, the property that
 * matters most, SCORING IS NEVER INVOKED on any of those paths. A `provider`
 * whose `score()` throws proves that: if anything reached it, the test would
 * blow up with the wrong error.
 */

/** A provider that must NOT be called while the switch is off. */
function tripwireProvider(): IEmotionalMapProvider {
  return {
    name: "tripwire",
    score: vi.fn(async () => {
      throw new Error("scoring was invoked while EMOTIONAL_MAP_PUBLIC was off");
    }),
  };
}

/** Prisma whose every method throws — nothing should be read while off. */
function tripwirePrisma() {
  return new Proxy(
    {},
    {
      get() {
        return new Proxy(
          {},
          {
            get() {
              return () => {
                throw new Error("prisma was queried while the switch was off");
              };
            },
          },
        );
      },
    },
  );
}

function tripwireRedis() {
  return {
    get: vi.fn(() => {
      throw new Error("redis was read while the switch was off");
    }),
    set: vi.fn(),
    incr: vi.fn(),
  };
}

describe("EmotionalMapService — EMOTIONAL_MAP_PUBLIC kill switch (PR-0.2)", () => {
  const KEY = "EMOTIONAL_MAP_PUBLIC";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  it("getForUser 503s with EMOTIONAL_MAP_UNAVAILABLE — never touching scoring, prisma or redis", async () => {
    process.env[KEY] = "off";
    const provider = tripwireProvider();
    const service = new EmotionalMapService(
      tripwirePrisma() as never,
      provider,
      tripwireRedis() as never,
    );

    await expect(service.getForUser("user-1")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    // And with the exact code the client keys off.
    try {
      await service.getForUser("user-1");
      throw new Error("expected a throw");
    } catch (err) {
      const body = (err as ServiceUnavailableException).getResponse();
      expect((body as { code: string }).code).toBe("EMOTIONAL_MAP_UNAVAILABLE");
    }

    // The tripwires never fired.
    expect(provider.score).not.toHaveBeenCalled();
  });

  it("getForHome returns null (never throws) when the switch is off — no scoring", async () => {
    process.env[KEY] = "off";
    const provider = tripwireProvider();
    const service = new EmotionalMapService(
      tripwirePrisma() as never,
      provider,
      tripwireRedis() as never,
    );

    await expect(service.getForHome("user-1")).resolves.toBeNull();
    expect(provider.score).not.toHaveBeenCalled();
  });

  it("getForHome delegates to getForUser when the switch is on (default)", async () => {
    delete process.env[KEY]; // default is on
    // A service whose getForUser we can observe without a full compute.
    const service = new EmotionalMapService(
      {} as never,
      tripwireProvider(),
      {} as never,
    );
    const spy = vi
      .spyOn(service, "getForUser")
      .mockResolvedValue({ ok: true } as never);

    await expect(service.getForHome("user-1")).resolves.toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith("user-1");
  });
});

describe("EmotionalMapSnapshotProcessor — kill switch (PR-0.2)", () => {
  const KEY = "EMOTIONAL_MAP_PUBLIC";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  const JOB = {
    name: JobName.RUN_EMOTIONAL_MAP_SNAPSHOT,
    queueName: QueueName.EMOTIONAL_MAP_SNAPSHOT,
    data: {},
  };

  it("computes and persists NOTHING when the switch is off — a hard no-op, not a dry run", async () => {
    process.env[KEY] = "off";
    const compute = vi.fn(async () => {
      throw new Error("compute ran while the switch was off");
    });
    const prisma = {
      user: {
        findMany: vi.fn(async () => {
          throw new Error("candidates were queried while the switch was off");
        }),
      },
    };
    const processor = new EmotionalMapSnapshotProcessor(
      prisma as never,
      { compute } as never,
    );

    const result = await processor.process(JOB as never);

    expect(result.persisted).toBe(0);
    expect(result.candidates).toBe(0);
    expect(compute).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
