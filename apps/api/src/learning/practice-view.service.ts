import { Injectable, NotFoundException } from "@nestjs/common";
import type { PracticePublicView } from "@psico/types";
import { PrismaService } from "../prisma";
import { parsePracticeCatalogContent } from "./practice-content";

/**
 * The public view of one catalog practice.
 *
 * A separate read service rather than a method on the command service, because
 * the two answer different questions and have different risks: commands write
 * LearningEvents and are throttled and idempotent; this only reads editorial
 * content that the chapter's own text already contains.
 *
 * What it deliberately does not do is invent a fallback. A practice whose row
 * is a `guided_reflection`, or whose content does not parse, is a 404 for this
 * endpoint — the Player already knows how to render copy and a button, and
 * telling it "there is an interaction here" when there is not would produce an
 * empty widget instead of the scene the reader should see.
 */
@Injectable()
export class PracticeViewService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicView(exerciseKey: string): Promise<PracticePublicView> {
    const row = await this.prisma.exercise.findUnique({
      where: { id: exerciseKey },
      select: { id: true, title: true, type: true, content: true },
    });
    if (!row || row.type !== "REFLECTION") {
      throw new NotFoundException({
        code: "PRACTICE_NOT_FOUND",
        message: "Esa práctica no existe.",
      });
    }
    const interaction = parsePracticeCatalogContent(row.content);
    if (!interaction) {
      throw new NotFoundException({
        code: "PRACTICE_HAS_NO_INTERACTION",
        message: "Esa práctica no declara una interacción.",
      });
    }
    return {
      exerciseKey: row.id,
      title: row.title,
      // The words are the same in all five by decision: the way out and the
      // confirmation are properties of how practices work here, not of any
      // one activity.
      skipLabel: "Prefiero saltarla",
      confirmLabel: "Ya hice la práctica",
      interaction,
    };
  }
}
