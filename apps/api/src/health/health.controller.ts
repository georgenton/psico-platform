import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiForbiddenResponse,
  ApiOperation,
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
  ) {}

  @Get()
  @ApiOperation({
    summary: "Liveness check",
    description:
      "Returns 200 with a timestamp. Exposed at /health (not /api/health) so external uptime monitors can keep a stable URL. Opted out of rate limiting via @SkipThrottle().",
  })
  check() {
    return { status: "ok", timestamp: new Date() };
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
      "Compares the emotional-map identity (schema versions, scoring version, config fingerprints, epochs, flags) of the API against the one the worker published at ITS boot. They are separate Railway services with separate environments: importing the same code does not make them agree. A mismatch means the cron is writing snapshots the API will silently refuse to read — run this after every deploy. Names and booleans only; no secrets.",
  })
  @ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
  @ApiForbiddenResponse({ type: ErrorEnvelopeDto })
  emotionalMapIdentity() {
    return this.identity.compare();
  }
}
