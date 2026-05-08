import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../content/guards/current-user.decorator";
import { PlanGuard } from "../content/guards/plan.guard";
import { RequiredPlan } from "../content/guards/required-plan.decorator";
import { RolesGuard } from "../content/guards/roles.guard";
import { RequiredRole } from "../content/guards/required-role.decorator";
<<<<<<< HEAD
import type { AIService } from "./ai.service";
import type { IngestService } from "./ingest.service";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AIService } from "./ai.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IngestService } from "./ingest.service";
>>>>>>> origin/main
import type { ChatRequestDto } from "./dto/chat-request.dto";

@Controller("ai")
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly ingestService: IngestService,
  ) {}

  @Post("chat")
  @RequiredPlan("PRO")
  async chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChatRequestDto,
  ) {
    const result = await this.aiService.chat(
      user.userId,
      dto.message,
      dto.conversationId,
    );
    return {
      reply: result.reply,
      conversationId: result.conversationId,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }

  @Get("conversations")
  @RequiredPlan("PRO")
  getConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.getConversations(user.userId);
  }

  @Get("conversations/:id/messages")
  @RequiredPlan("PRO")
  getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") conversationId: string,
  ) {
    return this.aiService.getMessages(user.userId, conversationId);
  }

  @Post("ingest/:bookId")
  @RequiredRole("ADMIN")
  ingestBook(@Param("bookId") bookId: string) {
    return this.ingestService.ingestBook(bookId);
  }
}
