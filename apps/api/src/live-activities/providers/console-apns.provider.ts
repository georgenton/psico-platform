import { Injectable, Logger } from "@nestjs/common";
import type { IApnsProvider } from "./apns-provider.interface";

/**
 * ConsoleApnsProvider — Sprint E.5 default.
 *
 * Logs the update to stdout and pretends success. Used when:
 *  - APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY are unset (no Apple Dev account yet)
 *  - Tests
 *  - Local dev when ops doesn't want APNs traffic
 *
 * Privacy: contentState is logged as JSON to stdout. The shape is
 * categorical (counters, opaque IDs) — never ciphertext, plaintext, or
 * seed-phrase material. Caller is responsible for that invariant.
 */
@Injectable()
export class ConsoleApnsProvider implements IApnsProvider {
  private readonly logger = new Logger("ConsoleApnsProvider");

  async sendUpdate(opts: {
    pushToken: string;
    bundleId: string;
    contentState: Record<string, unknown>;
    dismissalDate?: Date;
    event?: "update" | "end";
  }): Promise<{ ok: true }> {
    this.logger.log(
      `[live-activity stub] token=${opts.pushToken.slice(0, 8)}… bundle=${opts.bundleId} event=${opts.event ?? "update"} state=${JSON.stringify(opts.contentState)}`,
    );
    return { ok: true };
  }

  isConfigured(): boolean {
    return false;
  }
}
