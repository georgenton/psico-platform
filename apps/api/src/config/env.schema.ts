import { z } from "zod";

export const envSchema = z
  .object({
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
    JWT_SECRET: z
      .string()
      .min(32, "JWT_SECRET must be at least 32 characters for security"),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
    PORT: z.coerce.number().int().positive().default(3001),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    // Redis — required in production (for throttler + idempotency cache).
    // Optional in dev/test so the app boots without Redis; the RedisModule
    // falls back to ioredis-mock in those environments (ADR 0008).
    // Format: standard Redis URL ("redis://..." or "rediss://..." for TLS).
    // Upstash on Railway exposes this directly via plugin.
    REDIS_URL: z.string().url().optional(),

    // Frontend URL — used to build links that go inside emails
    // (password reset, verify email). Must NOT have a trailing slash; the
    // notification templates append the path themselves.
    APP_URL: z.string().url().default("http://localhost:3000"),

    // Resend (transactional email) — required in production.
    // In dev/test, ResendService logs to console instead of sending real mail.
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().default("no-reply@psico.app"),

    // Google OAuth — required if the frontend exposes "Sign in with Google".
    // Optional otherwise so existing deployments without OAuth keep working.
    // The clientId is also used to *verify* ID tokens server-side, so any
    // mismatch with the frontend's clientId will fail audience validation.
    GOOGLE_CLIENT_ID: z.string().optional(),

    // Cloudflare R2 (S3-compatible object storage)
    R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
    R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
    R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
    R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required"),
    R2_PUBLIC_URL: z.string().url("R2_PUBLIC_URL must be a valid URL"),

    // Payment gateway selection (Phase 1: stripe | Phase 2: payphone)
    DEFAULT_PAYMENT_PROVIDER: z.enum(["stripe", "payphone"]).default("stripe"),

    // AI companion
    ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
    VOYAGE_API_KEY: z.string().min(1, "VOYAGE_API_KEY is required"),
    AI_MAX_CONTEXT_CHUNKS: z.coerce.number().int().positive().default(5),

    // Stripe billing
    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .min(1, "STRIPE_WEBHOOK_SECRET is required"),
    STRIPE_PRO_MONTHLY_PRICE_ID: z
      .string()
      .min(1, "STRIPE_PRO_MONTHLY_PRICE_ID is required"),
    STRIPE_PRO_YEARLY_PRICE_ID: z
      .string()
      .min(1, "STRIPE_PRO_YEARLY_PRICE_ID is required"),
    STRIPE_B2B_PRICE_ID: z.string().min(1, "STRIPE_B2B_PRICE_ID is required"),

    // Voice transcription (Sprint S8). VOICE_PROVIDER selects between
    // Whisper (OpenAI) and Deepgram. Per-provider API keys are optional at
    // the schema level — superRefine below requires the matching key for
    // the selected provider so we don't crash mid-request.
    VOICE_PROVIDER: z.enum(["whisper", "deepgram"]).default("whisper"),
    OPENAI_API_KEY: z.string().optional(),
    DEEPGRAM_API_KEY: z.string().optional(),

    // Sprint S69 — Video provider (Terapia sala).
    //
    // VIDEO_PROVIDER selects between console (stub) and daily (real
    // Daily.co API). For "daily", DAILY_API_KEY + DAILY_DOMAIN are
    // required — gated by superRefine below to fail fast at boot.
    VIDEO_PROVIDER: z.enum(["console", "daily"]).default("console"),
    DAILY_API_KEY: z.string().optional(),
    DAILY_DOMAIN: z.string().optional(),
    // Sprint S70 — HMAC signature secret to verify Daily.co webhook events.
    // Set when configuring the webhook in Daily's dashboard (Developers →
    // Webhooks). If unset, /webhooks/daily rejects ALL incoming events with
    // 503 (fail-closed) — safer than accepting unauthenticated state changes.
    DAILY_WEBHOOK_SECRET: z.string().optional(),

    // Sprint S47 — Web Push (VAPID).
    //
    // VAPID = Voluntary Application Server Identification. Mozilla / Chrome /
    // Edge push services require the server to sign each push payload with a
    // VAPID JWT so they can rate-limit and identify the originating service.
    //
    // Generation: `pnpm --filter @psico/api gen:vapid` writes a fresh keypair
    // to stdout. Add the values to Railway (API + worker services) and the
    // PUBLIC key to Vercel as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
    //
    // All three are OPTIONAL at the schema level — when unset, the PushService
    // skips WEB tokens (returns status="error" + logs a warning) and continues
    // delivering EXPO tokens normally. This keeps existing deploys booting
    // without an env shuffle. superRefine below requires the trio together
    // in production once at least one is set — half-set is a configuration
    // bug we want to catch at boot.
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),

    // Sentry observability (Sprint 2 del roadmap). When unset, the SDK
    // init is a no-op and `captureException` swallows the call. Both
    // API and worker share the same DSN — same project from a triage
    // standpoint.
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_RELEASE: z.string().optional(),
  })
  // Cross-field validation: in production, certain optional fields become
  // required. Keeping the rule here (instead of separate per-env schemas)
  // means a single source of truth for production sanity checks.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message:
          "REDIS_URL is required in production (used by throttler and idempotency cache)",
      });
    }
    // The selected voice provider must have its API key. We don't gate by
    // NODE_ENV because dev should also fail fast if you set VOICE_PROVIDER=
    // deepgram without DEEPGRAM_API_KEY — easier to catch at boot than at
    // the first /voz/transcribe call.
    if (env.VOICE_PROVIDER === "whisper" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message:
          "OPENAI_API_KEY is required when VOICE_PROVIDER=whisper. Set it or switch VOICE_PROVIDER to deepgram.",
      });
    }
    if (env.VOICE_PROVIDER === "deepgram" && !env.DEEPGRAM_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEEPGRAM_API_KEY"],
        message:
          "DEEPGRAM_API_KEY is required when VOICE_PROVIDER=deepgram. Set it or switch VOICE_PROVIDER to whisper.",
      });
    }
    // Sprint S69 — Daily.co video provider gating.
    if (env.VIDEO_PROVIDER === "daily") {
      if (!env.DAILY_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DAILY_API_KEY"],
          message:
            "DAILY_API_KEY is required when VIDEO_PROVIDER=daily. Set it or switch VIDEO_PROVIDER to console.",
        });
      }
      if (!env.DAILY_DOMAIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DAILY_DOMAIN"],
          message:
            "DAILY_DOMAIN is required when VIDEO_PROVIDER=daily (e.g. 'psico.daily.co'). Set it or switch VIDEO_PROVIDER to console.",
        });
      }
    }
    // Sprint S47 — VAPID trio. We tolerate the all-unset state (web push
    // simply disabled), but reject the half-set states because they ALWAYS
    // come from a botched env shuffle and silently break delivery.
    const anyVapid =
      env.VAPID_PUBLIC_KEY || env.VAPID_PRIVATE_KEY || env.VAPID_SUBJECT;
    const allVapid =
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT;
    if (anyVapid && !allVapid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VAPID_PUBLIC_KEY"],
        message:
          "VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT must be set together (or all three left unset to disable web push).",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
