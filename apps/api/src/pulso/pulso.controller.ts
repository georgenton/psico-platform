import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequiredRole, RolesGuard } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PulsoService } from "./pulso.service";
import { ListEcoReportsQueryDto } from "./dto/list-reports.dto";

/**
 * PulsoController — Sprint S42.
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
  @ApiOperation({ summary: "Counts of Eco message reports grouped by reason" })
  getSummary() {
    return this.pulso.getEcoReportSummary();
  }

  @Get("reports/eco")
  @ApiOperation({
    summary:
      "List Eco message reports, newest-first. Supports cursor pagination + reason filter.",
  })
  list(@Query() query: ListEcoReportsQueryDto) {
    return this.pulso.listEcoReports({
      reason: query.reason,
      limit: query.limit,
      cursor: query.cursor,
    });
  }
}
