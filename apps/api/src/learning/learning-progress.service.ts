import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  LearningProgressResponse,
  LearningUnitProgressItem,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ContentAccessService } from "../content-core/access/content-access.service";
import type { AuthenticatedUser } from "../auth";
import { readStoredPayload } from "./learning-event-semantics";
import { LearningEventStorageError } from "./learning-event.repository";
import { learningException } from "./learning-errors";

/**
 * CC-7.3 §10 — GET /api/learning/progress?bookSlug=…
 *
 * Progress is DERIVED exclusively from V1 LearningEvents (schemaVersion=1)
 * over the published revision's ordered units — never written to the legacy
 * `UserProgress` table, never read from non-V1 rows.
 *
 * Access: the SAME `ContentAccessService` surface that authorizes every
 * command. Each candidate unit runs through `assertCanReadUnit` — an
 * EXPECTED denial (Forbidden/NotFound) excludes the unit from the list AND
 * the counts; an UNEXPECTED dependency failure surfaces as the generic
 * sanitized 500, never as an editorial verdict.
 */
@Injectable()
export class LearningProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ContentAccessService,
  ) {}

  /**
   * `true` when the actor may read the unit; `false` on an EXPECTED denial.
   * Infrastructure failures (DB, adapter, programming errors) are NOT access
   * verdicts — they rethrow as the value-free storage error (generic 500).
   */
  private async canReadUnit(
    user: AuthenticatedUser,
    editionKey: string,
    unitKey: string,
  ): Promise<boolean> {
    try {
      await this.access.assertCanReadUnit({
        userId: user.userId,
        userPlan: user.plan,
        editionKey,
        unitKey,
      });
      return true;
    } catch (err) {
      if (
        err instanceof ForbiddenException ||
        err instanceof NotFoundException
      ) {
        return false;
      }
      throw new LearningEventStorageError();
    }
  }

  async getProgress(
    user: AuthenticatedUser,
    bookSlug: string,
  ): Promise<LearningProgressResponse> {
    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true, slug: true },
    });
    if (!book) {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }

    // Book-level gate — the same policy the manifest applies. Denials are
    // value-free; no shape of the book leaks past a 403. Infrastructure
    // failures are a sanitized 500, never an editorial verdict.
    try {
      await this.access.assertCanSeeBook({
        userId: user.userId,
        userPlan: user.plan,
        bookSlug: book.slug,
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw learningException("LEARNING_EVENT_FORBIDDEN");
      }
      if (err instanceof NotFoundException) {
        throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
      }
      throw new LearningEventStorageError();
    }

    const edition = await this.prisma.edition.findUnique({
      where: { slug: book.slug },
      select: { id: true, editionKey: true, publishedRevisionId: true },
    });
    if (!edition?.publishedRevisionId) {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }
    const revision = await this.prisma.revision.findUnique({
      where: { id: edition.publishedRevisionId },
      select: { id: true, number: true },
    });
    if (!revision) {
      throw learningException("LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT");
    }

    // Ordered units of the PUBLISHED revision only.
    const manifest = await this.prisma.revisionUnit.findMany({
      where: { revisionId: revision.id },
      orderBy: { order: "asc" },
      select: { unit: { select: { id: true, unitKey: true } } },
    });

    // Per-unit entitlement through the ONE access surface commands use.
    const visibility = await Promise.all(
      manifest.map((entry) =>
        this.canReadUnit(user, edition.editionKey, entry.unit.unitKey),
      ),
    );
    const accessible = manifest.filter((_, i) => visibility[i]);

    // V1 events ONLY (schemaVersion=1) for THIS user over the visible units.
    const unitIds = accessible.map((entry) => entry.unit.id);
    const events = unitIds.length
      ? await this.prisma.learningEvent.findMany({
          where: {
            userId: user.userId,
            schemaVersion: 1,
            kind: { in: ["UNIT_OPENED", "UNIT_COMPLETED"] },
            unitId: { in: unitIds },
          },
          orderBy: { createdAt: "asc" },
          select: { unitId: true, kind: true, createdAt: true, payload: true },
        })
      : [];

    const firstOpenedAt = new Map<string, Date>();
    const completedAt = new Map<string, Date>();
    const completedRevision = new Map<string, number>();
    for (const event of events) {
      const unitId = event.unitId as string;
      if (event.kind === "UNIT_OPENED") {
        // Multiple opens collapse: keep the first (events are time-ordered).
        if (!firstOpenedAt.has(unitId)) {
          firstOpenedAt.set(unitId, event.createdAt);
        }
      } else if (!completedAt.has(unitId)) {
        completedAt.set(unitId, event.createdAt);
        const payload = readStoredPayload("unit_completed", event.payload);
        if (payload) completedRevision.set(unitId, payload.revisionNumber);
      }
    }

    const units: LearningUnitProgressItem[] = accessible.map((entry) => {
      const unitId = entry.unit.id;
      const opened = firstOpenedAt.get(unitId) ?? null;
      const completed = completedAt.get(unitId) ?? null;
      return {
        unitKey: entry.unit.unitKey,
        // Completion dominates opened; opened requires at least one open.
        state: completed ? "completed" : opened ? "opened" : "not_started",
        openedAt: opened ? opened.toISOString() : null,
        completedAt: completed ? completed.toISOString() : null,
        completedRevisionNumber: completed
          ? (completedRevision.get(unitId) ?? null)
          : null,
      };
    });

    return {
      bookSlug: book.slug,
      editionKey: edition.editionKey,
      revisionNumber: revision.number,
      units,
      openedCount: units.filter((u) => u.state === "opened").length,
      completedCount: units.filter((u) => u.state === "completed").length,
      totalCount: units.length,
    };
  }
}
