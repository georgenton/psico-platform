import { Injectable, Logger } from "@nestjs/common";
import type {
  PulsoReportListResponse,
  PulsoReportRow,
  PulsoReportSummary,
  PulsoReportReason,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";

/**
 * PulsoService — Sprint S42 (first slice of Pulso v2).
 *
 * Read-only admin surface over `EcoMessageReport`. The full Pulso design
 * (`docs/design/pulso/HANDOFF.md`) covers 6 views and 15 endpoints; we
 * deliberately ship the reports inbox first because (a) the data is
 * already accumulating with no surface to inspect it, and (b) it has the
 * simplest privacy story.
 *
 * Privacy contract:
 * - The USER message that triggered the report is `textCiphertext`. We
 *   NEVER decrypt nor expose it to admins.
 * - The ASSISTANT message (which is what the user reported) is plaintext
 *   from the LLM and is safe to surface.
 * - We expose `userId` and `messageId`/`threadId` for navigation, but no
 *   email/name/PII beyond that.
 */
@Injectable()
export class PulsoService {
  private readonly logger = new Logger(PulsoService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── GET /api/pulso/reports/eco/summary ──────────────────────────────

  /**
   * Counts of reports grouped by reason. Used by the admin shell to render
   * the chips at the top of the page. Always returns one row per reason
   * (zero-filled).
   */
  async getEcoReportSummary(): Promise<PulsoReportSummary> {
    const groups = await this.prisma.ecoMessageReport.groupBy({
      by: ["reason"],
      _count: { _all: true },
    });

    const total = groups.reduce((acc, g) => acc + g._count._all, 0);
    const byReason: Record<PulsoReportReason, number> = {
      HALLUCINATION: 0,
      OFF_TONE: 0,
      SENSITIVE_CONTENT: 0,
      CRISIS_MISHANDLED: 0,
      OTHER: 0,
    };
    for (const g of groups) {
      byReason[g.reason as PulsoReportReason] = g._count._all;
    }

    return { total, byReason };
  }

  // ── GET /api/pulso/reports/eco ──────────────────────────────────────

  async listEcoReports(params: {
    reason?: PulsoReportReason;
    limit?: number;
    cursor?: string;
  }): Promise<PulsoReportListResponse> {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

    const rows = await this.prisma.ecoMessageReport.findMany({
      where: params.reason ? { reason: params.reason } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit + 1, // peek one ahead to know if there's a next page
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        message: {
          select: {
            id: true,
            threadId: true,
            assistantText: true,
            kind: true,
            createdAt: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: PulsoReportRow[] = page.map((r) => ({
      id: r.id,
      reason: r.reason as PulsoReportReason,
      comment: r.comment,
      createdAt: r.createdAt,
      userId: r.userId,
      messageId: r.messageId,
      threadId: r.message.threadId,
      messageKind: r.message.kind as PulsoReportRow["messageKind"],
      // The assistant text IS plaintext (LLM output, not user content).
      // We trim aggressively to keep the table compact.
      assistantTextSnippet: snippet(r.message.assistantText, 240),
    }));

    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return { items, nextCursor, hasMore };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function snippet(text: string | null, max: number): string {
  if (!text) return "";
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
