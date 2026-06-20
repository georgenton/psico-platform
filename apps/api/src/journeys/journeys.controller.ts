import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { JwtAuthGuard } from "../auth";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JourneysService } from "./journeys.service";

/**
 * JourneysController — Sprint B5.
 *
 * Single read endpoint for the curated Exploraciones catalog. Auth-required
 * because journeys are part of the dashboard surface; we don't want anonymous
 * browsing yet (the design treats Exploraciones as logged-in territory).
 */
@ApiTags("Journeys")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("journeys")
export class JourneysController {
  constructor(private readonly journeysService: JourneysService) {}

  @Get()
  list() {
    return this.journeysService.list();
  }
}
