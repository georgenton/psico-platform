import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictException,
  HttpException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { UsersService } from "./users.service";
import { generationKey } from "../emotional-map/cache-identity";

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
    // PR-0.1 — "consent changed" now means the VALUE moved, not "the field was
    // in the DTO", so the revocation reads the stored value first.
    findUnique: vi.fn().mockResolvedValue({ localTextAnalysis: true }),
  },
  refreshToken: {
    updateMany: vi.fn(),
  },
  emailChangeRequest: {
    create: vi.fn(),
  },
  dataExportRequest: {
    findFirst: vi.fn(),
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
  uploadFile: vi.fn(),
};

const mockJobs = {
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
  enqueueDataExport: vi.fn().mockResolvedValue(undefined),
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
      expect(me.stats.currentStreakDays).toBe(3);
      expect(me.stats.longestStreakDays).toBe(7);
      expect(me.achievements).toEqual([]);
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

    it("uploads to storage and updates user.avatarUrl", async () => {
      mockStorage.uploadFile.mockResolvedValue(
        "https://r2.example/avatars/user-1/123.png",
      );
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const res = await service.uploadAvatar(userId, okFile);

      expect(res.avatarUrl).toMatch(/^https:\/\//);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { avatarUrl: res.avatarUrl },
      });
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
    it("creates a verification request when the new email is free + enqueues email", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.emailChangeRequest.create.mockResolvedValue({});

      const res = await service.requestEmailChange(userId, {
        newEmail: "Janet@Example.com ",
      });

      expect(res).toEqual({
        ok: true,
        verificationSentTo: "janet@example.com",
      });
      const createCall = mockPrisma.emailChangeRequest.create.mock.calls[0][0];
      expect(createCall.data.newEmail).toBe("janet@example.com");
      // tokenHash is SHA-256 hex (64 chars), never the raw token
      expect(createCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);

      // Confirmation email enqueued (NOT sent synchronously — Sprint S3).
      expect(mockJobs.enqueueEmail).toHaveBeenCalledTimes(1);
      const enq = mockJobs.enqueueEmail.mock.calls[0][0];
      expect(enq.to).toBe("janet@example.com");
      expect(enq.tag).toBe("email-change");
      expect(enq.html).toContain(
        "https://app.example.com/verify-email-change?token=",
      );
    });

    it("throws ConflictException when the email is taken", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "other-user" });

      await expect(
        service.requestEmailChange(userId, { newEmail: "taken@example.com" }),
      ).rejects.toThrow(ConflictException);
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
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.changePassword(userId, {
        currentPassword: "oldPassword!",
        newPassword: "newSecret123",
      });

      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
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
});
