import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { GuideDiscoveryResponse } from "@psico/types";
import type { AuthenticatedUser } from "../auth";
import { PrismaService } from "../prisma";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { productionGuideRegistry } from "./guide-catalog";
import { productionGuideDiscoveryCatalog } from "./guide-discovery-catalog";
import { GuideLifecycleError } from "./guide-errors";
import { GuideRolloutService } from "./guide-rollout.service";
import { GuideTargetContextService } from "./guide-target-context.service";
import { GuideReaderApplicabilityService } from "./guide-reader-applicability.service";

/**
 * The EDITORIAL verdicts of the context resolver: the catalog looked and
 * answered "no". Everything else it can raise — `GUIDE_STORAGE_FAILURE`, a
 * driver error, a bug — is INFRASTRUCTURE and must never be dressed up as
 * "there is no guide here".
 */
const EDITORIAL_CONTEXT_CODES = new Set([
  "GUIDE_CONTEXT_UNRESOLVED",
  "GUIDE_CONTEXT_MISMATCH",
]);

/** Did the catalog decide, or did the infrastructure fail to answer? */
function isEditorialContextVerdict(err: unknown): boolean {
  return (
    err instanceof GuideLifecycleError && EDITORIAL_CONTEXT_CODES.has(err.code)
  );
}

/**
 * The two negative verdicts the content-access policy expresses: the plan does
 * not entitle this unit (403) or the edition/unit is not there (404). A
 * `BadRequestException`, a Prisma error or a plain `Error` is NOT a denial —
 * it is a failure to decide, and it propagates.
 */
function isAccessDenial(err: unknown): boolean {
  return err instanceof ForbiddenException || err instanceof NotFoundException;
}

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
    /** C.3R — the ONE place a reader's unit is resolved for a verdict. */
    private readonly applicability: GuideReaderApplicabilityService,
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
      } catch (err) {
        // Targets absent or divergent — an editorial verdict, opaque to the
        // caller. A storage failure is NOT that: the catalog never got to
        // answer, so saying "no guide here" would be a claim we cannot make.
        if (isEditorialContextVerdict(err)) return { available: false };
        throw err;
      }

      // The guide's own editorial context must be the book that was asked
      // about. A pin whose targets live in another book is a catalog bug, not
      // an offer.
      if (resolved.bookSlug !== input.bookSlug) return { available: false };

      // C.3R — the reader's unit is located the way the CONTENT is located:
      // the published manifest, by `(bookSlug, order)`.
      //
      // This used to go through the LEGACY table — `Chapter` by `(bookId,
      // order)`, then `uuidv5(chapter.id)` — which is a second, parallel notion
      // of "the chapter at position N". `content-read.ts` serves the unit from
      // `RevisionUnit` on the edition's published revision, and a verdict about
      // a different unit than the one whose text is on screen is a verdict
      // about the wrong thing. Position still LOCATES here, as it does in the
      // URL; it decides nothing.
      //
      // One query replaces three, and membership of the published revision is
      // part of the same lookup rather than a separate confirmation.
      const readerUnit = await this.applicability.resolveUnitByNavigation(tx, {
        bookSlug: input.bookSlug,
        chapterOrder: input.chapterOrder,
      });
      if (readerUnit === null) return { available: false };

      // The unit the reader is standing in must BE the unit the targets anchor
      // to. Identity, compared server-side — the whole point of C.3R.
      if (readerUnit !== resolved.unitId) return { available: false };

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
      } catch (err) {
        // A denial (403) and a missing edition/unit (404) are decisions. A
        // driver error is not — it propagates rather than becoming a "no".
        if (isAccessDenial(err)) return { available: false };
        throw err;
      }

      return {
        available: true,
        guideKey: pin.guideKey,
        guideVersion: pin.guideVersion,
      };
    });
  }
}
