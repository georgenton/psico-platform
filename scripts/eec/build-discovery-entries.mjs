#!/usr/bin/env node
/**
 * EEC-C03 → C10 — emit the discovery entries from the manifests.
 *
 *   node scripts/eec/build-discovery-entries.mjs            # rewrite
 *   node scripts/eec/build-discovery-entries.mjs --check    # fail if stale
 *
 * C01's five discovery entries were typed by hand, because its manifests
 * predate the `title` field and there was nothing to derive from. Forty would
 * be a different proposition: the same sentence would exist in the manifest,
 * in the web table and here, and the route a reader is offered would drift
 * from the experience they open without anything failing.
 *
 * So these are GENERATED and committed, from the SAME manifests the production
 * Experiences were created and published from. Nothing here is new copy.
 *
 *   title        ← manifest `title`
 *   description  ← the INTRO scene's first paragraph
 *   pin          ← manifest `guideKey` / `guideVersion`
 *   order        ← mg01…mg05
 *
 * `estimatedMinutes` is the one value the manifests do not carry. It is the
 * range the approved web bundle already shows for all forty, stated once here
 * rather than invented per chapter.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "apps/api/src/guide/eec-c03-c10-discovery.ts");
const CHAPTERS = ["C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10"];
const version = (code) => (code === "C06" ? "v1.1" : "v1.0");
/** The range the approved web bundle shows for every one of the forty. */
const ESTIMATED_MINUTES = "8–10";
const j = (v) => JSON.stringify(v);

function manifests(code) {
  const dir = join(ROOT, `artifacts/eec/${code}/${version(code)}/feelverse/guides`);
  return ["mg01", "mg02", "mg03", "mg04", "mg05"].map((n) =>
    JSON.parse(readFileSync(join(dir, `${n}.manifest.json`), "utf8")),
  );
}

function entry(m, order) {
  const intro = m.scenes.find((s) => s.kind === "INTRO");
  if (!intro) throw new Error(`NO_INTRO:${m.manifestId}`);
  if (!m.title) throw new Error(`NO_TITLE:${m.manifestId}`);
  return `  {
    bookSlug: ${j(m.bookSlug)},
    chapterOrder: ${m.chapterOrder},
    order: ${order},
    pin: { guideKey: ${j(m.guideKey)}, guideVersion: ${m.guideVersion} },
    title: ${j(m.title)},
    description: ${j(intro.body[0])},
    estimatedMinutes: ${j(ESTIMATED_MINUTES)},
  },`;
}

export function render() {
  const rows = CHAPTERS.flatMap((code) =>
    manifests(code).map((m, i) => entry(m, i + 1)),
  );
  return `/**
 * EEC-C03 → C10 — the forty guided readings, as the route OFFERS them.
 *
 * GENERATED from \`artifacts/eec/C03…C10/<version>/feelverse/guides\` — the
 * same artifacts the production Experiences were created and published from.
 * Regenerate with \`node scripts/eec/build-discovery-entries.mjs\` rather than
 * editing by hand: a route typed twice is a route that drifts from the
 * experience it opens.
 *
 * Eight contexts, five entries each, \`order\` 1..5 and contiguous — which the
 * catalog's constructor enforces rather than trusts.
 */

import type { GuideDiscoveryEntry } from "./guide-discovery-catalog";

export const EEC_C03_C10_DISCOVERY_ENTRIES: readonly GuideDiscoveryEntry[] = [
${rows.join("\n")}
];
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const next = render();
  if (process.argv.includes("--check")) {
    const now = readFileSync(OUT, "utf8");
    const ok = now === next;
    console.log(ok ? "OK — the discovery entries match the manifests" : "STALE");
    process.exitCode = ok ? 0 : 1;
  } else {
    writeFileSync(OUT, next);
    console.log(`wrote ${OUT}`);
  }
}
