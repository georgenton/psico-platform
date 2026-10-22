import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiForbiddenResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequiredRole, RolesGuard } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IntegrationsService } from "./integrations.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MapIdentityService } from "./map-identity.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SchemaReadinessService } from "./schema-readiness.service";
import type { SchemaReadinessReason } from "./schema-readiness";

/** What a 503 from /api/health/ready says, per cause. */
const READINESS_MESSAGE: Record<SchemaReadinessReason, string> = {
  ok: "Schema is current.",
  pending: "This build ships migrations the database has not applied.",
  failed:
    "The database holds migrations recorded as unfinished or rolled back; migrate deploy will refuse to continue until they are resolved.",
  "migrations-unreadable":
    "This image's migrations directory could not be read, so readiness cannot be established.",
  "database-unreachable":
    "The migration ledger could not be read from the database.",
};

@ApiTags("Health")
@Controller("health")
// External monitors (Railway, UptimeRobot) ping this every 30-60s from a
// single IP. Under the default 60/min throttle they would trigger 429s and
// flag the service as down. The whole point of /health is to be cheap and
// always-available — opting out of throttling is the safe choice.
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly identity: MapIdentityService,
    private readonly schema: SchemaReadinessService,
  ) {}

  /**
   * Liveness, and deliberately NOTHING about the schema.
   *
   * It is tempting to make this fail while migrations are pending — the
   * runbook's own «un /health verde no dice nada sobre el esquema» invites
   * it. It cannot be this route, and the reason is mechanical rather than a
   * matter of taste.
   *
   * Coolify polls `health_check_path` (today `/health`) from
   * `rolling_update()`, and only AFTER that succeeds does the job reach
   * `post_deployment()` — which is where `prisma migrate deploy` now runs,
   * because the pre-deployment hook execs into the outgoing container and so
   * reads the previous commit's migrations. Making this route strict would
   * therefore deadlock every deploy that carries a migration: the gate waits
   * for a schema that only the step after the gate can apply.
   *
   * So the strict answer lives at `/api/health/ready`, which nothing gates on.
   * Pointing Coolify's gate at it is a one-line config change, and it becomes
   * correct the day the migration runs before the health check — a migration
   * job, or applying it before the server listens. Until then, the honest
   * arrangement is a liveness gate plus a readiness probe that ops and smoke
   * checks actually read.
   */
  @Get()
  @ApiOperation({
    summary: "Liveness check",
    description:
      "Returns 200 with a timestamp. Exposed at /health (not /api/health) so external uptime monitors can keep a stable URL. Opted out of rate limiting via @SkipThrottle(). Says nothing about the database schema — ask /api/health/ready for that, and see this handler's comment for why the two cannot be the same route.",
  })
  check() {
    return { status: "ok", timestamp: new Date() };
  }

  /**
   * Served at `/api/health/ready`, not `/health/ready`.
   *
   * `setGlobalPrefix` excludes `{ path: "health" }`, and that exclusion is the
   * exact path rather than a subtree — so `/health` keeps its prefix-free URL
   * for external uptime monitors while every child of this controller lives
   * under `/api`, as `/api/health/integrations` and `/api/health/emotional-map`
   * already did. Worth stating because the obvious guess is wrong, and the
   * wrong guess is a 404 handed to whoever is checking a promotion.
   */
  @Get("ready")
  @ApiOperation({
    summary: "Schema readiness check",
    description:
      "Served at /api/health/ready (the prefix exclusion covers only /health itself). 200 when every migration shipped in this image is applied to the database it is talking to; 503 with the pending names otherwise. Public and un-throttled for the same reason as /health: the things that need to ask — a deploy gate, a post-promotion smoke — cannot authenticate, and migration names are already public in the repository. Fails closed: an unreadable migrations folder or an unreachable database answer 503, never 200.",
  })
  @ApiServiceUnavailableResponse({ type: ErrorEnvelopeDto })
  async ready() {
    const report = await this.schema.report();
    if (report.ready) return report;
    throw new ServiceUnavailableException({
      code: "SCHEMA_NOT_READY",
      message: READINESS_MESSAGE[report.reason],
      details: report,
    });
  }

  @Get("integrations")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
  @ApiOperation({
    summary: "Integrations status (ADMIN only)",
    description:
      "Reports which external services are configured in the running environment. Booleans only — no env values are leaked. The `stub` flag is true when a value matches a placeholder pattern (test/stub) so ops can spot mis-configured prod boxes. Use this to sanity-check a Railway deploy before running smoke tests.",
  })
  @ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
  @ApiForbiddenResponse({ type: ErrorEnvelopeDto })
  integrationsReport() {
    return this.integrations.report();
  }

  @Get("emotional-map")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
  @ApiOperation({
    summary: "Emotional-map identity probe (ADMIN only)",
    description:
      "Compares the emotional-map identity (schema versions, scoring version, config fingerprints, epochs, flags, environment, release SHA) of this API against the one MAINTAINED BY A LIVE WORKER HEARTBEAT. The worker republishes its identity every 60s under a 180s TTL, so a dead worker — or a deploy that never came up — reports as a MISMATCH rather than silently agreeing from a stale key. An unknown build (missing commit SHA) is also a mismatch: we do not certify what we cannot identify. A mismatch means the cron is writing snapshots this API will refuse to read — run this after every deploy. Names, numbers and booleans only; no secrets.",
  })
  @ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
  @ApiForbiddenResponse({ type: ErrorEnvelopeDto })
  emotionalMapIdentity() {
    return this.identity.compare();
  }
}
