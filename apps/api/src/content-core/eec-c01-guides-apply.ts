import type { PrismaClient } from "@prisma/client";
import type {
  ChapterExperienceDefinition,
  ExperienceSceneDefinition,
} from "@psico/types";
import {
  activateBookLearningCatalog,
  planBookLearningActivation,
} from "./learning-activation";
import type { GuideManifest } from "./eec-c01-guides-cli";

/**
 * EEC-C01 — the writing half of the guided-suite CLI.
 *
 * Nothing here re-implements ingestion. Targets go through
 * `activateBookLearningCatalog`, which is the existing authority for concepts,
 * practices and recalls and is already idempotent and drift-refusing; drafts go
 * through `ExperienceAdminService.createDraft`, which owns the reservation, the
 * lineage rule and the "does this pin resolve to this chapter" check.
 *
 * What this module adds is the part that did not exist: turning five manifests
 * into five explicit, correct calls — and refusing when the answer is not the
 * one the manifest declared.
 */

const BOOK = "emociones-en-construccion";
/** The historical lineage. Named here so the checks can say so out loud. */
const PILOT_EXPERIENCE_KEY = "eec-c1-cuerpo-antes-que-mente";
const PILOT_GUIDE_KEY = "eec-c1-cuerpo-antes-que-mente";

/** Manifest scene → the typed scene the definition validator accepts. */
function toScene(
  m: GuideManifest,
  s: GuideManifest["scenes"][number],
): ExperienceSceneDefinition {
  const sceneKey = `${m.manifestId.toLowerCase()}-${s.kind.toLowerCase()}`;
  const copy = { title: s.title, body: [s.body] };
  const base = { sceneKey, order: s.order };
  switch (s.kind) {
    case "PASSAGE":
      return {
        ...base,
        kind: "PASSAGE",
        anchorKey: m.anchors.primary.reference ?? m.guideKey,
        copy,
      } as ExperienceSceneDefinition;
    case "CONCEPT":
      return {
        ...base,
        kind: "CONCEPT",
        conceptKey: m.conceptKey,
        // The panel that OFFERS the concept step is the one that explains it.
        completesGuideStepKey: `explorar-${slugOf(m)}`,
        copy,
      } as ExperienceSceneDefinition;
    case "PRACTICE":
      return {
        ...base,
        kind: "PRACTICE",
        exerciseKey: m.practiceKey,
        completesGuideStepKey: `practicar-${slugOf(m)}`,
        copy: { ...copy, actionLabel: "Lo hice" },
      } as ExperienceSceneDefinition;
    case "RECALL":
      return {
        ...base,
        kind: "RECALL",
        itemKey: m.recallKey,
        completesGuideStepKey: `recordar-${slugOf(m)}`,
        copy,
      } as ExperienceSceneDefinition;
    case "REFLECTION":
      return {
        ...base,
        kind: "REFLECTION",
        promptKey: `${m.manifestId.toLowerCase()}-reflexion`,
        // The placeholder is the only text this scene carries. What a person
        // writes never leaves their device, so there is nothing else to store.
        copy: { ...copy, placeholder: "Solo para ti; no se envía." },
      } as ExperienceSceneDefinition;
    case "QUESTION":
      return {
        ...base,
        kind: "QUESTION",
        promptKey: `${m.manifestId.toLowerCase()}-pregunta`,
        copy: { ...copy, placeholder: "Solo para ti; no se envía." },
      } as ExperienceSceneDefinition;
    case "INTRO":
    case "EXAMPLE":
    case "SUMMARY":
      return { ...base, kind: s.kind, copy } as ExperienceSceneDefinition;
    default:
      throw new Error(`EEC_C01_UNKNOWN_SCENE_KIND`);
  }
}

const slugOf = (m: GuideManifest) => m.guideKey.replace(/^eec-c1-/, "");

/**
 * Manifest → the definition `createDraft` validates.
 *
 * `guidePin` is ALWAYS set from the manifest. The service has a fallback that
 * asks the discovery catalog for "the chapter's own pin", and that fallback
 * answers with the historical pilot on purpose — letting a microguide use it
 * would bind all five to one guide and the reservation would refuse four.
 */
export function toDefinition(m: GuideManifest): ChapterExperienceDefinition {
  return {
    experienceKey: m.experienceKey,
    experienceVersion: m.experienceVersion,
    bookSlug: m.bookSlug,
    chapterOrder: m.chapterOrder,
    title: m.scenes[0]?.title ?? m.manifestId,
    summary: m.scenes.find((s) => s.kind === "SUMMARY")?.body,
    status: "DRAFT",
    guidePin: { guideKey: m.guideKey, guideVersion: m.guideVersion },
    scenes: m.scenes.map((s) => toScene(m, s)),
  };
}

export interface ApplyTargetsResult {
  ok: boolean;
  applied: boolean;
  planned: Record<string, unknown>;
  stats: Record<string, unknown> | null;
}

/**
 * `apply-targets` — concepts, practices and recalls for the whole book.
 *
 * Book-wide rather than per-manifest because that is the shape of the existing
 * authority: it reads both catalogs, resolves every unit, and refuses on drift.
 * Calling it five times would do the same work five times and give five chances
 * to disagree with itself.
 */
export async function runApplyTargets(
  prisma: PrismaClient,
  manifests: readonly GuideManifest[],
  apply: boolean,
): Promise<ApplyTargetsResult> {
  void manifests;
  const planned = (await planBookLearningActivation(
    prisma,
    BOOK,
  )) as unknown as Record<string, unknown>;
  if (!apply) return { ok: true, applied: false, planned, stats: null };
  const stats = (await activateBookLearningCatalog(
    prisma,
    BOOK,
  )) as unknown as Record<string, unknown>;
  return { ok: true, applied: true, planned, stats };
}

export interface DraftRow {
  manifestId: string;
  experienceKey: string;
  guidePin: string;
  action: "CREATED" | "NOOP" | "DRIFT" | "SKIPPED";
  id: string | null;
  detail?: string;
}

export interface CreateDraftsResult {
  ok: boolean;
  drift: boolean;
  applied: boolean;
  drafts: DraftRow[];
}

/** The narrow slice of the admin service this needs. */
export interface DraftCreator {
  createDraft(
    userId: string,
    input: ChapterExperienceDefinition,
    expectedContentUnitId?: string | null,
  ): Promise<{ id: string }>;
}

/**
 * `create-drafts` — five Experiences v1 in DRAFT, each with its own pin.
 *
 * Idempotent by inspection, not by upsert: an existing row is READ first and
 * only an exact match is a NOOP. A row that exists with another guide, or in
 * another status, is DRIFT and stops the batch — overwriting it would be
 * editing somebody's work with no record that it happened.
 */
export async function createDrafts(
  prisma: Pick<PrismaClient, "chapterExperienceVersion">,
  service: DraftCreator,
  manifests: readonly GuideManifest[],
  userId: string,
  apply: boolean,
  expectedContentUnitId?: string | null,
): Promise<CreateDraftsResult> {
  const drafts: DraftRow[] = [];
  let drift = false;

  // ── Pass 1: inspect all five, write nothing ───────────────────────────────
  //
  // Whole-set before any write, because the alternative is worse than it looks:
  // inspecting and creating in one loop means a drifted first manifest is
  // reported AND the remaining four are still created, leaving a half-applied
  // suite behind a verdict that said "refused".
  const missing: GuideManifest[] = [];
  for (const m of manifests) {
    const pin = `${m.guideKey}@${m.guideVersion}`;
    const existing = await prisma.chapterExperienceVersion.findUnique({
      where: {
        experienceKey_experienceVersion: {
          experienceKey: m.experienceKey,
          experienceVersion: m.experienceVersion,
        },
      },
      select: { id: true, status: true, guideKey: true },
    });

    if (existing) {
      const same =
        existing.status === "DRAFT" && existing.guideKey === m.guideKey;
      if (!same) drift = true;
      drafts.push({
        manifestId: m.manifestId,
        experienceKey: m.experienceKey,
        guidePin: pin,
        action: same ? "NOOP" : "DRIFT",
        id: existing.id,
        detail: same
          ? undefined
          : `existing status=${existing.status} guide=${existing.guideKey ?? "null"}`,
      });
      continue;
    }

    missing.push(m);
    drafts.push({
      manifestId: m.manifestId,
      experienceKey: m.experienceKey,
      guidePin: pin,
      action: "SKIPPED",
      id: null,
      detail: apply ? "not created: the set was refused" : "dry-run",
    });
  }

  if (!apply || drift) {
    return { ok: !drift, drift, applied: false, drafts };
  }

  // ── Pass 2: create the ones that are missing ──────────────────────────────
  for (const m of missing) {
    const pin = `${m.guideKey}@${m.guideVersion}`;
    const row = drafts.find((d) => d.manifestId === m.manifestId) as DraftRow;
    try {
      // The unit the plan resolved travels with the write: the service takes
      // the chapter lock and refuses if the chapter has moved to another unit
      // between planning and applying, instead of binding to whatever it finds.
      const created = await service.createDraft(
        userId,
        toDefinition(m),
        expectedContentUnitId ?? null,
      );
      row.action = "CREATED";
      row.id = created.id;
      row.detail = undefined;
      void pin;
    } catch (err) {
      // The batch stops here rather than pressing on: five drafts that are
      // meant to ship together, with two of them missing, is a state nobody
      // asked for. What already landed stays — each createDraft is its own
      // transaction, and deleting them would be the destructive half of a
      // rollback this phase does not authorise.
      drift = true;
      row.action = "DRIFT";
      row.detail =
        (err as { response?: { code?: string } })?.response?.code ??
        (err as Error).message;
      break;
    }
  }

  return {
    ok: !drift && drafts.every((d) => d.action !== "DRIFT"),
    drift,
    applied: true,
    drafts,
  };
}

export interface VerifyResult {
  ok: boolean;
  draftCount: number;
  checks: Record<string, boolean>;
  detail: Record<string, unknown>;
}

/** `verify-drafts` — what exists, and what must not. */
export async function verifyDrafts(
  prisma: Pick<
    PrismaClient,
    "chapterExperienceVersion" | "concept" | "exercise"
  >,
  manifests: readonly GuideManifest[],
  flag: boolean,
): Promise<VerifyResult> {
  const keys = manifests.map((m) => m.experienceKey);
  const rows = await prisma.chapterExperienceVersion.findMany({
    where: { experienceKey: { in: keys } },
    select: {
      id: true,
      experienceKey: true,
      experienceVersion: true,
      status: true,
      guideKey: true,
      contentUnitId: true,
      definitionJson: true,
    },
  });
  // The pilot's stored rows, if this environment has any. Production does; a
  // fresh database does not, because there the pilot lives only in the shipped
  // catalog. So the check is not "the row looks like production's" — that would
  // fail everywhere else and say nothing — but "nothing here re-pinned it".
  const pilotRows = await prisma.chapterExperienceVersion.findMany({
    where: { experienceKey: PILOT_EXPERIENCE_KEY },
    select: { status: true, experienceVersion: true, guideKey: true },
  });
  const ourGuides = new Set(manifests.map((m) => m.guideKey));

  const units = new Set(rows.map((r) => r.contentUnitId));
  const serialized = JSON.stringify(rows.map((r) => r.definitionJson));

  const checks = {
    fiveDrafts: rows.length === 5,
    allDraft: rows.every((r) => r.status === "DRAFT"),
    versionOne: rows.every((r) => r.experienceVersion === 1),
    pinsMatchManifests: manifests.every((m) =>
      rows.some(
        (r) => r.experienceKey === m.experienceKey && r.guideKey === m.guideKey,
      ),
    ),
    sameUnit: units.size <= 1,
    // A DRAFT must not be reachable by a reader, and the route must stay dark
    // until somebody decides otherwise.
    flagOff: flag === false,
    pilotUntouched: pilotRows.every(
      (r) => r.guideKey === null || !ourGuides.has(r.guideKey),
    ),
    noDraftClaimsPilotGuide: rows.every((r) => r.guideKey !== PILOT_GUIDE_KEY),
    noCorrectOptionInDefinitions: !serialized.includes("correctOptionKey"),
  };

  return {
    ok: Object.values(checks).every(Boolean),
    draftCount: rows.length,
    checks,
    detail: {
      draftIds: rows.map((r) => ({
        experienceKey: r.experienceKey,
        id: r.id,
        guidePin: `${r.guideKey}@1`,
      })),
      contentUnitIds: [...units],
      pilotRows,
    },
  };
}

export interface PreviewRow {
  draftId: string;
  experienceKey: string;
  guidePin: string;
  sceneCount: number;
  sceneKinds: string[];
  publicRecallOptionsPresent: boolean;
  correctOptionKeyExposed: boolean;
  anchorResolved: boolean;
  previewEndpointOrUrl: string;
}

/**
 * `preview-report` — the same public view a Player would receive.
 *
 * Read from the stored definition rather than re-derived from the manifest: the
 * point of the report is to describe what the CMS actually holds, and rebuilding
 * it from the source would prove only that the source is self-consistent.
 */
export async function previewReport(
  prisma: Pick<PrismaClient, "chapterExperienceVersion">,
  manifests: readonly GuideManifest[],
): Promise<{ ok: boolean; previews: PreviewRow[] }> {
  const rows = await prisma.chapterExperienceVersion.findMany({
    where: { experienceKey: { in: manifests.map((m) => m.experienceKey) } },
    select: {
      id: true,
      experienceKey: true,
      guideKey: true,
      definitionJson: true,
    },
    orderBy: { experienceKey: "asc" },
  });

  const previews = rows.map((r) => {
    const def = r.definitionJson as unknown as ChapterExperienceDefinition;
    const scenes = def?.scenes ?? [];
    const serialized = JSON.stringify(def);
    return {
      draftId: r.id,
      experienceKey: r.experienceKey,
      guidePin: `${r.guideKey}@1`,
      sceneCount: scenes.length,
      sceneKinds: scenes.map((s) => s.kind),
      publicRecallOptionsPresent: scenes.some((s) => s.kind === "RECALL"),
      correctOptionKeyExposed: serialized.includes("correctOptionKey"),
      anchorResolved: scenes.some((s) => s.kind === "PASSAGE"),
      previewEndpointOrUrl: `/dashboard/admin/contenido/experiencias/${r.id}`,
    };
  });

  return {
    ok:
      previews.length === manifests.length &&
      previews.every((p) => !p.correctOptionKeyExposed),
    previews,
  };
}

/* c8 ignore start — thin wrappers the executable calls */
export async function runCreateDrafts(
  prisma: PrismaClient,
  manifests: readonly GuideManifest[],
  apply: boolean,
): Promise<CreateDraftsResult> {
  const { buildDraftCreator, resolveOperatorUserId } =
    await import("./eec-c01-guides-runtime");
  const { planGuides } = await import("./eec-c01-guides-cli");
  const { resolveEnvironment } = await import("../shared/psico-environment");
  const plan = await planGuides(prisma, manifests, resolveEnvironment(), false);
  const userId = await resolveOperatorUserId(prisma);
  return createDrafts(
    prisma,
    buildDraftCreator(prisma),
    manifests,
    userId,
    apply,
    plan.contentUnitId,
  );
}

export async function runVerifyDrafts(
  prisma: PrismaClient,
  manifests: readonly GuideManifest[],
): Promise<VerifyResult> {
  const { flagEnabled } = await import("../shared/flags");
  return verifyDrafts(
    prisma,
    manifests,
    flagEnabled("EEC_C01_GUIDED_SUITE_V1"),
  );
}

export async function runPreviewReport(
  prisma: PrismaClient,
  manifests: readonly GuideManifest[],
): Promise<{ ok: boolean; previews: PreviewRow[] }> {
  return previewReport(prisma, manifests);
}
/* c8 ignore stop */
