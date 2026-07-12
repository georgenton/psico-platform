import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResonancesService } from "./resonances.service";

function makePrisma() {
  return {
    resonance: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makeEmotionalMap() {
  return { invalidate: vi.fn().mockResolvedValue(undefined) };
}

const ROW = {
  id: "res-1",
  conceptKey: "eec-cuerpo-antes-que-mente",
  conceptLabel: "El cuerpo sabe antes que la mente",
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  source: "HIGHLIGHT",
  confirmedAt: new Date("2026-07-10T12:00:00Z"),
  important: false,
};

describe("ResonancesService — Fase E (ARC cycle)", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emotionalMap: ReturnType<typeof makeEmotionalMap>;
  let service: ResonancesService;

  beforeEach(() => {
    prisma = makePrisma();
    emotionalMap = makeEmotionalMap();
    service = new ResonancesService(prisma as never, emotionalMap as never);
  });

  it("lists the user's confirmed resonances mapped to the wire shape", async () => {
    prisma.resonance.findMany.mockResolvedValue([ROW]);
    const res = await service.list("user-1");
    expect(prisma.resonance.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { confirmedAt: "desc" },
    });
    expect(res.resonances).toEqual([
      {
        id: "res-1",
        conceptKey: "eec-cuerpo-antes-que-mente",
        conceptLabel: "El cuerpo sabe antes que la mente",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        source: "highlight",
        confirmedAt: "2026-07-10T12:00:00.000Z",
        important: false,
      },
    ]);
  });

  it("confirm upserts by (userId, conceptKey) and busts the map cache", async () => {
    prisma.resonance.upsert.mockResolvedValue(ROW);
    const res = await service.confirm("user-1", {
      conceptKey: ROW.conceptKey,
      conceptLabel: ROW.conceptLabel,
      bookSlug: ROW.bookSlug,
      chapterOrder: 1,
      source: "highlight",
    });
    expect(prisma.resonance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_conceptKey: {
            userId: "user-1",
            conceptKey: ROW.conceptKey,
          },
        },
        create: expect.objectContaining({
          userId: "user-1",
          source: "HIGHLIGHT",
        }),
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.resonance.source).toBe("highlight");
    expect(emotionalMap.invalidate).toHaveBeenCalledWith("user-1");
  });

  it("Fase H — setImportant toggles the flag scoped by userId and busts the cache", async () => {
    prisma.resonance.findUniqueOrThrow.mockResolvedValue({
      ...ROW,
      important: true,
    });
    const res = await service.setImportant("user-1", "res-1", true);
    expect(prisma.resonance.updateMany).toHaveBeenCalledWith({
      where: { id: "res-1", userId: "user-1" },
      data: { important: true },
    });
    expect(res.resonance.important).toBe(true);
    expect(emotionalMap.invalidate).toHaveBeenCalledWith("user-1");
  });

  it("Fase H — setImportant throws 404 when the row is not the user's", async () => {
    prisma.resonance.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.setImportant("user-1", "someone-elses", true),
    ).rejects.toThrow(NotFoundException);
    expect(emotionalMap.invalidate).not.toHaveBeenCalled();
  });

  it("remove deletes scoped by userId (ownership) and busts the cache", async () => {
    await service.remove("user-1", "res-1");
    expect(prisma.resonance.deleteMany).toHaveBeenCalledWith({
      where: { id: "res-1", userId: "user-1" },
    });
    expect(emotionalMap.invalidate).toHaveBeenCalledWith("user-1");
  });

  it("remove throws 404 when the row is not the user's (zero matches)", async () => {
    prisma.resonance.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove("user-1", "someone-elses")).rejects.toThrow(
      NotFoundException,
    );
    expect(emotionalMap.invalidate).not.toHaveBeenCalled();
  });
});
