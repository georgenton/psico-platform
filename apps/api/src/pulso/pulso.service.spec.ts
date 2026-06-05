import { beforeEach, describe, expect, it, vi } from "vitest";
import { PulsoService } from "./pulso.service";

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ecoMessageReport: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as ConstructorParameters<typeof PulsoService>[0];
}

describe("PulsoService.getEcoReportSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a zero-filled summary when there are no reports", async () => {
    const svc = new PulsoService(buildPrisma());
    const summary = await svc.getEcoReportSummary();

    expect(summary.total).toBe(0);
    expect(summary.byReason).toEqual({
      HALLUCINATION: 0,
      OFF_TONE: 0,
      SENSITIVE_CONTENT: 0,
      CRISIS_MISHANDLED: 0,
      OTHER: 0,
    });
  });

  it("aggregates groupBy results into total + per-reason counts", async () => {
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn().mockResolvedValue([
          { reason: "HALLUCINATION", _count: { _all: 3 } },
          { reason: "OFF_TONE", _count: { _all: 5 } },
          { reason: "OTHER", _count: { _all: 1 } },
        ]),
        findMany: vi.fn(),
      } as never,
    });
    const svc = new PulsoService(prisma);
    const summary = await svc.getEcoReportSummary();

    expect(summary.total).toBe(9);
    expect(summary.byReason.HALLUCINATION).toBe(3);
    expect(summary.byReason.OFF_TONE).toBe(5);
    expect(summary.byReason.OTHER).toBe(1);
    expect(summary.byReason.CRISIS_MISHANDLED).toBe(0);
  });
});

describe("PulsoService.listEcoReports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rows shape with assistant text snippet, no ciphertext fields", async () => {
    const fixture = [
      {
        id: "r1",
        reason: "HALLUCINATION",
        comment: "made up",
        createdAt: new Date("2026-06-04T10:00:00Z"),
        userId: "u1",
        messageId: "m1",
        message: {
          id: "m1",
          threadId: "t1",
          assistantText: "  Hola, ¿cómo te sientes hoy?   ",
          kind: "ASSISTANT",
          createdAt: new Date("2026-06-04T09:59:00Z"),
        },
      },
    ];
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn().mockResolvedValue(fixture),
      } as never,
    });
    const svc = new PulsoService(prisma);
    const res = await svc.listEcoReports({});

    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.id).toBe("r1");
    expect(res.items[0]!.assistantTextSnippet).toBe(
      "Hola, ¿cómo te sientes hoy?",
    );
    expect(res.items[0]!.messageKind).toBe("ASSISTANT");
    // Privacy invariant — the row shape must NOT include any ciphertext.
    expect(JSON.stringify(res.items[0])).not.toContain("textCiphertext");
    expect(JSON.stringify(res.items[0])).not.toContain("textNonce");
  });

  it("paginates with nextCursor when there are more rows than limit", async () => {
    // Limit 2; service over-fetches by 1 to peek.
    const fixture = Array.from({ length: 3 }, (_, i) => ({
      id: `r${i}`,
      reason: "OFF_TONE",
      comment: null,
      createdAt: new Date(`2026-06-04T10:0${i}:00Z`),
      userId: "u1",
      messageId: `m${i}`,
      message: {
        id: `m${i}`,
        threadId: "t1",
        assistantText: "x",
        kind: "ASSISTANT",
        createdAt: new Date(),
      },
    }));
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: vi.fn().mockResolvedValue(fixture),
      } as never,
    });
    const svc = new PulsoService(prisma);
    const res = await svc.listEcoReports({ limit: 2 });

    expect(res.items).toHaveLength(2);
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBe("r1"); // last row of page
  });

  it("passes reason filter through to prisma where clause", async () => {
    const findManySpy = vi.fn().mockResolvedValue([]);
    const prisma = buildPrisma({
      ecoMessageReport: {
        groupBy: vi.fn(),
        findMany: findManySpy,
      } as never,
    });
    const svc = new PulsoService(prisma);
    await svc.listEcoReports({ reason: "CRISIS_MISHANDLED" });

    expect(findManySpy).toHaveBeenCalled();
    const call = findManySpy.mock.calls[0]![0] as { where: { reason: string } };
    expect(call.where).toEqual({ reason: "CRISIS_MISHANDLED" });
  });
});
