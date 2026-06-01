// Stub env vars BEFORE any module that reads `process.env` is imported.
// Vitest evaluates `setupFiles` before user code, so we can safely set
// here and have AppModule's ConfigModule pick them up at construct time.

const STUBS = {
  DATABASE_URL: "postgresql://x:x@localhost:5432/x",
  JWT_SECRET: "e2e-test-secret-must-be-at-least-32-chars",
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "30d",
  R2_ACCOUNT_ID: "stub",
  R2_ACCESS_KEY_ID: "stub",
  R2_SECRET_ACCESS_KEY: "stub",
  R2_BUCKET_NAME: "stub",
  R2_PUBLIC_URL: "https://stub.r2.example.com",
  ANTHROPIC_API_KEY: "stub",
  VOYAGE_API_KEY: "stub",
  STRIPE_SECRET_KEY: "sk_test_stub",
  STRIPE_WEBHOOK_SECRET: "whsec_stub",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_stub_monthly",
  STRIPE_PRO_YEARLY_PRICE_ID: "price_stub_yearly",
  STRIPE_B2B_PRICE_ID: "price_stub_b2b",
  // Voice provider — Whisper by default in tests. Tests that exercise
  // Deepgram override VOICE_PROVIDER + DEEPGRAM_API_KEY locally.
  VOICE_PROVIDER: "whisper",
  OPENAI_API_KEY: "sk-stub",
  NODE_ENV: "test",
  // REDIS_URL intentionally unset → RedisModule falls back to ioredis-mock.
} as const;

for (const [k, v] of Object.entries(STUBS)) {
  if (!process.env[k]) process.env[k] = v;
}
