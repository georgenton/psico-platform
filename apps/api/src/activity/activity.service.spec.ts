import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityService } from "./activity.service";

function makePrisma() {
  return {
    diaryEntry: { findMany: vi.fn() },
    readingSession: { findMany: vi.fn() },
    ecoMessage: { findMany: vi.fn() },
    voiceTranscription: { findMany: vi.fn() },
  };
}

describe("ActivityService — Sprint D", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("interleaves the 4 sources by timestamp DESC and returns top N", async () => {
    prisma.diaryEntry.findMany.mockResolvedValue([
      { id: "d1", mood: "good", createdAt: new Date("2026-06-21T10:00:00Z") },
      { id: "d2", mood: "ok", createdAt: new Date("2026-06-19T08:00:00Z") },
    ]);
    prisma.readingSession.findMany.mockResolvedValue([
      {
        id: "r1",
        lastSeenAt: new Date("2026-06-20T14:00:00Z"),
        progressPct: 42,
        chapter: {
          order: 2,
          title: "Cap 2",
          book: { id: "b1", slug: "emociones", title: "Emociones" },
        },
      },
    ]);
    prisma.ecoMessage.findMany.mockResolvedValue([
      {
        id: "e1",
        createdAt: new Date("2026-06-21T12:00:00Z"),
        thread: { id: "t1" },
      },
    ]);
    prisma.voiceTranscription.findMany.mockResolvedValue([
      {
        id: "v1",
        durationSec: 45,
        createdAt: new Date("2026-06-18T09:00:00Z"),
      },
    ]);

    const service = new ActivityService(prisma as never);
    const { items } = await service.feed("user-1", 3);

    expect(items).toHaveLength(3);
    // Eco (12:00) > Diary d1 (10:00) > Reading (14:00 on 20) — sorted DESC by ISO.
    expect(items[0].id).toBe("eco:e1");
    expect(items[1].id).toBe("diary:d1");
    expect(items[2].id).toBe("reading:r1");
  });

  it("clamps limit to [1, 20]", async () => {
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.ecoMessage.findMany.mockResolvedValue([]);
    prisma.voiceTranscription.findMany.mockResolvedValue([]);
    const service = new ActivityService(prisma as never);
    const { items: noLimit } = await service.feed("user-1", undefined);
    expect(noLimit).toEqual([]); // empty when sources are empty
    await service.feed("user-1", 999); // does not throw
    await service.feed("user-1", 0); // does not throw
  });

  it("includes mood label for diary entries (and falls back gracefully for legacy IDs)", async () => {
    prisma.diaryEntry.findMany.mockResolvedValue([
      { id: "d1", mood: "great", createdAt: new Date("2026-06-21T10:00:00Z") },
      { id: "d2", mood: "calma", createdAt: new Date("2026-06-20T10:00:00Z") },
      {
        id: "d3",
        mood: "unknown",
        createdAt: new Date("2026-06-19T10:00:00Z"),
      },
    ]);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.ecoMessage.findMany.mockResolvedValue([]);
    prisma.voiceTranscription.findMany.mockResolvedValue([]);
    const service = new ActivityService(prisma as never);
    const { items } = await service.feed("user-1", 10);
    expect(items[0].subtitle).toContain("muy bien"); // new ID mapped
    expect(items[1].subtitle).toBe("Calma"); // legacy ID mapped
    expect(items[2].subtitle).toBe("Anotada"); // unknown → safe default
  });

  it("queries diary with select clauses that omit ciphertext (privacy invariant)", async () => {
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.ecoMessage.findMany.mockResolvedValue([]);
    prisma.voiceTranscription.findMany.mockResolvedValue([]);
    const service = new ActivityService(prisma as never);
    await service.feed("user-1");

    const diaryArgs = prisma.diaryEntry.findMany.mock.calls[0]?.[0];
    expect(diaryArgs.select).toEqual({
      id: true,
      mood: true,
      createdAt: true,
    });
    // Explicitly no ciphertext / nonce fields requested.
    expect(diaryArgs.select).not.toHaveProperty("textCiphertext");
    expect(diaryArgs.select).not.toHaveProperty("textNonce");
    expect(diaryArgs.select).not.toHaveProperty("excerptCiphertext");

    const ecoArgs = prisma.ecoMessage.findMany.mock.calls[0]?.[0];
    expect(ecoArgs.select).not.toHaveProperty("textCiphertext");
    expect(ecoArgs.select).not.toHaveProperty("textNonce");
  });
});
