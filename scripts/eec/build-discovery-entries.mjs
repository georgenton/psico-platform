#!/usr/bin/env node
/**
 * EEC-C02 → C10 — emit the discovery entries from the approved authorities.
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

/**
 * C02's five, whose provenance is NOT the same as C03–C10's.
 *
 * Its manifests predate the `title` field, exactly like C01's. The approved
 * titles and per-microguide durations live in the web bundle
 * (`eec-c02-microguides.ts`), which is the table the reader already sees, so
 * they are read from there rather than retyped into a third place. The
 * descriptions still come from the manifests' own INTRO paragraph.
 *
 * Kept as its own file rather than folded in with C03–C10 because that
 * difference in authority is worth seeing, not hiding behind one loop.
 */
const C02_BUNDLE = join(
  ROOT,
  "apps/web/src/components/dashboard/guide/eec-c02-microguides.ts",
);

function c02Approved() {
  const src = readFileSync(C02_BUNDLE, "utf8");
  const slugs = [...src.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
  const titles = [...src.matchAll(/^ {4}title: "([^"]+)"/gm)].map((m) => m[1]);
  const durations = [...src.matchAll(/duration: "([^"]+)"/g)].map((m) => m[1]);
  if (slugs.length !== 5 || titles.length !== 5 || durations.length !== 5) {
    throw new Error("C02_BUNDLE_SHAPE_UNEXPECTED");
  }
  return slugs.map((slug, i) => ({
    slug,
    title: titles[i],
    // "8–10 minutos" in the bundle; discovery states the range alone.
    estimatedMinutes: durations[i].replace(/\s*minutos$/, ""),
  }));
}

export function renderC02() {
  const ms = manifests("C02");
  const approved = c02Approved();
  const rows = ms.map((m, i) => {
    const a = approved[i];
    if (!m.guideKey.endsWith(a.slug)) {
      throw new Error(`C02_ORDER_MISMATCH:${m.guideKey}:${a.slug}`);
    }
    const intro = m.scenes.find((s) => s.kind === "INTRO");
    if (!intro) throw new Error(`NO_INTRO:${m.manifestId}`);
    return `  {
    bookSlug: ${j(m.bookSlug)},
    chapterOrder: ${m.chapterOrder},
    order: ${i + 1},
    pin: { guideKey: ${j(m.guideKey)}, guideVersion: ${m.guideVersion} },
    title: ${j(a.title)},
    description: ${j(intro.body[0])},
    estimatedMinutes: ${j(a.estimatedMinutes)},
  },`;
  });
  return `/**
 * EEC-C02's five guided readings, as the route OFFERS them.
 *
 * GENERATED by \`node scripts/eec/build-discovery-entries.mjs\`. Its five
 * Experiences have been PUBLISHED since September 2026; only the offer was
 * missing.
 *
 * Provenance differs from C03–C10 on purpose. C02's manifests predate the
 * \`title\` field, so the titles and durations come from the approved web
 * bundle — the table the reader already sees — and only the descriptions come
 * from the manifests' own INTRO paragraph. Nothing here is new copy.
 */

import type { GuideDiscoveryEntry } from "./guide-discovery-catalog";

export const EEC_C02_DISCOVERY_ENTRIES: readonly GuideDiscoveryEntry[] = [
${rows.join("\n")}
];
`;
}

const OUT_C02 = join(ROOT, "apps/api/src/guide/eec-c02-discovery.ts");

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputs = [
    [OUT, render()],
    [OUT_C02, renderC02()],
  ];
  if (process.argv.includes("--check")) {
    const stale = outputs.filter(([path, next]) => readFileSync(path, "utf8") !== next);
    for (const [path] of stale) console.error(`STALE ${path}`);
    console.log(
      stale.length === 0
        ? "OK — the discovery entries match their sources"
        : `${stale.length} stale`,
    );
    process.exitCode = stale.length === 0 ? 0 : 1;
  } else {
    for (const [path, next] of outputs) {
      writeFileSync(path, next);
      console.log(`wrote ${path}`);
    }
  }
}
