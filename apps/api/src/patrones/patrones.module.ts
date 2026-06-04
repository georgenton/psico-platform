import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { AIModule } from "../ai";
import { PatronesController } from "./patrones.controller";
import { PatronesService } from "./patrones.service";

/**
 * PatronesModule — Sprint S10.
 *
 * Pro-gated diary analytics. Three endpoints:
 *   - GET  /api/patrones?period=30d|90d|1y
 *   - POST /api/patrones/weekly-summary/regenerate
 *   - POST /api/patrones/share-with-therapist (stub until S13)
 *
 * v1 aggregations live on plaintext metadata (`DiaryEntry.mood` +
 * `.createdAt`); the body cipher is never touched. Themes / vocab /
 * correlations are returned as empty arrays — those need client-side
 * NLP over the decrypted text and ship in a follow-up sprint.
 */
@Module({
  // Sprint S38: AIModule exposes AIService.generateWeeklyNarrative for the
  // LLM-backed `weekly-summary/regenerate` path. If AIService is unavailable
  // (e.g. ANTHROPIC_API_KEY unset in dev), the service falls back to the
  // rule-based composer.
  imports: [PrismaModule, AIModule],
  controllers: [PatronesController],
  providers: [PatronesService],
  exports: [PatronesService],
})
export class PatronesModule {}
