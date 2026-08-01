import { Injectable } from "@nestjs/common";
import type { GuideDiscoveryResponse } from "@psico/types";
import type { AuthenticatedUser } from "../auth";
import { PrismaService } from "../prisma";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { productionGuideRegistry } from "./guide-catalog";
import { productionGuideDiscoveryCatalog } from "./guide-discovery-catalog";
import { GuideRolloutService } from "./guide-rollout.service";
import { GuideTargetContextService } from "./guide-target-context.service";

/**
 * GR-4 — "standing in this chapter, is there a guided reading for me?"
 *
 * READ-ONLY by construction. It creates no session, no step, no receipt, no
 * learning event, no resonance: asking whether something is offered must not
 * be the act that starts it.
 *
 * The negative answer is deliberately OPAQUE. Rollout off, actor outside the
 * pilot, no catalog entry, missing targets, a chapter whose unit disagrees with
 * the targets, or a plan that cannot read the unit — all collapse to the same
 * `{available:false}`. Distinguishing them would turn this endpoint into an
 * oracle: a reader could enumerate which books have guides, or learn they are
 * outside a pilot, from a surface whose only job is to render a button.
 *
 * Infrastructure failures are NOT swallowed into that false. A database that is
 * down is not "no guide here"; it propagates as a sanitized error so the client
 * can retry instead of caching a wrong negative.
 */
@Injectable()
export class GuideDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rollout: GuideRolloutService,
    private readonly targetContext: GuideTargetContextService,
    private readonly access: ContentAccessService,
  ) {}

  async discover(
    user: AuthenticatedUser,
    input: { bookSlug: string; chapterOrder: number },
  ): Promise<GuideDiscoveryResponse> {
    // 5.1 — rollout first. A user outside the pilot learns nothing about the
    // catalog, so no read happens at all after this point.
    if (!this.rollout.isAvailable(user.userId)) return { available: false };

    // 5.2 — exact context → pin. Never `latestStartableVersion`.
    const pin = productionGuideDiscoveryCatalog.getExactContext(
      input.bookSlug,
      input.chapterOrder,
    );
    if (!pin) return { available: false };

    // 5.3 — the definition must exist. A discovery entry pointing at nothing
    // is a catalog contradiction, and the catalog refuses to load with one, so
    // reaching here means the registry genuinely has it.
    const definition = productionGuideRegistry.getExact(
      pin.guideKey,
      pin.guideVersion,
    );

    // 5.4 — every dependent read under ONE snapshot, so the answer describes a
    // single consistent moment rather than a stitched-together one.
    return this.prisma.$transaction(async (tx) => {
      let resolved;
      try {
        resolved = await this.targetContext.resolve(definition, tx);
      } catch {
        // Targets absent or divergent — opaque to the caller.
        return { available: false };
      }

      // The guide's own editorial context must be the book that was asked
      // about. A pin whose targets live in another book is a catalog bug, not
      // an offer.
      if (resolved.bookSlug !== input.bookSlug) return { available: false };

      const book = await tx.book.findUnique({
        where: { slug: input.bookSlug },
        select: { id: true },
      });
      if (!book) return { available: false };

      const chapter = await tx.chapter.findFirst({
        where: { bookId: book.id, order: input.chapterOrder },
        select: { id: true },
      });
      if (!chapter) return { available: false };

      // The chapter the reader is standing in must be the SAME unit the
      // targets anchor to. Without this, a guide could be offered from a
      // chapter it does not belong to.
      const unit = await tx.contentUnit.findUnique({
        where: {
          editionId_unitKey: {
            editionId: resolved.editionId,
            unitKey: unitKeyFromLegacyChapterId(chapter.id),
          },
        },
        select: { id: true },
      });
      if (!unit || unit.id !== resolved.unitId) return { available: false };

      // …and that unit must be in the revision readers actually see.
      const inRevision = await tx.revisionUnit.findUnique({
        where: {
          revisionId_unitId: {
            revisionId: resolved.revisionId,
            unitId: unit.id,
          },
        },
        select: { id: true },
      });
      if (!inRevision) return { available: false };

      // Entitlement last, through the ONE policy the reader itself uses.
      try {
        await this.access.assertCanReadUnit(
          {
            userId: user.userId,
            userPlan: user.plan,
            editionKey: resolved.editionKey,
            unitKey: resolved.unitKey,
          },
          tx,
        );
      } catch {
        return { available: false };
      }

      return {
        available: true,
        guideKey: pin.guideKey,
        guideVersion: pin.guideVersion,
      };
    });
  }
}
