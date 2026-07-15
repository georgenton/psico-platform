import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ReflexionesService } from "./reflexiones.service";

// 32 chars unpadded base64url → 24 bytes (XChaCha20 nonce length).
const NONCE_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CIPHER_B64 = "Y2lwaGVydGV4dC1ibG9i"; // "ciphertext-blob" — opaque to server.

// PR-2B · the service now busts the emotional-map cache on write. The mock's
// `invalidateBestEffort` resolves to void so `void this.emotionalMap.invalidate…`
// is a no-op in tests.
function emotionalMapMock() {
  return { invalidateBestEffort: vi.fn().mockResolvedValue(undefined) };
}

function buildPrismaMock() {
  return {
    diaryEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    diaryPrompt: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    sharedDiaryEntry: {
      create: vi.fn(),
    },
  };
}

function buildEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    userId: "user-1",
    mood: "calma",
    kind: "free",
    promptId: null,
    prompt: null,
    tags: ["agradecimiento"],
    textCiphertext: CIPHER_B64,
    textNonce: NONCE_B64,
    excerptCiphertext: null,
    excerptNonce: null,
    audioUrl: null,
    audioDurationSec: null,
    createdAt: new Date("2026-05-20"),
    updatedAt: new Date("2026-05-20"),
    ...overrides,
  };
}

// ─── ReflexionesService.list ──────────────────────────────────────────────────────

describe("ReflexionesService.list", () => {
  let service: ReflexionesService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ReflexionesService(
      prisma as never,
      emotionalMapMock() as never,
    );
  });

  it("returns entries summary + moodMap + tags + pagination", async () => {
    const row = buildEntryRow();
    prisma.diaryEntry.findMany
      .mockResolvedValueOnce([row]) // list query
      .mockResolvedValueOnce([row]) // moodMap query
      .mockResolvedValueOnce([row]); // tag counts query
    prisma.diaryEntry.count.mockResolvedValue(1);

    const result = await service.list("user-1", {});

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe("entry-1");
    // The summary MUST NOT carry textCiphertext (that's detail-only).
    expect(
      (result.entries[0] as Record<string, unknown>).textCiphertext,
    ).toBeUndefined();
    expect(result.pagination).toEqual({ page: 1, perPage: 30, total: 1 });
    expect(result.moodMap.byDay).toBeDefined();
    expect(result.tags).toEqual([{ tag: "agradecimiento", count: 1 }]);
  });

  it("applies mood filter to the where clause", async () => {
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.diaryEntry.count.mockResolvedValue(0);

    await service.list("user-1", { mood: "ansiedad" });

    expect(prisma.diaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ mood: "ansiedad" }),
      }),
    );
  });

  it("applies tag filter using array `has`", async () => {
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.diaryEntry.count.mockResolvedValue(0);

    await service.list("user-1", { tag: "duelo" });

    expect(prisma.diaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tags: { has: "duelo" } }),
      }),
    );
  });

  it("computes moodMap byDay with most-recent-of-day semantics", async () => {
    // Two entries on the same day; the desc order means index 0 wins.
    const row1 = buildEntryRow({
      id: "e1",
      mood: "calma",
      createdAt: new Date("2026-05-20T18:00:00Z"),
    });
    const row2 = buildEntryRow({
      id: "e2",
      mood: "ansiedad",
      createdAt: new Date("2026-05-20T09:00:00Z"),
    });
    prisma.diaryEntry.findMany
      .mockResolvedValueOnce([row1, row2]) // list
      .mockResolvedValueOnce([row1, row2]) // moodMap
      .mockResolvedValueOnce([row1, row2]); // tag counts
    prisma.diaryEntry.count.mockResolvedValue(2);

    const result = await service.list("user-1", {});

    expect(result.moodMap.byDay["2026-05-20"]).toBe("calma");
  });
});

// ─── ReflexionesService.create ────────────────────────────────────────────────────

describe("ReflexionesService.create", () => {
  let service: ReflexionesService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ReflexionesService(
      prisma as never,
      emotionalMapMock() as never,
    );
  });

  it("rejects when excerpt cipher is sent without nonce (and vice versa)", async () => {
    await expect(
      service.create("user-1", {
        mood: "calma",
        textCiphertext: CIPHER_B64,
        textNonce: NONCE_B64,
        excerptCiphertext: "X",
        // excerptNonce missing on purpose
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when promptId references unknown prompt", async () => {
    prisma.diaryPrompt.findUnique.mockResolvedValue(null);

    await expect(
      service.create("user-1", {
        mood: "calma",
        textCiphertext: CIPHER_B64,
        textNonce: NONCE_B64,
        promptId: "ghost",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("persists cipher/nonce verbatim and echoes back excerptCiphertext", async () => {
    prisma.diaryEntry.create.mockResolvedValue({
      id: "new-1",
      createdAt: new Date("2026-05-26"),
      excerptCiphertext: "EXCERPT",
    });

    const result = await service.create("user-1", {
      mood: "calma",
      textCiphertext: CIPHER_B64,
      textNonce: NONCE_B64,
      excerptCiphertext: "EXCERPT",
      excerptNonce: NONCE_B64,
      tags: ["test"],
    });

    // The DB call must carry the exact cipher we received — no transform.
    expect(prisma.diaryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          textCiphertext: CIPHER_B64,
          textNonce: NONCE_B64,
        }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.excerptCiphertext).toBe("EXCERPT");
  });

  it("PR-2A: derives source=DIARY and is NOT eligible (no explicit signal) for a defaulted 'ok'", async () => {
    prisma.diaryEntry.create.mockResolvedValue({
      id: "n2",
      createdAt: new Date(),
      excerptCiphertext: null,
    });
    await service.create("user-1", {
      mood: "ok",
      textCiphertext: CIPHER_B64,
      textNonce: NONCE_B64,
    });
    expect(prisma.diaryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mood: "ok",
          moodProvenance: "DIARY",
          moodExplicitlySelected: false,
          moodEligibleForDynamics: false,
          moodExclusionReason: "ambiguous_default",
        }),
      }),
    );
  });

  it("PR-2A: derives source=DIARY and pre_normalizer_review for a non-'ok' canonical", async () => {
    prisma.diaryEntry.create.mockResolvedValue({
      id: "n3",
      createdAt: new Date(),
      excerptCiphertext: null,
    });
    await service.create("user-1", {
      mood: "good",
      textCiphertext: CIPHER_B64,
      textNonce: NONCE_B64,
    });
    expect(prisma.diaryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mood: "good",
          moodNormalized: "good",
          moodProvenance: "DIARY",
          moodEligibleForDynamics: false,
          moodExclusionReason: "pre_normalizer_review",
        }),
      }),
    );
  });

  it("PR-2A: a legacy reflexion mood is preserved raw but NEVER eligible / never 0", async () => {
    prisma.diaryEntry.create.mockResolvedValue({
      id: "n4",
      createdAt: new Date(),
      excerptCiphertext: null,
    });
    await service.create("user-1", {
      mood: "calma",
      textCiphertext: CIPHER_B64,
      textNonce: NONCE_B64,
    } as never);
    expect(prisma.diaryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mood: "calma", // raw preserved
          moodNormalized: null,
          moodEligibleForDynamics: false,
          moodExclusionReason: "legacy_vocabulary",
        }),
      }),
    );
  });

  it("PR-2B: create canonical + moodSelectionVersion 'explicit-v1' → eligible", async () => {
    prisma.diaryEntry.create.mockResolvedValue({
      id: "n5",
      createdAt: new Date(),
      excerptCiphertext: null,
    });
    await service.create("user-1", {
      mood: "good",
      moodSelectionVersion: "explicit-v1",
      textCiphertext: CIPHER_B64,
      textNonce: NONCE_B64,
    });
    expect(prisma.diaryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mood: "good",
          moodProvenance: "DIARY",
          moodExplicitlySelected: true,
          moodSelectionVersion: "explicit-v1",
          moodEligibleForDynamics: true,
          moodExclusionReason: null,
        }),
      }),
    );
  });

  it("PR-2B: create with NO mood → stored as null, not_selected, ineligible", async () => {
    prisma.diaryEntry.create.mockResolvedValue({
      id: "n6",
      createdAt: new Date(),
      excerptCiphertext: null,
    });
    await service.create("user-1", {
      // no mood at all
      textCiphertext: CIPHER_B64,
      textNonce: NONCE_B64,
    });
    expect(prisma.diaryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mood: null,
          moodNormalized: null,
          moodEligibleForDynamics: false,
          moodExclusionReason: "not_selected",
        }),
      }),
    );
  });

  it("PR-2B: create moodSelectionVersion WITHOUT a mood → 400, writes nothing", async () => {
    await expect(
      service.create("user-1", {
        moodSelectionVersion: "explicit-v1",
        textCiphertext: CIPHER_B64,
        textNonce: NONCE_B64,
      }),
    ).rejects.toThrow(/MOOD_SELECTION_WITHOUT_MOOD/);
    expect(prisma.diaryEntry.create).not.toHaveBeenCalled();
  });
});

// ─── ReflexionesService · mood integrity (never fabricate "ok") ─────────────────────

describe("ReflexionesService · mood integrity", () => {
  let service: ReflexionesService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ReflexionesService(
      prisma as never,
      emotionalMapMock() as never,
    );
  });

  it("PR-2B: a null-mood row is returned AS null — never coerced to 'ok'", async () => {
    // PR-2B makes the whole stack null-capable: a reflexión with no pick has
    // mood = null, and the summary returns it as null (the client renders
    // "Sin ánimo registrado"). No fabrication, no throw.
    prisma.diaryEntry.findMany
      .mockResolvedValueOnce([buildEntryRow({ mood: null })]) // page rows
      .mockResolvedValueOnce([]) // computeMoodMap
      .mockResolvedValueOnce([]); // computeTagCounts
    prisma.diaryEntry.count.mockResolvedValue(1);

    const result = await service.list("user-1", {});
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].mood).toBeNull();
  });
});

// ─── ReflexionesService.update ────────────────────────────────────────────────────

describe("ReflexionesService.update", () => {
  let service: ReflexionesService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ReflexionesService(
      prisma as never,
      emotionalMapMock() as never,
    );
  });

  it("rejects updating ciphertext without a fresh nonce", async () => {
    prisma.diaryEntry.findFirst.mockResolvedValue({ id: "entry-1" });

    await expect(
      service.update("user-1", "entry-1", {
        textCiphertext: "NEW_CIPHER",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects updating nonce without a fresh ciphertext", async () => {
    prisma.diaryEntry.findFirst.mockResolvedValue({ id: "entry-1" });

    await expect(
      service.update("user-1", "entry-1", { textNonce: NONCE_B64 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("404 when entry belongs to a different user", async () => {
    prisma.diaryEntry.findFirst.mockResolvedValue(null);

    await expect(
      service.update("user-1", "stolen-id", { mood: "alegria" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("PR-2B: PATCH mood=null CLEARS the mood (not_selected, ineligible)", async () => {
    prisma.diaryEntry.findFirst
      .mockResolvedValueOnce({
        id: "entry-1",
        mood: "good",
        moodEligibleForDynamics: true,
      }) // ownership + existing
      .mockResolvedValueOnce(buildEntryRow({ id: "entry-1", mood: null })); // getDetail
    prisma.diaryEntry.findMany.mockResolvedValue([]); // related
    prisma.diaryEntry.update.mockResolvedValue({});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.update("user-1", "entry-1", { mood: null } as any);

    expect(prisma.diaryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mood: null,
          moodNormalized: null,
          moodEligibleForDynamics: false,
          moodExclusionReason: "not_selected",
        }),
      }),
    );
  });

  it("PR-2B: PATCH mood + moodSelectionVersion 'explicit-v1' → eligible", async () => {
    prisma.diaryEntry.findFirst
      .mockResolvedValueOnce({
        id: "entry-1",
        mood: "ok",
        moodEligibleForDynamics: false,
      })
      .mockResolvedValueOnce(buildEntryRow({ id: "entry-1", mood: "great" }));
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.diaryEntry.update.mockResolvedValue({});

    await service.update("user-1", "entry-1", {
      mood: "great",
      moodSelectionVersion: "explicit-v1",
    });

    expect(prisma.diaryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mood: "great",
          moodProvenance: "DIARY",
          moodExplicitlySelected: true,
          moodSelectionVersion: "explicit-v1",
          moodEligibleForDynamics: true,
          moodExclusionReason: null,
        }),
      }),
    );
  });

  it("PR-2B: re-saving the SAME canonical mood WITHOUT an attestation does NOT degrade an eligible row", async () => {
    prisma.diaryEntry.findFirst
      .mockResolvedValueOnce({
        id: "entry-1",
        mood: "great",
        moodEligibleForDynamics: true,
      })
      .mockResolvedValueOnce(buildEntryRow({ id: "entry-1", mood: "great" }));
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.diaryEntry.update.mockResolvedValue({});

    // No moodSelectionVersion — an autosave carrying the current mood.
    await service.update("user-1", "entry-1", { mood: "great" });

    const data = prisma.diaryEntry.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    // The idempotent re-save leaves the mood columns untouched (no downgrade).
    expect("mood" in data).toBe(false);
    expect("moodEligibleForDynamics" in data).toBe(false);
  });

  it("PR-2B: moodSelectionVersion WITHOUT a mood → 400 and writes nothing", async () => {
    prisma.diaryEntry.findFirst.mockResolvedValue({
      id: "entry-1",
      mood: "good",
      moodEligibleForDynamics: true,
    });

    await expect(
      service.update("user-1", "entry-1", {
        moodSelectionVersion: "explicit-v1",
      }),
    ).rejects.toThrow(/MOOD_SELECTION_WITHOUT_MOOD/);
    expect(prisma.diaryEntry.update).not.toHaveBeenCalled();
  });

  it("PR-2A: PATCH without mood updates another field and leaves mood untouched", async () => {
    prisma.diaryEntry.findFirst
      .mockResolvedValueOnce({ id: "entry-1" }) // ownership
      .mockResolvedValueOnce(buildEntryRow({ id: "entry-1", mood: "good" })); // getDetail
    prisma.diaryEntry.findMany.mockResolvedValue([]); // related
    prisma.diaryEntry.update.mockResolvedValue({});

    await service.update("user-1", "entry-1", { tags: ["trabajo"] });

    const data = prisma.diaryEntry.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.tags).toEqual(["trabajo"]);
    expect("mood" in data).toBe(false);
    expect("moodProvenance" in data).toBe(false);
  });

  it("PR-2A: PATCH mood=good re-derives DIARY / explicit=false / ineligible", async () => {
    prisma.diaryEntry.findFirst
      .mockResolvedValueOnce({ id: "entry-1" }) // ownership
      .mockResolvedValueOnce(buildEntryRow({ id: "entry-1", mood: "good" })); // getDetail
    prisma.diaryEntry.findMany.mockResolvedValue([]); // related
    prisma.diaryEntry.update.mockResolvedValue({});

    await service.update("user-1", "entry-1", { mood: "good" });

    expect(prisma.diaryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mood: "good",
          moodProvenance: "DIARY",
          moodExplicitlySelected: false,
          moodEligibleForDynamics: false,
          moodExclusionReason: "pre_normalizer_review",
        }),
      }),
    );
  });
});

// ─── ReflexionesService.share ─────────────────────────────────────────────────────

describe("ReflexionesService.share", () => {
  let service: ReflexionesService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ReflexionesService(
      prisma as never,
      emotionalMapMock() as never,
    );
  });

  it("returns 404 when entry not owned by user", async () => {
    prisma.diaryEntry.findFirst.mockResolvedValue(null);

    await expect(
      service.share("user-1", "ghost", {
        therapistId: "th-1",
        ciphertextForTherapist: CIPHER_B64,
        wrappedKey: "WRAP",
        userOneShotPubKey: "PUB",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects expiry past server cap (30 days)", async () => {
    prisma.diaryEntry.findFirst.mockResolvedValue({ id: "entry-1" });
    const tooFar = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await expect(
      service.share("user-1", "entry-1", {
        therapistId: "th-1",
        ciphertextForTherapist: CIPHER_B64,
        wrappedKey: "WRAP",
        userOneShotPubKey: "PUB",
        expiresAt: tooFar,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("creates the share row with default 7-day expiry", async () => {
    prisma.diaryEntry.findFirst.mockResolvedValue({ id: "entry-1" });
    prisma.sharedDiaryEntry.create.mockResolvedValue({
      id: "share-1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await service.share("user-1", "entry-1", {
      therapistId: "th-1",
      ciphertextForTherapist: CIPHER_B64,
      wrappedKey: "WRAP",
      userOneShotPubKey: "PUB",
    });

    expect(result.ok).toBe(true);
    expect(result.shareId).toBe("share-1");
  });
});

// ─── ReflexionesService.getPromptOfTheDay ─────────────────────────────────────────

describe("ReflexionesService.getPromptOfTheDay", () => {
  let service: ReflexionesService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ReflexionesService(
      prisma as never,
      emotionalMapMock() as never,
    );
  });

  it("returns null when no active prompts exist", async () => {
    prisma.diaryPrompt.findMany.mockResolvedValue([]);

    const result = await service.getPromptOfTheDay();
    expect(result).toBeNull();
  });

  it("returns a single prompt deterministically per day", async () => {
    prisma.diaryPrompt.findMany.mockResolvedValue([
      { id: "p-1", text: "A" },
      { id: "p-2", text: "B" },
      { id: "p-3", text: "C" },
    ]);

    const a = await service.getPromptOfTheDay();
    const b = await service.getPromptOfTheDay();
    // Same day → same prompt. The doy-hash makes this deterministic.
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });
});
