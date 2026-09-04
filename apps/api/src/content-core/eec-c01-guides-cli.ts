import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { productionGuideRegistry } from "../guide/guide-catalog";
import {
  PRODUCTION_LEGACY_GUIDE_PINS,
  productionGuideDiscoveryCatalog,
} from "../guide/guide-discovery-catalog";
import { guideAnchorRegistry } from "@psico/types";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";
import { guidedChapterConcepts } from "@psico/types";

/**
 * EEC-C01 — the reproducible bridge from manifests to five DRAFT experiences.
 *
 *   validate        no database at all: schema, checksums, keys, scenes
 *   plan            read-only: resolves the real edition/revision/unit and says
 *                   what each step WOULD do (CREATE · VERIFY · NOOP · DRIFT)
 *   apply-targets   materialises concepts, practices and recalls (idempotent)
 *   create-drafts   five Experiences v1 in DRAFT, each with an EXPLICIT pin
 *   verify-drafts   what actually exists, including what must NOT
 *   preview-report  the public view a Player would get, as JSON evidence
 *
 * ── Two rules that shape everything below ──────────────────────────────────
 *
 * Dry-run is the default and `--apply` is a word somebody has to type. And
 * every draft sends its OWN `guidePin`: the legacy `getExactContext` fallback
 * answers with the historical pilot on purpose (the materialized V1 binary
 * depends on it), so letting a new draft fall back would bind all five to the
 * pilot's guide and the reservation would refuse them one by one.
 *
 * stdout carries identifiers and counts. Never chapter prose, never a free-text
 * answer, never a `correctOptionKey`.
 */

export const CLI_ERRORS = {
  manifestInvalid: "EEC_C01_MANIFEST_INVALID",
  checksumMismatch: "EEC_C01_MANIFEST_CHECKSUM_MISMATCH",
  canonicalMismatch: "EEC_C01_CANONICAL_SHA_MISMATCH",
  unknownGuide: "EEC_C01_GUIDE_NOT_REGISTERED",
  anchorMissing: "EEC_C01_ANCHOR_NOT_REGISTERED",
  pilotReferenced: "EEC_C01_PILOT_REFERENCED",
  publishNotAllowed: "EEC_C01_PUBLISH_NOT_ALLOWED",
} as const;

export class EecGuidesCliError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "EecGuidesCliError";
  }
}

export interface GuideManifest {
  schemaVersion: string;
  manifestId: string;
  bookSlug: string;
  editionKey: string;
  chapterOrder: number;
  unitKey: string;
  canonicalSha256: string;
  experienceKey: string;
  experienceVersion: number;
  guideKey: string;
  guideVersion: number;
  conceptKey: string;
  practiceKey: string;
  recallKey: string;
  anchors: {
    primary: {
      reference?: string;
      heading: string;
      fingerprint: string;
      expectedMatchCount: 1;
    };
    secondary?: { reference?: string; heading: string; fingerprint: string };
  };
  practiceKind: string;
  scenes: {
    order: number;
    kind: string;
    title: string;
    /** One entry per paragraph. The approved copy is not always one. */
    body: string[];
    note?: string;
    actionLabel?: string;
    anchorRef?: string;
    stepKey?: string;
    practiceKind?: string;
    optional?: boolean;
  }[];
  guideSteps: {
    order: number;
    kind: string;
    stepKey: string;
    targetKey: string;
  }[];
  privacyPolicy: Record<string, boolean>;
  status: string;
  publishAllowed: boolean;
  idempotencyKey: string;
  manifestSha256: string;
}

const PILOT_KEY = "eec-c1-cuerpo-antes-que-mente";
const REQUIRED_STEP_KINDS = [
  "CONCEPT_EXPLORATION",
  "CATALOG_PRACTICE",
  "ACTIVE_RECALL",
];

const sha256 = (s: string) =>
  createHash("sha256").update(s, "utf8").digest("hex");

/** Load the five manifests, in route order. */
export function loadManifests(dir: string): GuideManifest[] {
  const names = readdirSync(dir)
    .filter((n) => /^mg0[1-5]\.manifest\.json$/.test(n))
    .sort();
  if (names.length !== 5) {
    throw new EecGuidesCliError(
      CLI_ERRORS.manifestInvalid,
      `expected 5 manifests, found ${names.length}`,
    );
  }
  return names.map(
    (n) => JSON.parse(readFileSync(join(dir, n), "utf8")) as GuideManifest,
  );
}

export interface ValidationIssue {
  manifestId: string;
  code: string;
  detail: string;
}

/**
 * `validate` — everything checkable without a database.
 *
 * Returns issues rather than throwing on the first one: an operator fixing a
 * manifest wants the whole list, not a guided tour of one problem at a time.
 */
export function validateManifests(
  manifests: readonly GuideManifest[],
  canonicalSha: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (m: GuideManifest, code: string, detail: string) =>
    issues.push({ manifestId: m.manifestId, code, detail });

  // One namespace per field. A microguide's experience and its guide share a
  // key on purpose — the pilot does too — so collapsing them into one set would
  // read every manifest as a duplicate of itself.
  const seen: Record<string, Set<string>> = {
    experienceKey: new Set(),
    guideKey: new Set(),
    conceptKey: new Set(),
    practiceKey: new Set(),
    recallKey: new Set(),
    idempotencyKey: new Set(),
  };
  for (const m of manifests) {
    // The checksum covers the manifest without itself.
    const { manifestSha256, ...rest } = m as GuideManifest &
      Record<string, unknown>;
    const recomputed = sha256(JSON.stringify(rest, null, 2));
    if (recomputed !== manifestSha256) {
      add(
        m,
        CLI_ERRORS.checksumMismatch,
        "manifest edited without regenerating",
      );
    }
    if (m.canonicalSha256 !== canonicalSha) {
      add(
        m,
        CLI_ERRORS.canonicalMismatch,
        "declared source is not the chapter",
      );
    }
    if (m.status !== "DRAFT")
      add(m, CLI_ERRORS.manifestInvalid, "status must be DRAFT");
    if (m.publishAllowed !== false) {
      add(m, CLI_ERRORS.publishNotAllowed, "publishAllowed must be false");
    }
    if (m.experienceVersion !== 1 || m.guideVersion !== 1) {
      add(m, CLI_ERRORS.manifestInvalid, "versions must start at 1");
    }

    // Never a clone of, or a reference to, the historical lineage.
    const serialized = JSON.stringify(m);
    if (serialized.includes(PILOT_KEY)) {
      add(m, CLI_ERRORS.pilotReferenced, "references the historical pilot");
    }

    for (const field of Object.keys(seen)) {
      const value = m[field as keyof GuideManifest] as string;
      if (seen[field].has(value)) {
        add(m, CLI_ERRORS.manifestInvalid, `duplicate ${field} ${value}`);
      }
      seen[field].add(value);
    }

    // The guide must actually be registered, or the draft cannot be bound.
    try {
      productionGuideRegistry.getExact(m.guideKey, m.guideVersion);
    } catch {
      add(m, CLI_ERRORS.unknownGuide, m.guideKey);
    }
    if (
      !guideAnchorRegistry.getExact({
        guideKey: m.guideKey,
        guideVersion: m.guideVersion,
      })
    ) {
      add(m, CLI_ERRORS.anchorMissing, m.guideKey);
    }

    // Three obligatory steps, in order, pointing at the declared targets.
    if (m.guideSteps.length !== 3) {
      add(m, CLI_ERRORS.manifestInvalid, "a guide has exactly three steps");
    } else {
      m.guideSteps.forEach((s, i) => {
        if (s.kind !== REQUIRED_STEP_KINDS[i] || s.order !== i + 1) {
          add(m, CLI_ERRORS.manifestInvalid, `step ${i + 1} out of contract`);
        }
      });
      const targets = m.guideSteps.map((s) => s.targetKey);
      if (targets[0] !== m.conceptKey) {
        add(m, CLI_ERRORS.manifestInvalid, "step 1 must target the concept");
      }
      if (targets[2] !== m.recallKey) {
        add(m, CLI_ERRORS.manifestInvalid, "step 3 must target the recall");
      }
    }

    // Scenes: contiguous, opening on INTRO, closing on SUMMARY, and every
    // obligatory step bound to a scene that runs it.
    const orders = m.scenes.map((s) => s.order);
    if (orders.some((o, i) => o !== i + 1)) {
      add(m, CLI_ERRORS.manifestInvalid, "scene order is not contiguous");
    }
    if (m.scenes[0]?.kind !== "INTRO") {
      add(m, CLI_ERRORS.manifestInvalid, "scenes must open on INTRO");
    }
    if (m.scenes[m.scenes.length - 1]?.kind !== "SUMMARY") {
      add(m, CLI_ERRORS.manifestInvalid, "scenes must close on SUMMARY");
    }
    for (const kind of ["PASSAGE", "CONCEPT", "PRACTICE", "RECALL"]) {
      if (!m.scenes.some((s) => s.kind === kind)) {
        add(m, CLI_ERRORS.manifestInvalid, `missing a ${kind} scene`);
      }
    }
    // No media anywhere: this suite ships without assets by decision.
    if (/"(AUDIO|VIDEO)"/.test(serialized)) {
      add(
        m,
        CLI_ERRORS.manifestInvalid,
        "declares media this suite has none of",
      );
    }
    // A correct answer must never be in an artifact a client could read.
    if (serialized.includes("correctOptionKey")) {
      add(m, CLI_ERRORS.manifestInvalid, "carries a grading datum");
    }
    for (const [k, v] of Object.entries(m.privacyPolicy)) {
      if (v !== false)
        add(m, CLI_ERRORS.manifestInvalid, `privacy ${k} must be false`);
    }
  }

  // The chapter these manifests describe, READ from them rather than assumed.
  // The same five checks serve any EEC chapter; hardcoding chapter 1 here made
  // C02's manifests fail against C01's route, which is a fact about this
  // function and not about the manifests.
  const bookSlug = manifests[0]?.bookSlug ?? "";
  const chapterOrder = manifests[0]?.chapterOrder ?? 0;
  const suiteId = `${manifests[0]?.manifestId.split("-").slice(0, 2).join("-") ?? "EEC"}-SUITE`;
  if (manifests.some((m) => m.bookSlug !== bookSlug)) {
    issues.push({
      manifestId: suiteId,
      code: CLI_ERRORS.manifestInvalid,
      detail: "the set spans more than one book",
    });
  }
  if (manifests.some((m) => m.chapterOrder !== chapterOrder)) {
    issues.push({
      manifestId: suiteId,
      code: CLI_ERRORS.manifestInvalid,
      detail: "the set spans more than one chapter",
    });
  }

  // The route the discovery catalog offers must be exactly these five, in this
  // order — otherwise the manifests describe a chapter nobody is served. An
  // empty route is normal for a chapter that is not offered yet: C02 ships as
  // DRAFT and joins the catalog when it is published, not before.
  const routeKeys = productionGuideDiscoveryCatalog
    .listContext(bookSlug, chapterOrder)
    .map((i) => i.pin.guideKey);
  const manifestKeys = manifests.map((m) => m.guideKey);
  if (routeKeys.length > 0 && routeKeys.join(",") !== manifestKeys.join(",")) {
    issues.push({
      manifestId: suiteId,
      code: CLI_ERRORS.manifestInvalid,
      detail: "manifest order does not match the discovery route",
    });
  }

  // The legacy adapter must still answer with the pilot. If a manifest ever
  // made it into that map, the old binary would start binding a microguide.
  // Only chapter 1 has that adapter, and only chapter 1 can break it.
  if (bookSlug === "emociones-en-construccion" && chapterOrder === 1) {
    const legacy = PRODUCTION_LEGACY_GUIDE_PINS.find(
      (l) => l.bookSlug === bookSlug && l.chapterOrder === 1,
    );
    if (legacy?.pin.guideKey !== PILOT_KEY) {
      issues.push({
        manifestId: suiteId,
        code: CLI_ERRORS.pilotReferenced,
        detail: "the V1 adapter no longer answers with the historical pilot",
      });
    }
  }
  return issues;
}

// ── plan ────────────────────────────────────────────────────────────────────

export type PlanAction = "CREATE" | "VERIFY" | "NOOP" | "DRIFT";

export interface TargetPlanRow {
  kind: "concept" | "practice" | "recall";
  key: string;
  action: PlanAction;
}

export interface DraftPlanRow {
  manifestId: string;
  experienceKey: string;
  guidePin: string;
  action: PlanAction;
  existingId: string | null;
  existingStatus: string | null;
}

export interface GuidesPlan {
  environment: string;
  editionId: string;
  publishedRevisionNumber: number;
  contentUnitId: string;
  unitKeyMatches: boolean;
  anchors: {
    guideKey: string;
    headingMatches: number;
    fingerprintMatches: number;
  }[];
  targets: TargetPlanRow[];
  drafts: DraftPlanRow[];
  flagEnabled: boolean;
}

type PlanDb = Pick<
  PrismaClient,
  | "edition"
  | "revision"
  | "revisionUnit"
  | "contentUnit"
  | "blockVersion"
  | "concept"
  | "exercise"
  | "chapterExperienceVersion"
>;

/**
 * `plan` — read-only. Resolves the REAL ids in the target environment and says
 * what each step would do, without doing any of it.
 */
export async function planGuides(
  db: PlanDb,
  manifests: readonly GuideManifest[],
  environment: string,
  flag: boolean,
): Promise<GuidesPlan> {
  const edition = await db.edition.findUnique({
    where: { editionKey: manifests[0].editionKey },
    select: { id: true, publishedRevisionId: true },
  });
  if (!edition?.publishedRevisionId) {
    throw new EecGuidesCliError(
      CLI_ERRORS.manifestInvalid,
      "edition not published",
    );
  }
  const revision = await db.revision.findUnique({
    where: { id: edition.publishedRevisionId },
    select: { number: true },
  });
  // The declared unit first. A unit key is derived from the legacy chapter's
  // id, so it is production's — a test or local database builds the same
  // chapter under a different id and gets a different key. Falling back to the
  // unit PLACED at this chapter's order keeps the CLI usable off production;
  // `unitKeyMatches` carries the difference so the caller can refuse where it
  // matters, which `main.ts` does on production and staging.
  const declared = await db.contentUnit.findFirst({
    where: { editionId: edition.id, unitKey: manifests[0].unitKey },
    select: { id: true },
  });
  const placed = declared
    ? null
    : await db.revisionUnit.findFirst({
        where: {
          revisionId: edition.publishedRevisionId,
          order: manifests[0].chapterOrder,
        },
        select: { unitId: true },
      });
  const unitId = declared?.id ?? placed?.unitId ?? null;
  if (!unitId) {
    throw new EecGuidesCliError(
      CLI_ERRORS.manifestInvalid,
      "unit not in edition",
    );
  }
  const unit = { id: unitId };

  // Anchors, resolved against the blocks the reader is actually served.
  const anchors: GuidesPlan["anchors"] = [];
  for (const m of manifests) {
    const headings = await db.blockVersion.count({
      where: {
        kind: "HEADING",
        content: m.anchors.primary.heading,
        contentBlock: { unitId: unit.id },
      },
    });
    const fingerprints = await db.blockVersion.count({
      where: {
        content: { contains: m.anchors.primary.fingerprint },
        contentBlock: { unitId: unit.id },
      },
    });
    anchors.push({
      guideKey: m.guideKey,
      headingMatches: headings,
      fingerprintMatches: fingerprints,
    });
  }

  const targets: TargetPlanRow[] = [];
  for (const m of manifests) {
    const concept = await db.concept.findUnique({
      where: { conceptKey: m.conceptKey },
      select: { id: true },
    });
    targets.push({
      kind: "concept",
      key: m.conceptKey,
      action: concept ? "VERIFY" : "CREATE",
    });
    for (const [kind, key] of [
      ["practice", m.practiceKey],
      ["recall", m.recallKey],
    ] as const) {
      const row = await db.exercise.findUnique({
        where: { id: key },
        select: { id: true },
      });
      targets.push({ kind, key, action: row ? "VERIFY" : "CREATE" });
    }
  }

  const drafts: DraftPlanRow[] = [];
  for (const m of manifests) {
    const existing = await db.chapterExperienceVersion.findUnique({
      where: {
        experienceKey_experienceVersion: {
          experienceKey: m.experienceKey,
          experienceVersion: m.experienceVersion,
        },
      },
      select: { id: true, status: true, guideKey: true },
    });
    const pin = `${m.guideKey}@${m.guideVersion}`;
    let action: PlanAction = "CREATE";
    if (existing) {
      action =
        existing.status !== "DRAFT"
          ? "DRIFT"
          : existing.guideKey === m.guideKey
            ? "NOOP"
            : "DRIFT";
    }
    drafts.push({
      manifestId: m.manifestId,
      experienceKey: m.experienceKey,
      guidePin: pin,
      action,
      existingId: existing?.id ?? null,
      existingStatus: existing?.status ?? null,
    });
  }

  return {
    environment,
    editionId: edition.id,
    publishedRevisionNumber: revision?.number ?? -1,
    contentUnitId: unit.id,
    unitKeyMatches: declared !== null,
    anchors,
    targets,
    drafts,
    flagEnabled: flag,
  };
}

/** Everything the catalogs say this chapter should end up with. */
export function expectedCatalogShape(
  bookSlug = "emociones-en-construccion",
  chapterOrder = 1,
) {
  return {
    concepts: guidedChapterConcepts(bookSlug, chapterOrder).map((c) => c.key),
    // Book-wide on purpose: the activation materialises the whole book's pairs
    // in one call, so the count that matters is the book's, not the chapter's.
    pairs: (EXERCISE_INGESTION_CATALOG[bookSlug] ?? []).length,
  };
}
