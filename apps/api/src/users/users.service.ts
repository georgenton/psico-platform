import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import type {
  AvatarUploadResponse,
  DataExportRequestResponse,
  DeleteAccountResponse,
  EmailChangeRequestResponse,
  UserMeResponse,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StorageService } from "../storage";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JobsService } from "../jobs";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config";
import { emailShell, escape } from "../notifications/templates/base";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import type { UpdatePreferencesDto } from "./dto/update-preferences.dto";
import type { UpdateReaderPreferencesDto } from "./dto/update-reader-preferences.dto";
import type { UpdateNotificationsDto } from "./dto/update-notifications.dto";
import type { UpdatePrivacyDto } from "./dto/update-privacy.dto";
import type { UpdateMoodDto } from "./dto/update-mood.dto";
import type { EmailChangeRequestDto } from "./dto/email-change-request.dto";
import type { PasswordChangeDto } from "./dto/password-change.dto";
import type { DeleteRequestDto } from "./dto/delete-request.dto";

// Defaults mirror the @default(...) values in schema.prisma. We keep them duplicated
// here so getMe() can synthesise a response for a user whose 1:1 settings rows
// haven't been provisioned yet (lazy creation on first write).
const DEFAULT_PREFERENCES = {
  voicePreference: "none" as const,
  moodPrompts: true,
  bestTime: "any" as const,
  weeklyGoalMinutes: 60,
  theme: "system" as const,
  language: "es-419" as const,
};

const DEFAULT_READER_PREFERENCES = {
  font: "serif" as const,
  fontSize: 18,
  theme: "system" as const,
  lineHeight: 1.6,
};

const DEFAULT_NOTIFICATIONS = {
  dailyReminder: true,
  reminderTime: "20:00",
  streakReminders: true,
  ecoReplies: true,
  terapiaReminders: true,
  weeklyReport: true,
};

const DEFAULT_PRIVACY = {
  shareDiaryWithTherapist: false,
  anonymizedAnalytics: true,
  marketingEmail: false,
};

const EMAIL_VERIFICATION_TTL_HOURS = 24;
const DATA_EXPORT_COOLDOWN_DAYS = 30;
const DATA_EXPORT_EXPECTED_HOURS = 24;
const DELETE_COOLDOWN_DAYS = 30;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ── GET /api/user/me ───────────────────────────────────────────────────────

  async getMe(userId: string): Promise<UserMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        preferences: true,
        readerPreferences: true,
        notificationSettings: true,
        privacySettings: true,
        achievements: { include: { achievement: true } },
      },
    });

    if (!user) throw new NotFoundException("User not found");

    const stats = await this.computeStats(userId);

    return {
      user: {
        id: user.id,
        firstName: user.firstName ?? user.name,
        email: user.email,
        city: user.city,
        country: user.profile?.country ?? null,
        tier: user.plan === "FREE" ? "free" : "pro",
        joinedAt: user.createdAt,
        initials: this.computeInitials(user.firstName ?? user.name),
        avatarUrl: user.avatarUrl,
        mood: user.mood,
      },
      stats,
      achievements: user.achievements.map((ua) => ({
        id: ua.achievement.id,
        label: ua.achievement.label,
        description: ua.achievement.description,
        icon: ua.achievement.icon,
        progressCurrent: ua.progressCurrent,
        progressTarget: ua.achievement.progressTarget,
        unlockedAt: ua.unlockedAt,
      })),
      preferences: user.preferences
        ? {
            voicePreference: user.preferences.voicePreference as
              | "marina"
              | "tomas"
              | "none",
            moodPrompts: user.preferences.moodPrompts,
            bestTime: user.preferences.bestTime as
              | "morning"
              | "noon"
              | "evening"
              | "any",
            weeklyGoalMinutes: user.preferences.weeklyGoalMinutes,
            theme: user.preferences.theme as "system" | "light" | "dark",
            language: user.preferences.language as "es-419" | "es-ES",
          }
        : DEFAULT_PREFERENCES,
      readerPreferences: user.readerPreferences
        ? {
            font: user.readerPreferences.font as "serif" | "sans",
            fontSize: user.readerPreferences.fontSize,
            theme: user.readerPreferences.theme as
              | "system"
              | "light"
              | "sepia"
              | "dark",
            lineHeight: user.readerPreferences.lineHeight,
          }
        : DEFAULT_READER_PREFERENCES,
      notifications: user.notificationSettings
        ? {
            dailyReminder: user.notificationSettings.dailyReminder,
            reminderTime: user.notificationSettings.reminderTime,
            streakReminders: user.notificationSettings.streakReminders,
            ecoReplies: user.notificationSettings.ecoReplies,
            terapiaReminders: user.notificationSettings.terapiaReminders,
            weeklyReport: user.notificationSettings.weeklyReport,
          }
        : DEFAULT_NOTIFICATIONS,
      privacy: {
        shareDiaryWithTherapist:
          user.privacySettings?.shareDiaryWithTherapist ??
          DEFAULT_PRIVACY.shareDiaryWithTherapist,
        anonymizedAnalytics:
          user.privacySettings?.anonymizedAnalytics ??
          DEFAULT_PRIVACY.anonymizedAnalytics,
        marketingEmail:
          user.privacySettings?.marketingEmail ??
          DEFAULT_PRIVACY.marketingEmail,
        dataExportRequested:
          user.privacySettings?.dataExportRequestedAt ?? null,
        accountDeleteRequested: user.deleteRequestedAt,
      },
      // E2E crypto salt (Sprint S6-crypto, ADR 0007 §A). Null for legacy
      // accounts. The client uses it to derive the diary master key.
      cryptoSalt: user.cryptoSalt,
    };
  }

  // ── PATCH /api/user/profile ────────────────────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // country lives on Profile; everything else on User.
    const userPatch: Record<string, unknown> = {};
    if (dto.firstName !== undefined) userPatch.firstName = dto.firstName;
    if (dto.city !== undefined) userPatch.city = dto.city;
    if (dto.avatarUrl !== undefined) userPatch.avatarUrl = dto.avatarUrl;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userPatch).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userPatch });
      }
      if (dto.country !== undefined) {
        await tx.profile.upsert({
          where: { userId },
          create: { userId, country: dto.country },
          update: { country: dto.country },
        });
      }
    });

    return this.getMe(userId);
  }

  // ── POST /api/user/avatar ──────────────────────────────────────────────────

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<AvatarUploadResponse> {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("Avatar must be an image");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("Avatar must be under 5 MB");
    }

    const ext = file.originalname.split(".").pop() ?? "jpg";
    const key = `avatars/${userId}/${Date.now()}.${ext}`;
    const avatarUrl = await this.storage.uploadFile(
      file.buffer,
      key,
      file.mimetype,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { avatarUrl };
  }

  // ── PATCH /api/user/preferences ────────────────────────────────────────────

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    return this.getMe(userId);
  }

  // ── PATCH /api/user/reader-preferences ─────────────────────────────────────

  async updateReaderPreferences(
    userId: string,
    dto: UpdateReaderPreferencesDto,
  ) {
    await this.prisma.readerPreferences.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    return this.getMe(userId);
  }

  // ── PATCH /api/user/notifications ──────────────────────────────────────────

  async updateNotifications(userId: string, dto: UpdateNotificationsDto) {
    await this.prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    return this.getMe(userId);
  }

  // ── PATCH /api/user/privacy ────────────────────────────────────────────────

  async updatePrivacy(userId: string, dto: UpdatePrivacyDto) {
    await this.prisma.privacySettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    return this.getMe(userId);
  }

  // ── PATCH /api/user/mood ───────────────────────────────────────────────────

  async updateMood(userId: string, dto: UpdateMoodDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mood: dto.mood, moodUpdatedAt: new Date() },
    });
    return { mood: dto.mood, updatedAt: new Date() };
  }

  // ── POST /api/user/email-change-request ────────────────────────────────────

  async requestEmailChange(
    userId: string,
    dto: EmailChangeRequestDto,
  ): Promise<EmailChangeRequestResponse> {
    const normalized = dto.newEmail.trim().toLowerCase();

    const conflict = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (conflict) throw new ConflictException("Email already in use");

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 3600 * 1000,
    );

    await this.prisma.emailChangeRequest.create({
      data: { userId, newEmail: normalized, tokenHash, expiresAt },
    });

    // Send the verification email via the BullMQ email queue. We enqueue
    // rather than awaiting Resend directly because:
    //  - The user-facing response should return immediately.
    //  - BullMQ retries on transient Resend failures (3 attempts).
    //  - If the worker is down, the job persists in Redis and runs when
    //    the worker comes back.
    const appUrl = this.config.get("APP_URL", { infer: true });
    const verifyUrl = `${appUrl}/verify-email-change?token=${rawToken}`;
    const html = emailShell({
      preheader: "Confirma tu nuevo correo — el enlace vence en 24 horas.",
      bodyHtml: `
        <p style="margin:0 0 16px; font-size:17px; font-weight:600;">Cambia tu correo</p>
        <p style="margin:0 0 16px;">
          Solicitaste cambiar el correo de tu cuenta a <strong>${escape(normalized)}</strong>.
          Haz clic para confirmar.
        </p>
        <p style="margin:24px 0;">
          <a href="${escape(verifyUrl)}"
             style="display:inline-block; padding:14px 28px; border-radius:14px; background:#7C5BC4; color:#FFFFFF; text-decoration:none; font-weight:600; font-size:15px;">
            Confirmar nuevo correo
          </a>
        </p>
        <p style="margin:24px 0 0; color:#7E6F5F; font-size:13px;">
          Este enlace vence en ${EMAIL_VERIFICATION_TTL_HOURS} horas. Si no solicitaste este cambio, ignora este mensaje.
        </p>`,
    });
    await this.jobs.enqueueEmail({
      to: normalized,
      subject: "Confirma tu nuevo correo · Psico Platform",
      html,
      text: `Confirma tu nuevo correo abriendo: ${verifyUrl}\n\nEste enlace vence en ${EMAIL_VERIFICATION_TTL_HOURS} horas.`,
      tag: "email-change",
    });

    return { ok: true, verificationSentTo: normalized };
  }

  // ── POST /api/user/password-change ─────────────────────────────────────────

  async changePassword(userId: string, dto: PasswordChangeDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, authProvider: true },
    });
    if (!user) throw new NotFoundException("User not found");

    // OAuth users (passwordHash=null) cannot use this endpoint — they don't
    // have a password to change. Surface a clear 400 rather than a confusing 401.
    if (!user.passwordHash) {
      throw new BadRequestException({
        code: "OAUTH_USER_NO_PASSWORD",
        message: `Esta cuenta usa ${user.authProvider.toLowerCase()} sign-in. No tiene contraseña que cambiar.`,
      });
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException("Current password is incorrect");

    const newHash = await bcrypt.hash(dto.newPassword, 12);

    // Atomic: rotate password + revoke all active refresh tokens so any other
    // device gets logged out on next request.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // ── POST /api/user/data-export ─────────────────────────────────────────────

  async requestDataExport(userId: string): Promise<DataExportRequestResponse> {
    const cutoff = new Date(
      Date.now() - DATA_EXPORT_COOLDOWN_DAYS * 24 * 3600 * 1000,
    );
    const recent = await this.prisma.dataExportRequest.findFirst({
      where: { userId, createdAt: { gt: cutoff } },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      throw new HttpException(
        `Data export already requested. Try again after ${new Date(
          recent.createdAt.getTime() +
            DATA_EXPORT_COOLDOWN_DAYS * 24 * 3600 * 1000,
        ).toISOString()}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expectedAt = new Date(
      Date.now() + DATA_EXPORT_EXPECTED_HOURS * 3600 * 1000,
    );

    // Insert the row + mirror timestamp on privacy settings, THEN enqueue
    // the job using the row's id. We grab the created id by splitting the
    // transaction: row first (so we have an id), then upsert + enqueue.
    const created = await this.prisma.dataExportRequest.create({
      data: { userId, expectedAt, status: "PENDING" },
    });
    await this.prisma.privacySettings.upsert({
      where: { userId },
      create: { userId, dataExportRequestedAt: new Date() },
      update: { dataExportRequestedAt: new Date() },
    });

    // Worker picks this up (see `apps/api/src/jobs/processors/data-export.processor.ts`).
    // Generates JSON dump, uploads to R2, updates DataExportRequest.fileUrl
    // + status="READY", emails the user a signed download URL.
    await this.jobs.enqueueDataExport({ requestId: created.id, userId });

    return { ok: true, expectedAt };
  }

  // ── POST /api/user/delete-request ──────────────────────────────────────────

  async requestDelete(
    userId: string,
    dto: DeleteRequestDto,
  ): Promise<DeleteAccountResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        passwordHash: true,
        deleteRequestedAt: true,
        authProvider: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");

    if (user.deleteRequestedAt) {
      const deleteAt = new Date(
        user.deleteRequestedAt.getTime() +
          DELETE_COOLDOWN_DAYS * 24 * 3600 * 1000,
      );
      return { ok: true, deleteAt };
    }

    // OAuth users have no password to confirm with. For now, refuse the
    // operation and tell the user to confirm via their provider. A future
    // improvement: re-verify with a fresh OAuth ID token instead.
    if (!user.passwordHash) {
      throw new BadRequestException({
        code: "OAUTH_USER_NO_PASSWORD",
        message: `Esta cuenta usa ${user.authProvider.toLowerCase()} sign-in. La eliminación de cuenta para usuarios OAuth requiere un flujo dedicado (próxima versión).`,
      });
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Password is incorrect");

    const now = new Date();
    const deleteAt = new Date(
      now.getTime() + DELETE_COOLDOWN_DAYS * 24 * 3600 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deleteRequestedAt: now },
      }),
      this.prisma.privacySettings.upsert({
        where: { userId },
        create: { userId, accountDeleteRequestedAt: now },
        update: { accountDeleteRequestedAt: now },
      }),
    ]);

    // Enqueue the delayed deletion job (+30 days). The worker re-checks
    // `User.deleteRequestedAt` at execution time — if the user cancelled in
    // the meantime (a future endpoint), the job no-ops. See
    // `apps/api/src/jobs/processors/account-deletion.processor.ts`.
    //
    // `dto.reason` is intentionally NOT persisted to keep the deletion
    // pipeline PII-light. If we want product analytics on cancellation
    // reasons later, route it to PostHog with no payload.
    await this.jobs.enqueueAccountDeletion({
      userId,
      requestedAt: now.toISOString(),
    });

    return { ok: true, deleteAt };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async computeStats(userId: string) {
    // S6: diaryEntries now reflects the real count. minutesTotal still
    // lacks a ReadingSession source — DiaryEntry contributes a flat estimate
    // (5 min per entry, conservative) plus chapter completions. We will
    // refine when ReadingSession lands in a future sprint.
    const [
      chaptersRead,
      distinctDaysRows,
      completedProgress,
      user,
      diaryEntries,
    ] = await Promise.all([
      this.prisma.userProgress.count({ where: { userId } }),
      this.prisma.$queryRaw<Array<{ day: Date }>>`
          SELECT DISTINCT DATE_TRUNC('day', "completedAt") AS day
          FROM "UserProgress"
          WHERE "userId" = ${userId}
        `,
      this.prisma.userProgress.findMany({
        where: { userId },
        select: {
          chapter: {
            select: {
              bookId: true,
              book: { select: { totalChapters: true } },
            },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          currentStreakDays: true,
          longestStreakDays: true,
        },
      }),
      this.prisma.diaryEntry.count({ where: { userId } }),
    ]);

    // booksCompleted: a book counts as completed iff the user has progress for
    // every published chapter. Cheap-to-compute approximation: bookId →
    // distinct chapter count equals book.totalChapters.
    const byBook = new Map<string, { read: number; total: number }>();
    for (const row of completedProgress) {
      const bookId = row.chapter.bookId;
      const total = row.chapter.book.totalChapters;
      const acc = byBook.get(bookId) ?? { read: 0, total };
      acc.read += 1;
      byBook.set(bookId, acc);
    }
    let booksCompleted = 0;
    for (const { read, total } of byBook.values()) {
      if (total > 0 && read >= total) booksCompleted += 1;
    }

    // Minutes estimate: 12 min per completed chapter + 5 min per diary entry.
    // Conservative on purpose — overstating progress is worse than understating.
    const minutesTotal = chaptersRead * 12 + diaryEntries * 5;

    return {
      daysActive: distinctDaysRows.length,
      booksCompleted,
      chaptersRead,
      diaryEntries,
      minutesTotal,
      currentStreakDays: user?.currentStreakDays ?? 0,
      longestStreakDays: user?.longestStreakDays ?? 0,
    };
  }

  private computeInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
