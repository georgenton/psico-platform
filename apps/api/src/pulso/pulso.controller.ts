import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser, RequiredRole, RolesGuard } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PulsoService } from "./pulso.service";
import {
  ListEcoReportsQueryDto,
  MarkResolvedDto,
} from "./dto/list-reports.dto";

/**
 * PulsoController — Sprint S42 (reports inbox) + S48 (overview) + S49 (resolution).
 *
 * Admin-only surface (RolesGuard + @RequiredRole("ADMIN")). PSYCHOLOGIST
 * is NOT enough — Pulso is operational back-office, not clinical access.
 */
@ApiTags("Pulso")
@Controller("pulso")
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiredRole("ADMIN")
export class PulsoController {
  constructor(private readonly pulso: PulsoService) {}

  @Get("reports/eco/summary")
  @ApiOperation({
    summary:
      "Counts of Eco message reports grouped by reason. Default scope: open reports only.",
  })
  getSummary(@Query("status") status?: "open" | "resolved" | "all") {
    return this.pulso.getEcoReportSummary(status ?? "open");
  }

  @Get("reports/eco")
  @ApiOperation({
    summary:
      "List Eco message reports, newest-first. Supports cursor pagination, reason filter, and status (open|resolved|all).",
  })
  list(@Query() query: ListEcoReportsQueryDto) {
    return this.pulso.listEcoReports({
      reason: query.reason,
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  // Sprint S49 — resolution flow ─────────────────────────────────────

  @Post("reports/eco/:id/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Mark an Eco report as triaged. Idempotent: re-resolving overwrites the timestamp and admin/note.",
  })
  resolve(
    @CurrentUser() admin: { sub: string },
    @Param("id") id: string,
    @Body() body: MarkResolvedDto,
  ) {
    return this.pulso.markResolved(id, admin.sub, body.note ?? null);
  }

  @Post("reports/eco/:id/unresolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reopen a previously-resolved report. Clears resolvedAt/By/Note.",
  })
  unresolve(@Param("id") id: string) {
    return this.pulso.markUnresolved(id);
  }

  // ── Sprint S48 — overview KPIs ──────────────────────────────────────

  @Get("overview")
  @ApiOperation({
    summary:
      "Platform overview — KPIs aggregated across users, engagement, content, and business. Cached 5min.",
  })
  getOverview() {
    return this.pulso.getOverview();
  }

  // ── Sprint S51 — cohort retention triangle ──────────────────────────

  @Get("cohorts")
  @ApiOperation({
    summary:
      "Cohort retention triangle. Materialised by the Monday 03:00 UTC cron; cached 5min.",
  })
  getCohorts() {
    return this.pulso.getCohortRetention();
  }
}
