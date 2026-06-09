import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma";
import type { LiveActivityKind } from "@prisma/client";
import { APNS_PROVIDER } from "./tokens";
import type { IApnsProvider } from "./providers/apns-provider.interface";

/**
 * LiveActivitiesService — Sprint E.5 backend stub.
 *
 * Persists the per-activity push tokens that the mobile app receives from
 * iOS's ActivityKit when `Activity.start()` is called.
 *
 * The actual content updates (`sendUpdate`) currently route through
 * ConsoleApnsProvider which only logs. When Apple Developer + APNs creds
 * are configured, swap the binding in `live-activities.module.ts` and the
 * exact same call path goes to Apple's servers.
 */
@Injectable()
export class LiveActivitiesService {
  private readonly logger = new Logger("LiveActivitiesService");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APNS_PROVIDER) private readonly apns: IApnsProvider,
  ) {}

  /**
   * Upsert by (userId, activityId). Mobile app may rotate the push token
   * mid-activity and POSTs again with same activityId — we want to keep
   * one row per activity, latest token wins.
   */
  async register(
    userId: string,
    body: {
      activityId: string;
      kind: LiveActivityKind;
      pushToken: string;
      bundleId: string;
    },
  ): Promise<{ id: string; isProviderConfigured: boolean }> {
    const row = await this.prisma.liveActivityToken.upsert({
      where: {
        userId_activityId: {
          userId,
          activityId: body.activityId,
        },
      },
      update: {
        pushToken: body.pushToken,
        bundleId: body.bundleId,
        dismissedAt: null,
      },
      create: {
        userId,
        activityId: body.activityId,
        kind: body.kind,
        pushToken: body.pushToken,
        bundleId: body.bundleId,
      },
    });

    return {
      id: row.id,
      isProviderConfigured: this.apns.isConfigured(),
    };
  }

  /**
   * Mark the activity as dismissed. We do NOT delete the row — keep audit
   * trail for ops. A future weekly pruner reaps rows with
   * `dismissedAt < now() - 7d`.
   *
   * Also tries to send an "end" event via APNs so iOS dismisses the
   * activity immediately even if the user never opens the app. If the
   * push token is already invalid, we swallow it (the activity will
   * dismiss naturally on its iOS-side TTL).
   */
  async dismiss(userId: string, activityId: string): Promise<{ ok: true }> {
    const row = await this.prisma.liveActivityToken.findUnique({
      where: { userId_activityId: { userId, activityId } },
    });
    if (!row) {
      throw new NotFoundException("LIVE_ACTIVITY_NOT_FOUND");
    }

    if (row.dismissedAt) {
      // Idempotent: already dismissed.
      return { ok: true };
    }

    if (this.apns.isConfigured()) {
      try {
        await this.apns.sendUpdate({
          pushToken: row.pushToken,
          bundleId: row.bundleId,
          contentState: {},
          event: "end",
        });
      } catch (err) {
        this.logger.warn(
          `APNs end-event failed for activityId=${activityId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await this.prisma.liveActivityToken.update({
      where: { userId_activityId: { userId, activityId } },
      data: { dismissedAt: new Date() },
    });

    return { ok: true };
  }

  /**
   * List currently-active Live Activities for a user. Useful for the
   * mobile app's resume-after-relaunch case AND for ops dashboards once
   * Pulso v2 grows.
   */
  async listActive(userId: string) {
    return this.prisma.liveActivityToken.findMany({
      where: { userId, dismissedAt: null },
      select: {
        id: true,
        activityId: true,
        kind: true,
        bundleId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Server-driven push — currently used by background jobs (eco "thinking
   * → responding", lector "chapter complete", etc). Returns whether the
   * provider was actually configured; logs otherwise.
   */
  async pushUpdate(
    userId: string,
    activityId: string,
    contentState: Record<string, unknown>,
    opts: { dismissalDate?: Date; event?: "update" | "end" } = {},
  ): Promise<{ ok: boolean; reason?: "not_configured" | "invalid_token" }> {
    const row = await this.prisma.liveActivityToken.findUnique({
      where: { userId_activityId: { userId, activityId } },
    });
    if (!row || row.dismissedAt) {
      throw new NotFoundException("LIVE_ACTIVITY_NOT_FOUND");
    }
    if (!this.apns.isConfigured()) {
      this.logger.warn(
        `pushUpdate called but APNs provider is not configured. activityId=${activityId}`,
      );
      return { ok: false, reason: "not_configured" };
    }

    const res = await this.apns.sendUpdate({
      pushToken: row.pushToken,
      bundleId: row.bundleId,
      contentState,
      dismissalDate: opts.dismissalDate,
      event: opts.event,
    });

    if (res.ok) {
      return { ok: true };
    }

    // APNs returned 410 → token dead. Prune locally.
    await this.prisma.liveActivityToken.update({
      where: { userId_activityId: { userId, activityId } },
      data: { dismissedAt: new Date() },
    });
    return { ok: false, reason: "invalid_token" };
  }
}
