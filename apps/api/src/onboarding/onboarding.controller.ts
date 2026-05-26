import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { OnboardingService } from "./onboarding.service";
import type { OnboardingStep1Dto } from "./dto/step1.dto";
import type { OnboardingStep2Dto } from "./dto/step2.dto";
import type { OnboardingStep3Dto } from "./dto/step3.dto";
import type { OnboardingCompleteDto } from "./dto/complete.dto";
import type { OnboardingTourCompleteDto } from "./dto/tour-complete.dto";

@ApiTags("Onboarding")
@ApiBearerAuth("bearer")
@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("intro")
  @ApiOperation({ summary: "Step 0 · Marina's intro copy" })
  getIntro() {
    return this.onboarding.getIntro();
  }

  @Post("skip")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Skip onboarding entirely; mark state as skipped" })
  skip(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.skip(user.userId);
  }

  @Get("motivos")
  @ApiOperation({ summary: "Step 1 · Catalog of motivos (reasons to be here)" })
  getMotivos() {
    return this.onboarding.getMotivos();
  }

  @Post("step1")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Step 1 · Save chosen motivos" })
  step1(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardingStep1Dto,
  ) {
    return this.onboarding.saveStep1(user.userId, dto);
  }

  @Get("moods")
  @ApiOperation({ summary: "Step 2 · Catalog of moods" })
  getMoods() {
    return this.onboarding.getMoods();
  }

  @Post("step2")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Step 2 · Save initial mood (also sets User.mood)" })
  step2(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardingStep2Dto,
  ) {
    return this.onboarding.saveStep2(user.userId, dto);
  }

  @Post("step3")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Step 3 · Save firstName + voicePreference",
    description:
      "Writes firstName to User and voicePreference to UserPreferences. " +
      "OnboardingState captures an immutable audit of the original picks.",
  })
  step3(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardingStep3Dto,
  ) {
    return this.onboarding.saveStep3(user.userId, dto);
  }

  @Get("recommendation")
  @ApiOperation({
    summary: "Step 4 · Book recommendation based on chosen motivos",
  })
  recommendation(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.getRecommendation(user.userId);
  }

  @Post("complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Mark onboarding complete; record chosen book (if any)",
  })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardingCompleteDto,
  ) {
    return this.onboarding.complete(user.userId, dto);
  }

  @Get("tour")
  @ApiOperation({ summary: "UI tour steps (post-onboarding overlay)" })
  getTour() {
    return this.onboarding.getTour();
  }

  @Post("tour/complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark UI tour as completed" })
  completeTour(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardingTourCompleteDto,
  ) {
    return this.onboarding.completeTour(user.userId, dto);
  }
}
