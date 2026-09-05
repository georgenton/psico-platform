/**
 * Do the guided-suite anchors resolve against the chapter production serves?
 *
 *   node scripts/eec/verify-guide-anchors.mjs            # every chapter with manifests
 *   node scripts/eec/verify-guide-anchors.mjs C03 C04    # just these
 *
 * Reimplements `resolveGuideAnchor`'s rule exactly — find the HEADING, take the
 * section up to the next HEADING, count blocks containing the fingerprint — so
 * a manifest that would produce a dead card fails HERE rather than in a reader's
 * browser. C01 shipped once without this check and five cards did nothing.
 *
 * The blocks come from the built `unit-payload.json`, which is byte-identical
 * to what production serves (verified block by block at publication). Checking
 * against the manifest itself would prove only that a file agrees with itself.
 *
 * Exit 0 when every anchor resolves 1:1; 1 otherwise.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const VERSION = (code) => (code === "C06" ? "v1.1" : "v1.0");

/** Same normalisation the runtime resolver applies. */
const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function verifyChapter(code) {
  const dir = join(ROOT, `artifacts/eec/${code}/${VERSION(code)}/feelverse/guides`);
  const payloadPath = join(
    ROOT,
    `artifacts/eec/${code}/${VERSION(code)}/feelverse/unit-payload.json`,
  );
  if (!existsSync(dir) || !existsSync(payloadPath)) return [];
  const blocks = JSON.parse(readFileSync(payloadPath, "utf8")).blocks;

  const files = readdirSync(dir)
    .filter((f) => /^mg\d+\.manifest\.json$/.test(f))
    .sort();

  return files.map((f) => {
    const m = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const a = m.anchors.primary;
    const row = {
      chapter: code,
      file: f,
      guideKey: m.guideKey,
      heading: a.heading,
      status: "RESOLVED",
      headingMatches: 0,
      fingerprintMatches: 0,
    };

    const headingIdx = blocks.findIndex(
      (b) => b.kind === "HEADING" && normalize(b.content) === normalize(a.heading),
    );
    row.headingMatches = blocks.filter(
      (b) => b.kind === "HEADING" && normalize(b.content) === normalize(a.heading),
    ).length;
    if (headingIdx === -1) {
      row.status = "HEADING_NOT_FOUND";
      return row;
    }
    // A duplicated heading resolves to the FIRST one, which may not be the
    // section the guide is about. Refuse rather than silently pick.
    if (row.headingMatches > 1) {
      row.status = "HEADING_AMBIGUOUS";
      return row;
    }

    const next = blocks.findIndex((b, i) => i > headingIdx && b.kind === "HEADING");
    const section = blocks.slice(headingIdx + 1, next === -1 ? blocks.length : next);
    const needle = normalize(a.fingerprint);
    const matches = section.filter((b) => normalize(b.content).includes(needle));
    row.fingerprintMatches = matches.length;

    if (matches.length === 0) row.status = "FINGERPRINT_NOT_IN_SECTION";
    else if (matches.length > (a.expectedMatchCount ?? 1)) row.status = "AMBIGUOUS";
    return row;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const codes = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10"];
  const rows = codes.flatMap(verifyChapter);
  const bad = rows.filter((r) => r.status !== "RESOLVED");
  for (const r of rows) {
    const ok = r.status === "RESOLVED" ? "✅" : "❌";
    console.log(
      `${ok} ${r.chapter} ${r.file.padEnd(18)} h=${r.headingMatches} f=${r.fingerprintMatches}  ${r.status === "RESOLVED" ? r.guideKey : r.status + " :: " + r.heading.slice(0, 60)}`,
    );
  }
  console.log(`\nANCHORS_RESOLVED=${rows.length - bad.length}/${rows.length}`);
  process.exitCode = bad.length === 0 ? 0 : 1;
}
