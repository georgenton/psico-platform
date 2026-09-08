#!/usr/bin/env node
/**
 * PQP-C01 → C08 — emit the discovery entries from the approved authorities.
 *
 *   node scripts/pqp/build-discovery-entries.mjs            # rewrite
 *   node scripts/pqp/build-discovery-entries.mjs --check    # fail if stale
 *
 * Same rule as `scripts/eec/build-discovery-entries.mjs`: the route a reader is
 * OFFERED is generated from the SAME manifests the production Experiences were
 * created and published from, so the card cannot drift from the experience it
 * opens. Nothing here is new copy.
 *
 *   title        ← the INTRO scene's title
 *   description  ← the INTRO scene's first paragraph
 *   pin          ← manifest `guideKey` / `guideVersion`
 *   chapterOrder ← manifest `chapterOrder` (PLATFORM order, not the printed
 *                  chapter number — the two differ for this whole book)
 *   order        ← mg01…mg0N, contiguous within the chapter
 *
 * PQP manifests carry no `title` field of their own — unlike EEC's, they
 * predate it — so the title is read from the INTRO scene, which is where the
 * approved web bundles already take it from. Verified identical for all 33.
 *
 * `estimatedMinutes` is the one value no manifest carries. All 33 approved
 * bundles show the same range, so it is stated once here rather than invented
 * per chapter.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "apps/api/src/guide/pqp-c01-c08-discovery.ts");

/** Chapter code → how many microguides its approved route ships. */
const CHAPTERS = [
  ["C01", 4],
  ["C02", 5],
  ["C03", 4],
  ["C04", 4],
  ["C05", 4],
  ["C06", 3],
  ["C07", 4],
  ["C08", 5],
];
const ESTIMATED_MINUTES = "8–10";
const j = (v) => JSON.stringify(v);

function manifests(code, count) {
  const dir = join(ROOT, `artifacts/pqp/${code}/v1.0/feelverse/guides`);
  return Array.from({ length: count }, (_, i) => {
    const n = `mg0${i + 1}`;
    return JSON.parse(readFileSync(join(dir, `${n}.manifest.json`), "utf8"));
  });
}

function entry(m, order) {
  const intro = m.scenes.find((s) => s.kind === "INTRO");
  if (!intro) throw new Error(`NO_INTRO:${m.manifestId}`);
  if (!intro.title) throw new Error(`NO_INTRO_TITLE:${m.manifestId}`);
  if (!intro.body?.[0]) throw new Error(`NO_INTRO_BODY:${m.manifestId}`);
  return `  {
    bookSlug: ${j(m.bookSlug)},
    chapterOrder: ${m.chapterOrder},
    order: ${order},
    pin: { guideKey: ${j(m.guideKey)}, guideVersion: ${m.guideVersion} },
    title: ${j(intro.title)},
    description: ${j(intro.body[0])},
    estimatedMinutes: ${j(ESTIMATED_MINUTES)},
  },`;
}

export function render() {
  const rows = CHAPTERS.flatMap(([code, count]) =>
    manifests(code, count).map((m, i) => entry(m, i + 1)),
  );
  return `/**
 * PQP-C01 → C08 — the thirty-three guided readings, as the route OFFERS them.
 *
 * GENERATED from \`artifacts/pqp/C01…C08/v1.0/feelverse/guides\` — the same
 * artifacts the production Experiences were created and published from.
 * Regenerate with \`node scripts/pqp/build-discovery-entries.mjs\` rather than
 * editing by hand: a route typed twice is a route that drifts from the
 * experience it opens.
 *
 * Eight contexts — PLATFORM orders 2–9, which are the book's printed chapters
 * 1–8 — with 4, 5, 4, 4, 4, 3, 4 and 5 entries, each \`order\` contiguous from 1
 * inside its chapter. The catalog's constructor enforces that rather than
 * trusting it.
 *
 * The V1 pilot (\`pqp-c1-contacto-sostenido@1\`) is deliberately NOT here. It
 * stays in the guide registry and in \`PRODUCTION_LEGACY_GUIDE_PINS\`, so its
 * existing sessions keep resolving — but the route a reader is offered for the
 * book's chapter 1 is now this collection of four.
 */

import type { GuideDiscoveryEntry } from "./guide-discovery-catalog";

export const PQP_C01_C08_DISCOVERY_ENTRIES: readonly GuideDiscoveryEntry[] = [
${rows.join("\n")}
];
`;
}

const out = render();
if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== out) {
    console.error("STALE: regenerate with node scripts/pqp/build-discovery-entries.mjs");
    process.exit(1);
  }
  console.log("OK — pqp-c01-c08-discovery.ts is up to date");
} else {
  writeFileSync(OUT, out);
  console.log(`wrote ${out.split("\n").filter((l) => l === "  {").length} entries to ${OUT}`);
}
