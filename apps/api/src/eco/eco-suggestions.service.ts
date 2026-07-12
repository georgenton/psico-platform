import { Injectable } from "@nestjs/common";
import type { EcoSuggestion, EcoSuggestionsResponse } from "@psico/types";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmotionalMapService } from "../emotional-map";
import {
  buildEcoSuggestions,
  type EcoSuggestionSignals,
} from "./eco-suggestions";

/**
 * EcoSuggestionService — gathers the categorical signals the rule-based
 * selector needs, then delegates to the pure `buildEcoSuggestions`.
 *
 * Privacy (ADR 0007): the queries select ONLY public content metadata
 * (book/chapter), timestamps, and counts. The Emotional-Map "momento" is the
 * user's own self-reported mood token. No diary/Eco ciphertext is ever read —
 * the `diaryEntry` query selects `createdAt` alone, never the body/excerpt.
 */
@Injectable()
export class EcoSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emotionalMap: EmotionalMapService,
  ) {}

  /** Openers for the standalone Eco screen (up to 3). */
  async getForUser(userId: string, limit = 3): Promise<EcoSuggestionsResponse> {
    const signals = await this.gatherSignals(userId);
    return { suggestions: buildEcoSuggestions(signals, limit) };
  }

  /** Top openers embedded into the Home Eco card (no separate request). */
  async topForHome(userId: string, limit = 2): Promise<EcoSuggestion[]> {
    const signals = await this.gatherSignals(userId);
    return buildEcoSuggestions(signals, limit);
  }

  private async gatherSignals(userId: string): Promise<EcoSuggestionSignals> {
    const now = new Date();
    const [reading, map, lastReflection, ecoCount] = await Promise.all([
      this.prisma.readingSession.findFirst({
        where: { userId },
        orderBy: { lastSeenAt: "desc" },
        select: {
          progressPct: true,
          completedAt: true,
          lastSeenAt: true,
          chapter: {
            select: {
              order: true,
              title: true,
              book: { select: { slug: true, title: true } },
            },
          },
        },
      }),
      // Cached (Redis) — HomeService already reads this, so it's near-free.
      this.emotionalMap.getForUser(userId),
      this.prisma.diaryEntry.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      this.prisma.ecoMessage.count({
        where: { kind: "USER", thread: { userId } },
      }),
    ]);

    const momento = map.momento ?? null;

    return {
      reading: reading
        ? {
            bookSlug: reading.chapter.book.slug,
            bookTitle: reading.chapter.book.title,
            chapterOrder: reading.chapter.order,
            chapterTitle: reading.chapter.title,
            progressPct: reading.progressPct,
            completedAt: reading.completedAt,
            lastActivityAt: reading.lastSeenAt,
          }
        : null,
      latestMood: momento
        ? { mood: momento.mood, at: new Date(momento.at) }
        : null,
      lastReflectionAt: lastReflection?.createdAt ?? null,
      hasEcoHistory: ecoCount > 0,
      now,
    };
  }
}
