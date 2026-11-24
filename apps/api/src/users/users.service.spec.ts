import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HttpException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { UsersService } from "./users.service";
import { generationKey } from "../emotional-map/cache-identity";
import { isAllowedAssetKey } from "../shared/content-asset";
import { ExpectedUnavailableException } from "../shared/filters/expected-unavailable.exception";
import {
  ACCOUNT_DELETION_COOLDOWN_MS,
  accountDeletionDueAt,
} from "./account-deletion-window";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const userId = "user-1";

const baseUser = {
  id: userId,
  email: "jane@example.com",
  passwordHash: "",
  name: "Jane Doe",
  firstName: "Jane",
  city: "Quito",
  avatarUrl: null as string | null,
  mood: null as string | null,
  moodUpdatedAt: null as Date | null,
  currentStreakDays: 3,
  longestStreakDays: 7,
  streakLastDay: null as Date | null,
  deleteRequestedAt: null as Date | null,
  role: "USER",
  plan: "FREE",
  isActive: true,
  emailVerified: false,
  createdAt: new Date("2026-01-15T00:00:00Z"),
  updatedAt: new Date("2026-05-25T00:00:00Z"),
  profile: { country: "EC" },
  preferences: null,
  readerPreferences: null,
  notificationSettings: null,
  privacySettings: null,
  achievements: [],
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    // Sprint B.2 — the avatar write is conditional on the account not being
    // scheduled for deletion, which `update` cannot express.
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  profile: {
    upsert: vi.fn(),
  },
  userPreferences: {
    upsert: vi.fn(),
  },
  readerPreferences: {
    upsert: vi.fn(),
  },
  notificationSettings: {
    upsert: vi.fn(),
  },
  privacySettings: {
    upsert: vi.fn(),
    // The mirror of `User.deleteRequestedAt`, cleared with it.
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    // PR-0.1 — "consent changed" now means the VALUE moved, not "the field was
    // in the DTO", so the revocation reads the stored value first.
    findUnique: vi.fn().mockResolvedValue({ localTextAnalysis: true }),
  },
  refreshToken: {
    updateMany: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  emailChangeRequest: {
    create: vi.fn(),
  },
  dataExportRequest: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  },
  userProgress: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  diaryEntry: {
    count: vi.fn().mockResolvedValue(0),
  },
  // Fase D (L4) — consent cascade deletes BOTH derivatives of the analysed text:
  // the feature rows the map reads live, and the snapshots Evolución serves from
  // its own facts identity (the privacy revision never reaches that path).
  diaryTextFeature: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  emotionalMapSnapshot: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  // PR-0.1 — `updatePrivacy` takes an EXCLUSIVE lock on the user row before it
  // touches anything, so no in-flight writer can land a derived row on the far
  // side of the deletion. The double just answers the lock query.
  $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
  $transaction: vi.fn(),
};

const mockStorage = {
  // `uploadFile` is still mocked so a test can prove it is NEVER reached. It
  // returns `${R2_PUBLIC_URL}/${key}` against a private bucket, which is the
  // whole bug this migration removes.
  uploadFile: vi.fn(),
  putObject: vi.fn().mockResolvedValue(undefined),
  // Withdrawing our own just-written object when the conditional avatar write
  // matches no row — see the deletion-cooldown tests.
  deleteObject: vi.fn().mockResolvedValue(undefined),
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/x?sig=1"),
};

const mockJobs = {
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
  enqueueDataExport: vi.fn().mockResolvedValue(undefined),
  resumeDataExport: vi.fn().mockResolvedValue(true),
  enqueueAccountDeletion: vi.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  get: vi.fn((key: string) => {
    if (key === "APP_URL") return "https://app.example.com";
    return undefined;
  }),
};

const mockRedis = {
  del: vi.fn().mockResolvedValue(1),
  // PR-0.1 — invalidating a user's map bumps a generation counter; it no longer
  // deletes a single config-scoped key (which an old config could outlive).
  incr: vi.fn().mockResolvedValue(1),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("UsersService", () => {
  let service: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (
        arg: unknown[] | ((tx: typeof mockPrisma) => Promise<unknown>),
      ) => {
        if (typeof arg === "function") return arg(mockPrisma);
        return Promise.all(arg);
      },
    );
    mockPrisma.userProgress.count.mockResolvedValue(0);
    mockPrisma.userProgress.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.privacySettings.findUnique.mockResolvedValue({
      localTextAnalysis: true,
    });
    mockJobs.enqueueEmail.mockResolvedValue(undefined);
    mockJobs.enqueueDataExport.mockResolvedValue(undefined);
    mockJobs.enqueueAccountDeletion.mockResolvedValue(undefined);
    service = new UsersService(
      mockPrisma as never,
      mockStorage as never,
      mockJobs as never,
      mockConfig as never,
      mockRedis as never,
    );
  });

  // ── getMe ─────────────────────────────────────────────────────────────────

  describe("getMe", () => {
    it("returns the full bundle with defaults when settings rows are missing", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const me = await service.getMe(userId);

      expect(me.user.firstName).toBe("Jane");
      expect(me.user.email).toBe("jane@example.com");
      expect(me.user.city).toBe("Quito");
      expect(me.user.country).toBe("EC");
      expect(me.user.tier).toBe("free");
      // firstName="Jane" is the source of truth for initials (single word →
      // first 2 chars). The legacy `name` field is not consulted once
      // firstName is populated.
      expect(me.user.initials).toBe("JA");
      // Defaults applied for every 1:1 relation that's missing
      expect(me.preferences.voicePreference).toBe("none");
      expect(me.preferences.language).toBe("es-419");
      expect(me.readerPreferences.font).toBe("serif");
      expect(me.notifications.dailyReminder).toBe(true);
      expect(me.privacy.shareDiaryWithTherapist).toBe(false);
      expect(me.privacy.dataExportRequested).toBeNull();
      expect(me.privacy.accountDeleteRequested).toBeNull();
      expect(me.privacy.accountDeleteScheduledFor).toBeNull();
      expect(me.stats.currentStreakDays).toBe(3);
      expect(me.stats.longestStreakDays).toBe(7);
      expect(me.achievements).toEqual([]);
    });

    it("writes a pending achievement as what is left to do, without re-seeding", async () => {
      // The stored sentence is the one written for the day it is earned. The
      // row is NOT what decides how a pending milestone reads.
      const stored = {
        id: "first-reflection",
        label: "Primera reflexión",
        description: "Escribiste tu primera entrada en el diario.",
        icon: "pencil",
        progressTarget: 1,
      };
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        achievements: [
          { achievement: stored, progressCurrent: 0, unlockedAt: null },
          {
            achievement: {
              ...stored,
              id: "first-chapter",
              description:
                "Terminaste tu primer capítulo. Inicio del recorrido.",
            },
            progressCurrent: 1,
            unlockedAt: new Date("2026-11-20T10:00:00Z"),
          },
        ],
      });

      const me = await service.getMe(userId);

      expect(me.achievements.map((a) => a.description)).toEqual([
        "Escribe tu primera entrada en el diario.",
        "Terminaste tu primer capítulo. Inicio del recorrido.",
      ]);
    });

    it("maps PRO plan to tier='pro'", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        plan: "PRO",
      });

      const me = await service.getMe(userId);
      expect(me.user.tier).toBe("pro");
    });

    it("throws NotFoundException when user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe("ghost")).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateProfile ─────────────────────────────────────────────────────────

  describe("updateProfile", () => {
    it("updates user fields and profile.country in a single transaction", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue(baseUser);
      mockPrisma.profile.upsert.mockResolvedValue({});

      await service.updateProfile(userId, {
        firstName: "Janet",
        city: "Guayaquil",
        country: "PE",
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { firstName: "Janet", city: "Guayaquil" },
      });
      expect(mockPrisma.profile.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, country: "PE" },
        update: { country: "PE" },
      });
    });

    it("skips the user update when only country is patched", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.profile.upsert.mockResolvedValue({});

      await service.updateProfile(userId, { country: "MX" });

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.profile.upsert).toHaveBeenCalled();
    });
  });

  // ── uploadAvatar ──────────────────────────────────────────────────────────

  describe("uploadAvatar", () => {
    const okFile = {
      buffer: Buffer.from("png"),
      originalname: "me.png",
      mimetype: "image/png",
      size: 1024,
    } as Express.Multer.File;

    it("stores the bytes under a server-chosen key and persists OUR path", async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const res = await service.uploadAvatar(userId, okFile);

      // The key is minted here, not taken from the upload. `me.png` must not
      // appear in it: a filename is attacker-controlled text and would
      // otherwise decide where bytes land.
      const key = mockStorage.putObject.mock.calls[0]![1] as string;
      expect(key).toMatch(new RegExp(`^avatars/${userId}/[0-9a-f]{16}\\.png$`));
      expect(key).not.toContain("me.png");

      // What is persisted is a stable path on our own API — never an R2 URL,
      // and never a signed URL, which would be a dead link within minutes.
      expect(res.avatarUrl).toBe(`/api/content-assets/${key}`);
      expect(res.avatarUrl).not.toMatch(/^https?:\/\//);
      expect(res.avatarUrl).not.toContain("X-Amz-Signature");
      // Conditional on the account not being scheduled for deletion. The write
      // order here is object-then-row, so an unconditional update could land
      // after a deletion transaction removed the row — leaving the new object
      // orphaned, because the key dies with the row that names it.
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: userId, deleteRequestedAt: null },
        data: { avatarUrl: res.avatarUrl },
      });
    });

    it("never calls uploadFile — the private bucket has no public base", async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);

      await service.uploadAvatar(userId, okFile);

      // The regression this guards: `uploadFile` throws
      // R2_PUBLIC_URL_NOT_CONFIGURED where the variable is unset, and persists an
      // unreadable URL where it is set. Either way it must not be on this path.
      expect(mockStorage.uploadFile).not.toHaveBeenCalled();
    });

    it("persists a key the public asset route is willing to sign", async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);

      // A real id, not this file's `user-1`: the allowlist requires at least 8
      // characters in the id segment, and every id Prisma mints is a 25-character
      // cuid. Loosening the pattern so a short fixture passes would widen a
      // security boundary to suit a test.
      const realisticId = "cmql4vasx0000abcdefghijkl";
      const res = await service.uploadAvatar(realisticId, okFile);
      const key = res.avatarUrl!.replace("/api/content-assets/", "");

      // Minting a key the route refuses would store a path that 404s forever,
      // so the uploader and the allowlist are checked against each other here.
      expect(isAllowedAssetKey(key)).toBe(true);
    });

    it("rejects non-image mime types", async () => {
      await expect(
        service.uploadAvatar(userId, {
          ...okFile,
          mimetype: "application/pdf",
        } as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects files over 5 MB", async () => {
      await expect(
        service.uploadAvatar(userId, {
          ...okFile,
          size: 6 * 1024 * 1024,
        } as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getDataExportDownload ─────────────────────────────────────────────────
  //
  // The export is the user's whole profile, reading history and subscription.
  // Everything here is about who gets a signature and who does not.

  describe("getDataExportDownload", () => {
    const readyRow = {
      userId,
      status: "READY",
      fileUrl: `data-exports/${userId}/req-1.json`,
    };

    it("signs the owner's own export, and returns the URL without storing it", async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue(readyRow);

      const res = await service.getDataExportDownload(userId, "req-1");

      expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
        `data-exports/${userId}/req-1.json`,
        120,
      );
      expect(res.url).toBe("https://signed.example/x?sig=1");
      expect(res.expiresInSec).toBe(120);
      // Nothing is written back: a signed URL in a row is a link that outlives
      // the request that asked for it.
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("refuses another user's export, and refuses it as NOT_FOUND", async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        ...readyRow,
        userId: "someone-else",
      });

      // 404 rather than 403 on purpose: a 403 would confirm that this id is
      // somebody's export, which is exactly what an enumerating caller wants.
      await expect(
        service.getDataExportDownload(userId, "req-1"),
      ).rejects.toThrow(NotFoundException);
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it("refuses an id that does not exist", async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.getDataExportDownload(userId, "nope"),
      ).rejects.toThrow(NotFoundException);
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it("refuses an export that is not READY", async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        ...readyRow,
        status: "PROCESSING",
      });

      await expect(
        service.getDataExportDownload(userId, "req-1"),
      ).rejects.toThrow(HttpException);
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it("refuses a stored value outside the caller's own prefix", async () => {
      // Defence in depth against a tampered row: the column is written by the
      // worker, but signing whatever it contains would turn this endpoint into a
      // way to read any object in the bucket.
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        ...readyRow,
        fileUrl: "data-exports/someone-else/req-1.json",
      });

      await expect(
        service.getDataExportDownload(userId, "req-1"),
      ).rejects.toThrow(HttpException);
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it("refuses a legacy row holding an absolute URL", async () => {
      // Rows written before this migration hold `${R2_PUBLIC_URL}/${key}`, which
      // no browser could ever load. There is nothing to recover: a fresh export
      // stores a key.
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        ...readyRow,
        fileUrl: `https://acct.r2.cloudflarestorage.com/bucket/data-exports/${userId}/req-1.json`,
      });

      await expect(
        service.getDataExportDownload(userId, "req-1"),
      ).rejects.toThrow(HttpException);
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it("answers 410 GONE for an export the retention sweep expired", async () => {
      // A different answer from "not ready yet", and the status code says which:
      // 410 means this existed and is gone for good, so a client stops polling
      // and offers a fresh request. 409 would have it wait forever for a file
      // deleted a month ago.
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        userId,
        status: "EXPIRED",
        fileUrl: null,
      });

      await expect(
        service.getDataExportDownload(userId, "req-1"),
      ).rejects.toMatchObject({ status: 410 });
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it("still answers 404 for a STRANGER's expired export", async () => {
      // The status must not become an oracle for which ids exist, so the
      // ownership check stays above the expiry check.
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        userId: "someone-else",
        status: "EXPIRED",
        fileUrl: null,
      });

      await expect(
        service.getDataExportDownload(userId, "req-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("refuses a traversal segment in the stored key", async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        ...readyRow,
        fileUrl: `data-exports/${userId}/../../media/book/c1/audiobook/x.m4a`,
      });

      await expect(
        service.getDataExportDownload(userId, "req-1"),
      ).rejects.toThrow(HttpException);
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  // ── updatePreferences / readerPreferences / notifications / privacy ───────

  describe("update*Settings (upsert family)", () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
    });

    it("updatePreferences upserts and returns the bundle", async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({});
      await service.updatePreferences(userId, { theme: "dark" });
      expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, theme: "dark" },
        update: { theme: "dark" },
      });
    });

    it("updateReaderPreferences upserts", async () => {
      mockPrisma.readerPreferences.upsert.mockResolvedValue({});
      await service.updateReaderPreferences(userId, { fontSize: 22 });
      expect(mockPrisma.readerPreferences.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, fontSize: 22 },
        update: { fontSize: 22 },
      });
    });

    it("updateNotifications upserts", async () => {
      mockPrisma.notificationSettings.upsert.mockResolvedValue({});
      await service.updateNotifications(userId, { dailyReminder: false });
      expect(mockPrisma.notificationSettings.upsert).toHaveBeenCalled();
    });

    it("updatePrivacy upserts", async () => {
      mockPrisma.privacySettings.upsert.mockResolvedValue({});
      await service.updatePrivacy(userId, { marketingEmail: true });
      expect(mockPrisma.privacySettings.upsert).toHaveBeenCalled();
      // Unrelated privacy flips never touch the derived text-feature rows.
      expect(mockPrisma.diaryTextFeature.deleteMany).not.toHaveBeenCalled();
    });

    it("Fase D (L4): opting OUT deletes BOTH derivatives and busts the map cache", async () => {
      mockPrisma.privacySettings.upsert.mockResolvedValue({});
      await service.updatePrivacy(userId, { localTextAnalysis: false });
      // The live map's input…
      expect(mockPrisma.diaryTextFeature.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      // …and the durable aggregate the cron persisted FROM that input. Hiding the
      // row behind a new privacy revision would not be enough: the policy says we
      // delete the derivatives, and Evolución reads snapshots on their own
      // identity, where the revision never appears.
      expect(mockPrisma.emotionalMapSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(mockRedis.incr).toHaveBeenCalledWith(generationKey(userId));
    });

    it("Fase D (L4): opting IN keeps the rows but busts the map cache", async () => {
      // Stored value is OFF, so `true` is a REAL change: the map's inputs move,
      // the cache must miss — and nothing is deleted. (PR-0.1: "changed" means
      // the value moved, not "the field was in the DTO". Every transition is
      // covered in privacy-revocation.spec.)
      mockPrisma.privacySettings.findUnique.mockResolvedValue({
        localTextAnalysis: false,
      });
      mockPrisma.privacySettings.upsert.mockResolvedValue({});
      await service.updatePrivacy(userId, { localTextAnalysis: true });
      expect(mockPrisma.diaryTextFeature.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.emotionalMapSnapshot.deleteMany).not.toHaveBeenCalled();
      expect(mockRedis.incr).toHaveBeenCalledWith(generationKey(userId));
    });
  });

  // ── updateMood ────────────────────────────────────────────────────────────

  describe("updateMood", () => {
    it("writes mood and moodUpdatedAt", async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const res = await service.updateMood(userId, { mood: "calm" });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { mood: "calm", moodUpdatedAt: expect.any(Date) },
      });
      expect(res.mood).toBe("calm");
    });
  });

  // ── requestEmailChange ────────────────────────────────────────────────────

  describe("requestEmailChange", () => {
    // Withdrawn. The HTTP side — every valid body, zero writes, nothing queued —
    // is in `email-change-unavailable.e2e-spec.ts`; here, the exact error.
    it("refuses without reading, writing or queueing anything", () => {
      let error: unknown;
      try {
        service.requestEmailChange();
      } catch (e) {
        error = e;
      }

      // The class, not just the status: the global filter gives this one a
      // single warn line, and any other 503 a stack and an alert.
      expect(error).toBeInstanceOf(ExpectedUnavailableException);
      expect(
        (error as ExpectedUnavailableException).getResponse(),
      ).toMatchObject({
        code: "EMAIL_CHANGE_UNAVAILABLE",
        message: "Por ahora no se puede cambiar el correo desde la app.",
      });

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.emailChangeRequest.create).not.toHaveBeenCalled();
      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();
    });
  });

  // ── changePassword ────────────────────────────────────────────────────────

  describe("changePassword", () => {
    it("rotates password and revokes all refresh tokens when current is correct", async () => {
      const currentHash = await bcrypt.hash("oldPassword!", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: currentHash,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.changePassword(userId, {
        currentPassword: "oldPassword!",
        newPassword: "newSecret123",
      });

      expect(mockPrisma.user.update).toHaveBeenCalled();
      // ADR 0015: every session revoked — authRevision bumped + tokens deleted.
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ authRevision: { increment: 1 } }),
        }),
      );
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it("throws UnauthorizedException when current password is wrong", async () => {
      const currentHash = await bcrypt.hash("oldPassword!", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: currentHash,
      });

      await expect(
        service.changePassword(userId, {
          currentPassword: "wrong",
          newPassword: "newSecret123",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── requestDataExport ─────────────────────────────────────────────────────

  describe("requestDataExport", () => {
    it("creates a PENDING request, mirrors timestamp, enqueues worker job", async () => {
      mockPrisma.dataExportRequest.findFirst.mockResolvedValue(null);
      mockPrisma.dataExportRequest.create.mockResolvedValue({ id: "export-1" });
      mockPrisma.privacySettings.upsert.mockResolvedValue({});

      const res = await service.requestDataExport(userId);

      expect(res.ok).toBe(true);
      expect(res.expectedAt).toBeInstanceOf(Date);
      expect(mockPrisma.dataExportRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId, status: "PENDING" }),
      });
      // The worker picks up the job by requestId; assert we enqueued it.
      expect(mockJobs.enqueueDataExport).toHaveBeenCalledWith({
        requestId: "export-1",
        userId,
      });
    });

    it("throws 429 when a request was made within the 30d cooldown", async () => {
      mockPrisma.dataExportRequest.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 1000),
      });

      await expect(service.requestDataExport(userId)).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ── requestDelete ─────────────────────────────────────────────────────────

  describe("requestDelete", () => {
    it("schedules deletion + enqueues +30d job when password is correct", async () => {
      const currentHash = await bcrypt.hash("secret", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: currentHash,
        deleteRequestedAt: null,
        authProvider: "LOCAL",
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.privacySettings.upsert.mockResolvedValue({});

      const res = await service.requestDelete(userId, { password: "secret" });

      expect(res.ok).toBe(true);
      expect(res.deleteAt.getTime()).toBeGreaterThan(Date.now());
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { deleteRequestedAt: expect.any(Date) },
      });
      // Worker job enqueued for the actual hard-delete.
      expect(mockJobs.enqueueAccountDeletion).toHaveBeenCalledTimes(1);
      const enq = mockJobs.enqueueAccountDeletion.mock.calls[0][0];
      expect(enq.userId).toBe(userId);
      expect(typeof enq.requestedAt).toBe("string");
    });

    it("is idempotent — returns existing deleteAt without re-checking password when already requested", async () => {
      const requestedAt = new Date(Date.now() - 24 * 3600 * 1000);
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: "irrelevant",
        deleteRequestedAt: requestedAt,
      });

      const res = await service.requestDelete(userId, { password: "wrong" });

      expect(res.ok).toBe(true);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedException when password is wrong on first request", async () => {
      const currentHash = await bcrypt.hash("secret", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: currentHash,
        deleteRequestedAt: null,
      });

      await expect(
        service.requestDelete(userId, { password: "nope" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── The date a person is shown ───────────────────────────────────────────

  describe("the date of a pending deletion", () => {
    it("tells the day it will HAPPEN, thirty days after the day it was asked for", async () => {
      // Fixed instants, and a month end between them on purpose: the two dates
      // must differ in everything a person would read.
      const requestedAt = new Date("2026-11-24T14:05:00.000Z");
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        deleteRequestedAt: requestedAt,
      });

      const { privacy } = await service.getMe(userId);

      expect(privacy.accountDeleteRequested).toEqual(requestedAt);
      expect(privacy.accountDeleteScheduledFor).toEqual(
        new Date("2026-12-24T14:05:00.000Z"),
      );
    });

    it("says the same thing on the way in, on a repeat and on a reload", async () => {
      const currentHash = await bcrypt.hash("secret", 4);
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: currentHash,
        deleteRequestedAt: null,
        authProvider: "LOCAL",
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.privacySettings.upsert.mockResolvedValue({});

      const asked = await service.requestDelete(userId, { password: "secret" });
      const written = mockPrisma.user.update.mock.calls[0]![0].data
        .deleteRequestedAt as Date;

      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        deleteRequestedAt: written,
      });
      const repeated = await service.requestDelete(userId, { password: "x" });
      const reloaded = await service.getMe(userId);

      expect(asked.deleteAt).toEqual(accountDeletionDueAt(written));
      expect(repeated.deleteAt).toEqual(asked.deleteAt);
      expect(reloaded.privacy.accountDeleteScheduledFor).toEqual(
        asked.deleteAt,
      );
    });
  });

  // ── cancelDeleteRequest ───────────────────────────────────────────────────
  //
  // The SHAPE of the decision. That the two transactions really do wait for
  // each other is a claim about PostgreSQL and lives in
  // `account-deletion-cancel.pg-spec.ts`; a double that serialises nothing
  // cannot say anything about it.

  describe("cancelDeleteRequest", () => {
    const pendingSince = (ms: number) => ({
      deleteRequestedAt: new Date(Date.now() - ms),
    });
    const DAY = 24 * 3600 * 1000;

    it("clears the request AND its mirror, under the lock, inside one transaction", async () => {
      const order: string[] = [];
      mockPrisma.user.findUnique.mockResolvedValue(pendingSince(5 * DAY));
      mockPrisma.$queryRaw.mockImplementation(async () => {
        order.push("lock");
        return [];
      });
      mockPrisma.user.updateMany.mockImplementation(async () => {
        order.push("user");
        return { count: 1 };
      });
      mockPrisma.privacySettings.updateMany.mockImplementation(async () => {
        order.push("mirror");
        return { count: 1 };
      });

      const res = await service.cancelDeleteRequest(userId);

      expect(res).toEqual({ ok: true, cancelled: true });
      expect(order).toEqual(["lock", "user", "mirror"]);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.privacySettings.updateMany).toHaveBeenCalledWith({
        where: { userId },
        data: { accountDeleteRequestedAt: null },
      });
    });

    it("writes conditionally: only a request that exists and is inside its window", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(pendingSince(5 * DAY));
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      const before = Date.now();
      await service.cancelDeleteRequest(userId);
      const after = Date.now();

      const { where, data } = mockPrisma.user.updateMany.mock.calls[0]![0];
      expect(data).toEqual({ deleteRequestedAt: null });
      expect(where.id).toBe(userId);
      expect(where.deleteRequestedAt.not).toBeNull();
      const cutoff = (where.deleteRequestedAt.gt as Date).getTime();
      expect(cutoff).toBeGreaterThanOrEqual(
        before - ACCOUNT_DELETION_COOLDOWN_MS,
      );
      expect(cutoff).toBeLessThanOrEqual(after - ACCOUNT_DELETION_COOLDOWN_MS);
    });

    it("never claims a cancellation it did not write", async () => {
      // The row matched nothing: somebody else got there first. Whatever the
      // reason turns out to be, the answer is not «cancelled» and the mirror
      // is not touched.
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(pendingSince(5 * DAY))
        .mockResolvedValueOnce(null);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancelDeleteRequest(userId)).rejects.toMatchObject({
        status: 410,
        response: { code: "ACCOUNT_ALREADY_DELETED" },
      });
      expect(mockPrisma.privacySettings.updateMany).not.toHaveBeenCalled();
    });

    it("says nothing was pending, without writing, and says it again", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ deleteRequestedAt: null });

      for (let i = 0; i < 2; i++) {
        expect(await service.cancelDeleteRequest(userId)).toEqual({
          ok: true,
          cancelled: false,
        });
      }
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.privacySettings.updateMany).not.toHaveBeenCalled();
    });

    it("refuses once the window has closed, and leaves the request standing", async () => {
      for (const overdue of [0, 1, 5 * DAY]) {
        mockPrisma.user.findUnique.mockResolvedValue(
          pendingSince(ACCOUNT_DELETION_COOLDOWN_MS + overdue),
        );

        await expect(service.cancelDeleteRequest(userId)).rejects.toMatchObject(
          {
            status: 409,
            response: {
              code: "ACCOUNT_DELETION_WINDOW_CLOSED",
              message: expect.any(String),
            },
          },
        );
      }
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.privacySettings.updateMany).not.toHaveBeenCalled();
    });

    it("puts back the export the pending deletion made the worker skip", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(pendingSince(1 * DAY));
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.dataExportRequest.findMany.mockResolvedValueOnce([
        { id: "export-1" },
      ]);

      await service.cancelDeleteRequest(userId);

      // Unfinished, and recent enough to be the one refusing a new request.
      const { where } = mockPrisma.dataExportRequest.findMany.mock.calls[0]![0];
      expect(where.userId).toBe(userId);
      expect(where.status.in).toEqual(["PENDING", "PROCESSING"]);
      expect(Date.now() - where.createdAt.gt.getTime()).toBeGreaterThanOrEqual(
        30 * DAY,
      );
      expect(mockJobs.resumeDataExport.mock.calls).toEqual([
        [{ requestId: "export-1", userId }],
      ]);
    });

    it("has nothing to put back unless it really undid a deletion", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ deleteRequestedAt: null });

      await service.cancelDeleteRequest(userId);

      expect(mockPrisma.dataExportRequest.findMany).not.toHaveBeenCalled();
      expect(mockJobs.resumeDataExport).not.toHaveBeenCalled();
    });

    it("is still a cancellation when the queue cannot take the export back", async () => {
      // Already committed. A 500 here would tell somebody their account is
      // still being deleted when it is not.
      mockPrisma.user.findUnique.mockResolvedValue(pendingSince(1 * DAY));
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.dataExportRequest.findMany.mockResolvedValueOnce([
        { id: "export-1" },
      ]);
      mockJobs.resumeDataExport.mockRejectedValueOnce(new Error("redis down"));

      expect(await service.cancelDeleteRequest(userId)).toEqual({
        ok: true,
        cancelled: true,
      });
    });

    it("asks for no password and touches no session, deletion job or object", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(pendingSince(1 * DAY));
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      await service.cancelDeleteRequest(userId);

      expect(
        mockPrisma.user.findUnique.mock.calls.every(
          ([arg]) => !("passwordHash" in (arg.select ?? {})),
        ),
      ).toBe(true);
      expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(mockJobs.enqueueAccountDeletion).not.toHaveBeenCalled();
      expect(mockStorage.deleteObject).not.toHaveBeenCalled();
    });
  });

  // ── New personal objects during the deletion cooldown (Sprint B.2) ───────

  describe("uploads while the account is scheduled for deletion", () => {
    const okFile = {
      buffer: Buffer.from("png"),
      originalname: "me.png",
      mimetype: "image/png",
      size: 1024,
    } as Express.Multer.File;

    it("withdraws the avatar object when the conditional write matches no row", async () => {
      // The race this closes: the object is written BEFORE the row, so an upload
      // running against AccountDeletionProcessor could put its bytes in the
      // bucket, block on the lock that transaction holds, and find the row gone
      // when the lock released. The object would be orphaned forever, because
      // the key dies with the row that names it. Matching zero rows means the
      // write did not take, so we take our own bytes back out.
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.uploadAvatar(userId, okFile)).rejects.toMatchObject({
        status: 409,
      });

      const key = mockStorage.putObject.mock.calls[0]![1] as string;
      expect(mockStorage.deleteObject).toHaveBeenCalledWith(key);
    });

    it("refuses a new export rather than accepting one that will never finish", async () => {
      // `DataExportProcessor` already skips a user with `deleteRequestedAt` set,
      // so without this the request would be accepted, enqueued, and silently
      // never become READY — a 202 that means nothing.
      mockPrisma.user.findUnique.mockResolvedValue({
        deleteRequestedAt: new Date(),
      });

      await expect(service.requestDataExport(userId)).rejects.toMatchObject({
        status: 409,
      });
      expect(mockJobs.enqueueDataExport).not.toHaveBeenCalled();
    });

    it("still allows an export for an account that is not being deleted", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ deleteRequestedAt: null });
      mockPrisma.dataExportRequest.findFirst.mockResolvedValue(null);
      mockPrisma.dataExportRequest.create.mockResolvedValue({ id: "export-1" });
      mockPrisma.privacySettings.upsert.mockResolvedValue({});

      await service.requestDataExport(userId);

      expect(mockJobs.enqueueDataExport).toHaveBeenCalled();
    });
  });
});
