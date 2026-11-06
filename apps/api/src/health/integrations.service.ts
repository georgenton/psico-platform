/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DEFAULT_EMAIL_FROM } from "../config/env.schema";
import type { Env } from "../config";

/**
 * Report shape returned by `GET /api/health/integrations`.
 *
 * Booleans only — never leaks the actual env value. The endpoint helps
 * ops verify which integrations are wired in a given environment without
 * having to SSH into the box or read Railway's env-vars panel.
 *
 * `stub` is true when the value looks like a placeholder we set during
 * tests / local dev (e.g. `price_stub_monthly`). That distinguishes "not
 * configured" from "configured with a fake value" — the latter is a
 * production smell.
 */
export interface IntegrationStatus {
  configured: boolean;
  stub?: boolean;
}

export interface IntegrationsReport {
  stripe: {
    secretKey: IntegrationStatus;
    webhookSecret: IntegrationStatus;
    priceIds: {
      proMonthly: IntegrationStatus;
      proYearly: IntegrationStatus;
      b2b: IntegrationStatus;
    };
  };
  anthropic: IntegrationStatus;
  voice: { provider: "whisper" | "deepgram"; key: IntegrationStatus };
  resend: IntegrationStatus;
  /**
   * Whether the SENDER was chosen, as opposed to defaulted.
   *
   * Separate from `resend` because they fail independently and only one of
   * them is visible. A key with no chosen sender reads as a working mail
   * configuration — boot says nothing, the report said nothing — while every
   * message leaves claiming whatever the default names. Resend refuses an
   * unverified domain, so the symptom arrives as "mail does not work" long
   * after the cause.
   *
   * `configured: false` means EMAIL_FROM still equals `DEFAULT_EMAIL_FROM`.
   * The box cannot know which domains are verified in Resend; it can know
   * that nobody picked one, which is the actionable half.
   */
  resendFrom: IntegrationStatus;
  google: IntegrationStatus;
  redis: IntegrationStatus;
  webPush: IntegrationStatus;
  r2: IntegrationStatus;
}

/** A value is "stub-like" if it contains `stub` or `test` (case-insensitive). */
function isStubValue(v: string): boolean {
  return /stub|test/i.test(v);
}

function status(v: string | undefined): IntegrationStatus {
  if (!v) return { configured: false };
  if (isStubValue(v)) return { configured: true, stub: true };
  return { configured: true };
}

/**
 * Was the sender CHOSEN?
 *
 * Three inputs, two answers. `undefined` is grouped with the default on
 * purpose: Zod applies the default before anything reads the value, so in a
 * running process unset and defaulted are the same state — but a test stub
 * hands back `undefined`, and a bare `!== DEFAULT_EMAIL_FROM` would have
 * reported "chosen" there. The assertion would then pass while describing the
 * opposite of production, which is worse than no assertion.
 *
 * An operator who explicitly types the default value reads as "not chosen".
 * That is indistinguishable by construction, and the advice is identical
 * either way — verify that domain, then pick a sender on it — so the
 * ambiguity costs nothing.
 */
function isChosenSender(config: ConfigService<Env, true>): boolean {
  const v = config.get("EMAIL_FROM", { infer: true });
  return v !== undefined && v !== DEFAULT_EMAIL_FROM;
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Build the report from the live env values. Stripe price IDs are the
   * highest-signal field for an ops sanity check — if any of the three
   * is missing or stub, the checkout flow won't work in prod even though
   * the boot validation passes.
   */
  report(): IntegrationsReport {
    const provider = this.config.get("VOICE_PROVIDER", { infer: true });
    const voiceKey =
      provider === "deepgram"
        ? this.config.get("DEEPGRAM_API_KEY", { infer: true })
        : this.config.get("OPENAI_API_KEY", { infer: true });

    return {
      stripe: {
        secretKey: status(
          this.config.get("STRIPE_SECRET_KEY", { infer: true }),
        ),
        webhookSecret: status(
          this.config.get("STRIPE_WEBHOOK_SECRET", { infer: true }),
        ),
        priceIds: {
          proMonthly: status(
            this.config.get("STRIPE_PRO_MONTHLY_PRICE_ID", { infer: true }),
          ),
          proYearly: status(
            this.config.get("STRIPE_PRO_YEARLY_PRICE_ID", { infer: true }),
          ),
          b2b: status(this.config.get("STRIPE_B2B_PRICE_ID", { infer: true })),
        },
      },
      anthropic: status(this.config.get("ANTHROPIC_API_KEY", { infer: true })),
      voice: { provider, key: status(voiceKey) },
      resend: status(this.config.get("RESEND_API_KEY", { infer: true })),
      resendFrom: { configured: isChosenSender(this.config) },
      google: status(this.config.get("GOOGLE_CLIENT_ID", { infer: true })),
      redis: status(this.config.get("REDIS_URL", { infer: true })),
      webPush: status(this.config.get("VAPID_PRIVATE_KEY", { infer: true })),
      r2: status(this.config.get("R2_ACCOUNT_ID", { infer: true })),
    };
  }

  /**
   * Same data as `report()`, but flattened to a list of items in
   * production-impacting state (not configured OR stub). Used by the
   * boot-time banner so ops sees a punch list at startup.
   */
  bootIssues(): Array<{ key: string; reason: "missing" | "stub" }> {
    const r = this.report();
    const out: Array<{ key: string; reason: "missing" | "stub" }> = [];
    const check = (key: string, s: IntegrationStatus) => {
      if (!s.configured) out.push({ key, reason: "missing" });
      else if (s.stub) out.push({ key, reason: "stub" });
    };
    check("STRIPE_SECRET_KEY", r.stripe.secretKey);
    check("STRIPE_WEBHOOK_SECRET", r.stripe.webhookSecret);
    check("STRIPE_PRO_MONTHLY_PRICE_ID", r.stripe.priceIds.proMonthly);
    check("STRIPE_PRO_YEARLY_PRICE_ID", r.stripe.priceIds.proYearly);
    check("STRIPE_B2B_PRICE_ID", r.stripe.priceIds.b2b);
    check("ANTHROPIC_API_KEY", r.anthropic);
    check(`VOICE (${r.voice.provider}) KEY`, r.voice.key);
    check("RESEND_API_KEY", r.resend);
    // Only when there IS a key. With no key nothing is sent, so an unchosen
    // sender is not yet a problem and listing it would be noise in a punch
    // list whose value is that every line matters. With a key it is the
    // difference between mail arriving and mail being refused.
    if (r.resend.configured && !r.resendFrom.configured) {
      out.push({ key: "EMAIL_FROM (defaulted, not chosen)", reason: "stub" });
    }
    check("GOOGLE_CLIENT_ID", r.google);
    check("REDIS_URL", r.redis);
    check("VAPID keys", r.webPush);
    return out;
  }
}
