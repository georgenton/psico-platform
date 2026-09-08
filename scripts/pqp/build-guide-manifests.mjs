#!/usr/bin/env node
/**
 * PQP — build one chapter's microguide manifests plus its route.
 *
 *   node scripts/pqp/build-guide-manifests.mjs --chapter=C01
 *   node scripts/pqp/build-guide-manifests.mjs --chapter=C02
 *
 * Same artifact contract EEC uses, so the existing CLI reads these without a
 * second loader. The editorial data lives in `scripts/pqp/chapters/<code>.mjs`
 * and everything shared — the privacy policy, the accessibility requirements,
 * the three step kinds, the checksum rule — lives here. A second chapter is a
 * data module, never a second copy of this builder.
 *
 * Determinism matters: regenerating a chapter whose DRAFTs already exist must
 * produce byte-identical files, because their checksums are what the CLI
 * validates against.
 *
 * Nothing here reaches production. It writes files a human reviews.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BOOK = "parejas-que-perduran";
const EDITION = "parejas-que-perduran-1e";
const CANONICAL_SHA =
  "6151a1ca2d88529ca1ca959997d04b681255d4e9f00510a0510651ddf65b616f";
const CANONICAL_VERSION = "PQP_PRINTED_v1.0_TEXT_LOCKED_2026-09-07";
const SOURCE_ARTIFACT = "Pareja que perduran_final.docx";

/** Every microguide carries the same promises about what it does with words. */
const PRIVACY = {
  freeTextLeavesDevice: false,
  freeTextInProgress: false,
  emotionalInference: false,
  diagnosis: false,
  requiresIntenseEmotion: false,
};

const ACCESSIBILITY = [
  "Toda práctica ofrece un camino sin arrastrar y sin depender del color.",
  "Ninguna escena comunica su estado únicamente con un icono.",
  "Las escenas opcionales se pueden omitir con el teclado.",
];

const STEP_KINDS = [
  ["CONCEPT_EXPLORATION", (m) => `explorar-${m.slug}`, (m) => m.conceptKey],
  [
    "CATALOG_PRACTICE",
    (m) => `practicar-${m.practiceSlug}`,
    (m) => m.practiceKey,
  ],
  ["ACTIVE_RECALL", (m) => `recordar-${m.slug}`, (m) => m.recallKey],
];

const arg = process.argv.find((a) => a.startsWith("--chapter="));
const code = (arg ? arg.slice(10) : "C01").toUpperCase();
const { CHAPTER, MICROGUIDES } = await import(
  `./chapters/${code.toLowerCase()}.mjs`
);
const OUT = `artifacts/pqp/${CHAPTER.code}/v1.0/feelverse/guides`;

mkdirSync(OUT, { recursive: true });

const route = [];
MICROGUIDES.forEach((mg, index) => {
  const n = index + 1;
  const id = `PQP-${CHAPTER.code}-MG0${n}`;
  const guideKey = `${CHAPTER.keyPrefix}-${mg.slug}`;
  const enriched = {
    ...mg,
    conceptKey: `${CHAPTER.keyPrefix}-${mg.slug}`,
    practiceKey: `${CHAPTER.keyPrefix}-practice-${mg.practiceSlug}`,
    recallKey: `${CHAPTER.keyPrefix}-recall-${mg.slug}`,
  };
  const manifest = {
    schemaVersion: "1.0",
    manifestId: id,
    bookSlug: BOOK,
    editionKey: EDITION,
    chapterCode: CHAPTER.code,
    chapterOrder: CHAPTER.chapterOrder,
    unitKey: CHAPTER.unitKey,
    canonicalVersion: CANONICAL_VERSION,
    canonicalSha256: CANONICAL_SHA,
    sourceArtifact: SOURCE_ARTIFACT,
    experienceKey: guideKey,
    experienceVersion: 1,
    guideKey,
    guideVersion: 1,
    conceptKey: enriched.conceptKey,
    practiceKey: enriched.practiceKey,
    practiceKind: mg.practiceKind,
    recallKey: enriched.recallKey,
    anchors: {
      primary: {
        reference: guideKey,
        heading: mg.anchor.heading,
        fingerprint: mg.anchor.fingerprint,
        expectedMatchCount: 1,
      },
    },
    scenes: mg.scenes.map((s, i) => ({
      order: i + 1,
      kind: s.kind,
      title: s.title,
      body: s.body,
      ...(s.note !== undefined ? { note: s.note } : {}),
      ...(s.actionLabel !== undefined ? { actionLabel: s.actionLabel } : {}),
      ...(s.optional ? { optional: true } : {}),
    })),
    guideSteps: STEP_KINDS.map(([kind, stepKey, targetKey], i) => ({
      order: i + 1,
      kind,
      stepKey: stepKey(enriched),
      targetKey: targetKey(enriched),
    })),
    media: CHAPTER.media ?? { authorVideoPending: false },
    privacyPolicy: PRIVACY,
    accessibilityRequirements: ACCESSIBILITY,
    status: "DRAFT",
    publishAllowed: false,
    idempotencyKey: `pqp-${CHAPTER.code.toLowerCase()}-${mg.slug}-v1`,
    approvalReferences: CHAPTER.approvalReferences,
  };
  // The checksum covers the manifest WITHOUT itself, serialized exactly as the
  // validator serializes it (two-space indent). Any other shape recomputes to a
  // different digest and the CLI reports the file as edited by hand.
  manifest.manifestSha256 = createHash("sha256")
    .update(JSON.stringify(manifest, null, 2), "utf8")
    .digest("hex");
  writeFileSync(
    join(OUT, `mg0${n}.manifest.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  route.push({ order: n, manifestId: id, guideKey, guideVersion: 1 });
});

const suite = {
  schemaVersion: "1.0",
  manifestId: `PQP-${CHAPTER.code}-SUITE`,
  bookSlug: BOOK,
  editionKey: EDITION,
  chapterCode: CHAPTER.code,
  chapterOrder: CHAPTER.chapterOrder,
  unitKey: CHAPTER.unitKey,
  canonicalVersion: CANONICAL_VERSION,
  canonicalSha256: CANONICAL_SHA,
  status: "DRAFT",
  publishAllowed: false,
  approvalReferences: CHAPTER.approvalReferences,
  // No flag: like EEC-C02 onwards, these ship as DRAFT and the chapter is
  // absent from the discovery catalog, so the route is dark by construction
  // rather than by a switch somebody could flip early.
  featureFlag: null,
  featureFlagDefault: "off",
  ...(CHAPTER.legacyPilot ? { legacyPilot: CHAPTER.legacyPilot } : {}),
  route,
};
writeFileSync(
  join(OUT, "chapter-guided-suite.manifest.json"),
  JSON.stringify(suite, null, 2) + "\n",
);

console.log(
  `wrote ${MICROGUIDES.length} manifests + suite to ${OUT}`,
);
