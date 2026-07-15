import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ConfirmResonanceResponse,
  ResonanceListResponse,
  ResonanceSource,
  ResonanceSummary,
} from "@psico/types";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmotionalMapService } from "../emotional-map";
import type { ConfirmResonanceDto } from "./dto/confirm-resonance.dto";

/** Prisma enum ↔ wire (lowercase) mapping. */
const SOURCE_TO_WIRE: Record<string, ResonanceSource> = {
  HIGHLIGHT: "highlight",
  ECO: "eco",
  EXERCISE: "exercise",
};
const SOURCE_TO_DB = {
  highlight: "HIGHLIGHT",
  eco: "ECO",
  exercise: "EXERCISE",
} as const;

/**
 * ResonancesService — Fase E (V2, ARC cycle).
 *
 * Every row is an explicit user confirmation; nothing enters the map
 * silently. Confirm is idempotent per (user, conceptKey) — re-confirming
 * refreshes the timestamp/source instead of duplicating. Remove deletes the
 * row for real (V2: every insight can be eliminated). Both mutations bust
 * the emotional-map cache so the change shows right away.
 *
 * Privacy (ADR 0007): rows carry only catalog metadata (concept key/label,
 * book/chapter, source, timestamp) — never the highlighted text.
 */
@Injectable()
export class ResonancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emotionalMap: EmotionalMapService,
  ) {}

  async list(userId: string): Promise<ResonanceListResponse> {
    const rows = await this.prisma.resonance.findMany({
      where: { userId },
      orderBy: { confirmedAt: "desc" },
    });
    return { resonances: rows.map(toSummary) };
  }

  async confirm(
    userId: string,
    dto: ConfirmResonanceDto,
  ): Promise<ConfirmResonanceResponse> {
    const data = {
      conceptLabel: dto.conceptLabel,
      bookSlug: dto.bookSlug,
      chapterOrder: dto.chapterOrder,
      source: SOURCE_TO_DB[dto.source],
      confirmedAt: new Date(),
    };
    const row = await this.prisma.resonance.upsert({
      where: { userId_conceptKey: { userId, conceptKey: dto.conceptKey } },
      create: { userId, conceptKey: dto.conceptKey, ...data },
      update: data,
    });
    void this.emotionalMap.invalidateBestEffort(userId);
    return { ok: true, resonance: toSummary(row) };
  }

  /**
   * Fase H (ARC-P1) — toggle a resonance's "important to me right now" flag.
   * Distinct important themes are the Propósito source under V2. Ownership
   * enforced by scoping the update to the user; unknown/foreign id → 404.
   */
  async setImportant(
    userId: string,
    id: string,
    important: boolean,
  ): Promise<ConfirmResonanceResponse> {
    const res = await this.prisma.resonance.updateMany({
      where: { id, userId },
      data: { important },
    });
    if (res.count === 0) throw new NotFoundException("RESONANCE_NOT_FOUND");
    const row = await this.prisma.resonance.findUniqueOrThrow({
      where: { id },
    });
    void this.emotionalMap.invalidateBestEffort(userId);
    return { ok: true, resonance: toSummary(row) };
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    // deleteMany scoped by userId doubles as the ownership check: deleting
    // someone else's id simply matches zero rows.
    const res = await this.prisma.resonance.deleteMany({
      where: { id, userId },
    });
    if (res.count === 0) throw new NotFoundException("RESONANCE_NOT_FOUND");
    void this.emotionalMap.invalidateBestEffort(userId);
    return { ok: true };
  }
}

function toSummary(row: {
  id: string;
  conceptKey: string;
  conceptLabel: string;
  bookSlug: string;
  chapterOrder: number;
  source: string;
  confirmedAt: Date;
  important: boolean;
}): ResonanceSummary {
  return {
    id: row.id,
    conceptKey: row.conceptKey,
    conceptLabel: row.conceptLabel,
    bookSlug: row.bookSlug,
    chapterOrder: row.chapterOrder,
    source: SOURCE_TO_WIRE[row.source] ?? "highlight",
    confirmedAt: row.confirmedAt.toISOString(),
    important: row.important,
  };
}
