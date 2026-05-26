import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";

@ApiTags("Health")
@Controller("health")
// External monitors (Railway, UptimeRobot) ping this every 30-60s from a
// single IP. Under the default 60/min throttle they would trigger 429s and
// flag the service as down. The whole point of /health is to be cheap and
// always-available — opting out of throttling is the safe choice.
@SkipThrottle()
export class HealthController {
  @Get()
  @ApiOperation({
    summary: "Liveness check",
    description:
      "Returns 200 with a timestamp. Exposed at /health (not /api/health) so external uptime monitors can keep a stable URL. Opted out of rate limiting via @SkipThrottle().",
  })
  check() {
    return { status: "ok", timestamp: new Date() };
  }
}
