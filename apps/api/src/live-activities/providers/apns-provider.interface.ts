/**
 * IApnsProvider — abstracts APNs HTTP/2 calls for Live Activities.
 *
 * Sprint E.5: ConsoleApnsProvider (no-op + log) is the default. When
 * Apple Developer account + `.p8` push key + Team ID + Bundle ID become
 * available, swap to a real `Apns2Provider` backed by the `apns2` lib.
 *
 * The interface intentionally mirrors the shape of `IPaymentProvider` /
 * `IVoiceProvider` so the swap happens at module bind time without
 * touching consumers.
 */
export interface IApnsProvider {
  /**
   * Send an update to a single Live Activity.
   *
   * - `pushToken` — the per-activity APNs push token (NOT a device token).
   * - `bundleId` — used to construct the topic: `{bundleId}.push-type.liveactivity`.
   * - `contentState` — JSON object the widget renders. Privacy-safe data
   *   only (no ciphertext, no plaintext from Diario/Eco).
   * - `dismissalDate` — optional. When set, iOS dismisses the activity at
   *   that time even if the user never opens the app.
   * - `event` — "update" (default) or "end" (terminate the activity).
   *
   * Returns `{ ok: true }` on success. On 410 Gone (token invalidated),
   * returns `{ ok: false, invalidToken: true }` so the caller can prune
   * the DB row. Other errors throw.
   */
  sendUpdate(opts: {
    pushToken: string;
    bundleId: string;
    contentState: Record<string, unknown>;
    dismissalDate?: Date;
    event?: "update" | "end";
  }): Promise<{ ok: true } | { ok: false; invalidToken: true }>;

  /** Whether this provider has real credentials wired up. */
  isConfigured(): boolean;
}
