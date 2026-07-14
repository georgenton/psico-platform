import "reflect-metadata";
// Sentry init must run BEFORE any other import so the SDK's HTTP/PG
// instrumentation can patch those modules at require time. Splitting it
// from the rest of the imports below is deliberate.
import { initSentry } from "./observability/sentry";
initSentry();

import { writeFileSync } from "fs";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import {
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./shared";
import { assertEmotionalMapConfigured } from "./emotional-map/cache-identity";

async function bootstrap(): Promise<void> {
  // PR-0.1 — refuse to boot with a missing/malformed epoch, or with a critical
  // safety flag out of position. A silent fallback would let this API serve
  // values from an epoch nobody chose — or, worse, let an LLM score axes because
  // EMOTIONAL_MAP_LLM_SCORING defaults to `true` in code and the box forgot it.
  assertEmotionalMapConfigured();

  // rawBody: true enables req.rawBody for Stripe webhook signature verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // ── 0. Trust proxy ────────────────────────────────────────────────────────
  // Behind Railway, the actual client IP is in `X-Forwarded-For` — without
  // this setting Express returns the IP of Railway's internal proxy for every
  // request, which collapses all global traffic into ONE bucket from the
  // throttler's perspective (5 logins worldwide in 15 min would 429 the
  // entire planet).
  //
  // `1` means "trust ONE hop" — only the immediate upstream proxy can set
  // `X-Forwarded-For`. Setting `true` would trust any number of hops, which
  // lets a malicious client spoof the header (`X-Forwarded-For: <victim-ip>`)
  // and frame another user for the rate-limit hit.
  //
  // Railway sits exactly one hop in front of the Node process, so `1` is the
  // correct value.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  // ── 1. Global API prefix ──────────────────────────────────────────────────
  // Every route lands under /api/* per ADR 0006.
  //
  // Exclusions:
  //  - /health stays at the root so external uptime checkers (Railway, Better
  //    Uptime, UptimeRobot) can keep their configured URL stable.
  //  - The Stripe webhook is also exposed at the root path it has today
  //    (/subscriptions/webhook) so we don't have to coordinate a Stripe
  //    Dashboard change in the same deploy. Sprint S11 moves it to
  //    /api/billing/webhook with double exposure.
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.ALL },
      { path: "subscriptions/webhook", method: RequestMethod.ALL },
    ],
  });

  // ── 2. URI versioning ─────────────────────────────────────────────────────
  // Routes without an explicit @Version() are version-neutral (live at
  // /api/<path>). When we ship a breaking change to a single route, we
  // declare @Version("2") on the new handler — Nest exposes it at
  // /api/v2/<path>, leaving /api/<path> pointing to the unversioned handler.
  //
  // We deliberately do NOT default to "1" because that would force every
  // existing route to /api/v1/<path>, which contradicts the design's
  // convention that "all endpoints live under /api/*" (no version segment).
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: undefined,
  });

  // ── 3. Validation, error envelope, CORS ───────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    // TODO senior: restrict to production domains when deploying
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? "*",
    credentials: true,
  });

  // ── 4. OpenAPI / Swagger ──────────────────────────────────────────────────
  // Document built from @ApiTags / @ApiOperation / @ApiResponse decorators on
  // controllers. UI served at /api/docs in non-production environments only.
  // The JSON spec is written to disk on every boot so the CI job
  // `openapi-typescript` can regenerate the @psico/api-client package.
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Psico Platform API")
      .setDescription(
        "REST API for Psico Platform (psychoeducation SaaS). " +
          "Design source of truth: docs/design/handoff/. " +
          "Implementation plan: IMPLEMENTATION_PLAN_v2.md.",
      )
      .setVersion("0.x-alpha")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT access token returned by /api/auth/login",
        },
        "bearer",
      )
      .addTag("Auth", "Registration, login, refresh, OAuth")
      .addTag(
        "Users",
        "Profile, preferences, notifications, privacy, account lifecycle",
      )
      .addTag("Content · Books", "Catalog, reviews, favorites, bookmarks")
      .addTag("Content · Chapters", "Per-chapter reading")
      .addTag("Content · Progress", "Progress tracking")
      .addTag("AI · Eco", "Conversational AI companion")
      .addTag("Subscription", "Stripe checkout and billing")
      .addTag("Health", "Liveness")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: "Psico API · Swagger",
    });

    // Persist the OpenAPI spec for the CI client-codegen job.
    // Path is relative to the running process — works for both `nest start`
    // (cwd=apps/api) and `node dist/main` deployments.
    try {
      writeFileSync(
        join(process.cwd(), "openapi.json"),
        JSON.stringify(document, null, 2),
      );
    } catch (err) {
      // Non-fatal: dev experience continues even if disk is read-only.
      console.warn(
        "[bootstrap] Failed to persist openapi.json:",
        (err as Error).message,
      );
    }
  }

  // ── 5. Listen ─────────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
  console.log(`  Routes mounted under /api/*`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`  Swagger UI: http://localhost:${port}/api/docs`);
  }

  // ── 6. Integration banner ─────────────────────────────────────────────────
  // Surfaces every external service that's NOT configured or that has a
  // stub-looking value (e.g. `price_stub_monthly`). Helps ops spot a
  // misconfigured Railway box without having to curl /api/health/integrations.
  // Silent when everything is wired correctly.
  try {
    // Dynamic import avoids a circular dep with HealthModule at bootstrap.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { IntegrationsService } = require("./health/integrations.service");
    const svc = app.get(IntegrationsService);
    const issues: Array<{ key: string; reason: "missing" | "stub" }> =
      svc.bootIssues();
    if (issues.length > 0) {
      console.warn(
        `\n⚠️  Integration check · ${issues.length} item(s) need attention:`,
      );
      for (const { key, reason } of issues) {
        const tag = reason === "missing" ? "MISSING" : "STUB";
        console.warn(`   [${tag}] ${key}`);
      }
      console.warn(
        "   Fix in Railway / Vercel env panel. See docs/ROADMAP.md §3.\n",
      );
    } else if (process.env.NODE_ENV !== "production") {
      console.log("  All external integrations configured ✅");
    }
  } catch {
    // Non-fatal — the banner is observability, not a contract.
  }

  // ── 7. Emotional-map identity ─────────────────────────────────────────────
  // PR-0.1 — log the identity (versions, fingerprints, epochs, flags) and
  // publish it so `GET /api/health/emotional-map` can compare it against the
  // worker's. Booleans and hashes only; never a secret.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { MapIdentityService } = require("./health/map-identity.service");
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { REDIS_CLIENT } = require("./redis");
    // Heartbeat, not a one-shot: a key with no refresh would let a dead service
    // keep asserting "we agree" long after it stopped running.
    MapIdentityService.startHeartbeat(
      app.get(REDIS_CLIENT),
      "api",
      new Logger("Bootstrap"),
    );
  } catch (err) {
    // Non-fatal: the probe will simply report the API identity it computes
    // live. The epochs themselves were already validated below/at boot.
    console.warn(
      `Could not publish the emotional-map identity: ${(err as Error).message}`,
    );
  }
}

bootstrap();
