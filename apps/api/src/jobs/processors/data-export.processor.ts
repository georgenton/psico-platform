import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StorageService } from "../../storage";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResendService } from "../../notifications";
import { emailShell, escape } from "../../notifications/templates/base";
import { JobName, QueueName, type DataExportJobPayload } from "../queue-names";

/**
 * Generates a user data export and uploads it to R2.
 *
 * Scope for Sprint S3 (per user decision):
 *   - profile + preferences + privacy settings + notifications
 *   - reading progress (UserProgress entries with chapter metadata)
 *   - subscription history
 *
 * NOT yet included (added when their modules land):
 *   - Diary entries (S6) — will arrive as opaque ciphertext (E2E encrypted)
 *   - Eco threads (S9) — same
 *   - Highlights / annotations (S6) — plaintext
 *   - Auth events (S25 when we surface them via Pulso)
 *
 * Output format: JSON with `_meta.exportSchemaVersion`. When we add Diary,
 * we bump the version so consumers can detect schema changes.
 *
 * On success: writes file URL + status="READY" + emails the user.
 * On final failure (after retries): writes status="FAILED" and logs.
 */
@Processor(QueueName.DATA_EXPORT)
export class DataExportProcessor extends WorkerHost {
  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly resend: ResendService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async process(job: Job<DataExportJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_DATA_EXPORT) {
      throw new Error(`DataExportProcessor unknown job name: ${job.name}`);
    }

    const { requestId, userId } = job.data;
    this.logger.log(
      `Building data export ${requestId} for user ${userId} (attempt ${job.attemptsMade + 1})`,
    );

    // Defensive: confirm the request still exists. The user may have
    // requested deletion of their account in the meantime — in which case
    // we cancel the export.
    const request = await this.prisma.dataExportRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { select: { id: true, email: true, deleteRequestedAt: true } },
      },
    });
    if (!request || request.user.deleteRequestedAt) {
      this.logger.warn(
        `Skipping export ${requestId} — request missing or user pending deletion`,
      );
      return;
    }

    try {
      // 1. Mark PROCESSING so concurrent retries can detect in-flight work.
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: "PROCESSING" },
      });

      // 2. Assemble payload.
      const payload = await this.buildPayload(userId);

      // 3. Upload JSON to R2.
      const buffer = Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
      const key = `data-exports/${userId}/${requestId}.json`;
      const fileUrl = await this.storage.uploadFile(
        buffer,
        key,
        "application/json",
      );

      // 4. Mark READY + persist the URL.
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: "READY", fileUrl, completedAt: new Date() },
      });

      // 5. Notify the user — separate Resend send (could be queued through
      //    the email queue, but we're already in a worker so a direct call
      //    is fine).
      const appUrl = this.config.get("APP_URL", { infer: true });
      const html = emailShell({
        preheader: "Tu exportación de datos está lista.",
        bodyHtml: `
          <p style="margin:0 0 16px; font-size:17px; font-weight:600;">Tu exportación está lista</p>
          <p style="margin:0 0 16px;">
            Generamos un archivo JSON con tu perfil, progreso de lectura y suscripción.
          </p>
          <p style="margin:24px 0;">
            <a href="${escape(fileUrl)}"
               style="display:inline-block; padding:14px 28px; border-radius:14px; background:#7C5BC4; color:#FFFFFF; text-decoration:none; font-weight:600; font-size:15px;">
              Descargar mi exportación
            </a>
          </p>
          <p style="margin:24px 0 0; color:#7E6F5F; font-size:13px;">
            El enlace estará disponible por 7 días. También puedes pedir otro export
            desde tu perfil en ${escape(appUrl)}.
          </p>`,
      });
      await this.resend.send({
        to: request.user.email,
        subject: "Tu exportación de datos · Psico Platform",
        html,
        text: `Tu exportación está lista. Descárgala en: ${fileUrl}\nEl enlace vence en 7 días.`,
        tag: "data-export-ready",
      });

      this.logger.log(
        `Data export ${requestId} READY · ${buffer.length} bytes uploaded`,
      );
    } catch (err) {
      // Final-attempt bookkeeping. On non-final attempts BullMQ will retry,
      // and we DON'T want to mark FAILED yet — the next retry might succeed.
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await this.prisma.dataExportRequest.update({
          where: { id: requestId },
          data: { status: "FAILED" },
        });
        this.logger.error(
          `Data export ${requestId} FINAL FAILURE: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
      throw err; // bubble up so BullMQ retries / marks failed
    }
  }

  /**
   * Assembles the export payload. Each section returns its own shape so
   * the JSON file is self-documenting.
   */
  private async buildPayload(userId: string) {
    const [user, progress, subscription, guideSessions] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          preferences: true,
          readerPreferences: true,
          notificationSettings: true,
          privacySettings: true,
        },
      }),
      this.prisma.userProgress.findMany({
        where: { userId },
        include: {
          chapter: {
            select: {
              title: true,
              order: true,
              book: { select: { slug: true, title: true } },
            },
          },
        },
        orderBy: { completedAt: "asc" },
      }),
      this.prisma.subscription.findUnique({ where: { userId } }),
      // CC-7.4B: the user's guided sessions + their accepted-step ledger.
      // Catalog keys, states, timestamps and the objective result enum ONLY —
      // never GuideCommandReceipt, idempotency keys or fingerprints (internal
      // operation data, ADR 0019 §9).
      this.prisma.guideSession.findMany({
        where: { userId },
        orderBy: { startedAt: "asc" },
        include: { steps: { orderBy: { order: "asc" } } },
      }),
    ]);

    if (!user) throw new Error(`User ${userId} not found during export`);

    return {
      _meta: {
        exportSchemaVersion: 1,
        generatedAt: new Date().toISOString(),
        note:
          "This file contains data Psico Platform stores about your account. " +
          "Diario and Eco data are end-to-end encrypted and not yet included " +
          "in this export (Sprint S6/S9 will add them as ciphertext + your " +
          "key derivation notes).",
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        name: user.name,
        city: user.city,
        avatarUrl: user.avatarUrl,
        role: user.role,
        plan: user.plan,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider,
        createdAt: user.createdAt,
        mood: user.mood,
        moodUpdatedAt: user.moodUpdatedAt,
        currentStreakDays: user.currentStreakDays,
        longestStreakDays: user.longestStreakDays,
      },
      profile: user.profile,
      preferences: user.preferences,
      readerPreferences: user.readerPreferences,
      notificationSettings: user.notificationSettings,
      privacySettings: user.privacySettings,
      progress: progress.map((p) => ({
        chapterTitle: p.chapter.title,
        chapterOrder: p.chapter.order,
        bookSlug: p.chapter.book.slug,
        bookTitle: p.chapter.book.title,
        completedAt: p.completedAt,
        score: p.score,
      })),
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            createdAt: subscription.createdAt,
          }
        : null,
      guideSessions: guideSessions.map((session) => ({
        guideKey: session.guideKey,
        guideVersion: session.guideVersion,
        status: session.status,
        editionId: session.editionId,
        unitId: session.unitId,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        cancelledAt: session.cancelledAt,
        steps: session.steps.map((step) => ({
          stepKey: step.stepKey,
          kind: step.kind,
          conceptKey: step.conceptKey,
          itemKey: step.itemKey,
          exerciseKey: step.exerciseKey,
          confirmationKey: step.confirmationKey,
          recallResult: step.recallResult,
          acceptedAt: step.acceptedAt,
        })),
      })),
    };
  }
}
