#!/usr/bin/env node
/**
 * EEC-C03 → C10 — emit the web microguide tables from the manifests.
 *
 *   node scripts/eec/build-web-microguides.mjs            # rewrite the eight
 *   node scripts/eec/build-web-microguides.mjs --check    # fail if stale
 *
 * C01 and C02 typed their tables by hand, mirroring the manifests. That worked
 * for ten microguides and would not survive forty: every string would exist in
 * two places, and the copy the player draws would drift from the copy the
 * DRAFT was created from without anything failing.
 *
 * So these eight files are GENERATED and committed. Everything comes from the
 * manifests except the recall's three option labels, which come from the
 * PUBLIC half of the server-side catalog — `correctOptionKey` is never read
 * here and could not be emitted even by accident.
 *
 * The recall halves are produced by the API (the catalog is TypeScript), so
 * this script reads them from `artifacts/eec/guides-recall-public.json`, which
 * `pnpm --filter @psico/api test` refreshes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHAPTERS = ["C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10"];
const version = (code) => (code === "C06" ? "v1.1" : "v1.0");
const j = (v) => JSON.stringify(v);

const recalls = JSON.parse(
  readFileSync(join(ROOT, "artifacts/eec/guides-recall-public.json"), "utf8"),
);

function manifests(code) {
  const dir = join(ROOT, `artifacts/eec/${code}/${version(code)}/feelverse/guides`);
  return ["mg01", "mg02", "mg03", "mg04", "mg05"].map((n) =>
    JSON.parse(readFileSync(join(dir, `${n}.manifest.json`), "utf8")),
  );
}

function entry(m, order) {
  const s = Object.fromEntries(m.scenes.map((x) => [x.kind, x]));
  const r = recalls[m.recallKey];
  if (!r) throw new Error(`RECALL_NOT_PUBLIC:${m.recallKey}`);
  const list = (xs) => xs.map(j).join(", ");
  return `  {
    slug: ${j(m.guideKey.slice(`eec-c${order}-`.length))},
    practiceSlug: ${j(m.practiceKey.slice(`eec-c${order}-practice-`.length))},
    title: ${j(m.title)},
    summary: ${j(s.INTRO.body[0])},
    duration: "8–10 minutos",
    intro: {
      title: ${j(s.INTRO.title)},
      body: [${j(s.INTRO.body[0])}],
      note: ${j(s.INTRO.note)},
    },
    passage: {
      title: ${j(s.PASSAGE.title)},
      body: ${j(s.PASSAGE.body[0])},
    },
    concept: {
      title: ${j(s.CONCEPT.title)},
      body: [${list(s.CONCEPT.body)}],
      note: ${j(s.CONCEPT.note)},
    },
    practice: {
      title: ${j(s.PRACTICE.title)},
      body: [${list(s.PRACTICE.body)}],
      note: ${j(s.PRACTICE.note)},
    },
    recall: {
      question: ${j(r.question)},
      options: [
${r.options.map((o) => `        { optionKey: ${j(o.optionKey)}, label: ${j(o.label)} },`).join("\n")}
      ],
    },
    summaryScene: {
      title: ${j(s.SUMMARY.title)},
      body: [${list(s.SUMMARY.body)}],
    },
  },`;
}

export function render(code) {
  const ms = manifests(code);
  const order = ms[0].chapterOrder;
  return `/**
 * EEC-${code}'s five microguides, as the browser needs them.
 *
 * GENERATED from \`artifacts/eec/${code}/${version(code)}/feelverse/guides/*.manifest.json\`
 * plus the PUBLIC half of the server-side recall catalog — the same artifacts
 * the production DRAFTs are created from. Regenerate with
 * \`node scripts/eec/build-web-microguides.mjs\` rather than editing by hand: a
 * table typed twice is a table that drifts, and the web bundle test fails the
 * build if this file and the manifests disagree.
 *
 * The correct option is NOT among the options here, and nothing in this file
 * knows which one it is — so nothing here could leak it.
 */

import type { GuidePresentation } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";
import {
  microguidePresentation,
  microguideReaderCopy,
  type MicroguideChapter,
  type MicroguideEntry,
} from "./guide-microguide-bundle";

const EEC_${code}: MicroguideChapter = {
  keyPrefix: "eec-c${order}",
  chapterLabel: "capítulo ${order}",
};

export const EEC_${code}_MICROGUIDES: readonly MicroguideEntry[] = [
${ms.map((m) => entry(m, order)).join("\n")}
];

export const EEC_${code}_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_${code}_MICROGUIDES.map((m) => microguidePresentation(EEC_${code}, m));

export const EEC_${code}_READER_COPY: readonly GuideReaderCopy[] =
  EEC_${code}_MICROGUIDES.map((m) => microguideReaderCopy(EEC_${code}, m));
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const code of CHAPTERS) {
    const path = join(
      ROOT,
      `apps/web/src/components/dashboard/guide/eec-${code.toLowerCase()}-microguides.ts`,
    );
    const next = render(code);
    if (check) {
      const now = readFileSync(path, "utf8");
      if (now !== next) {
        stale += 1;
        console.error(`STALE ${code}`);
      }
    } else {
      writeFileSync(path, next);
      console.log(`wrote ${code}`);
    }
  }
  if (check) {
    console.log(stale === 0 ? "OK — the eight tables match the manifests" : `${stale} stale`);
    process.exitCode = stale === 0 ? 0 : 1;
  }
}
