#!/usr/bin/env node
/**
 * Bulk-embed ID3v2 (mp3) / m4a atoms into chapter audio files so iOS
 * lock-screen and Android MediaSession pick up title + artist + cover at
 * playback time (current `expo-av` path — see apps/api/src/lector/README.md).
 *
 * USAGE
 *   node scripts/embed-audio-metadata.mjs --manifest path/to/manifest.json
 *
 *   --manifest   JSON file describing every audio to process.
 *   --out        Output directory (default: ./out/embedded).
 *   --dry-run    Print the ffmpeg commands without executing.
 *
 * MANIFEST SHAPE
 *   [
 *     {
 *       "input":   "./raw/emociones-cap01.m4a",
 *       "cover":   "./covers/emociones.png",          // ≤500x500 PNG/JPG
 *       "title":   "Cap. 1 · El primer paso",
 *       "artist":  "Marina Quintana",
 *       "album":   "Emociones en Construcción"
 *     },
 *     …
 *   ]
 *
 * IDEMPOTENCE
 *   Output file is `<out>/<basename>` — re-running with the same manifest
 *   overwrites the previous embed. Safe to re-run after fixing one row.
 *
 * REQUIREMENTS
 *   - ffmpeg in PATH (Homebrew: `brew install ffmpeg`).
 *   - Node 20+ (uses built-in `node:fs/promises`, `node:child_process`).
 *
 * The script picks the right ffmpeg command per extension:
 *   - .m4a → atoms (-c copy with attached PNG as second stream)
 *   - .mp3 → ID3v2 (-id3v2_version 3 + -metadata:s:v title="Album cover")
 *
 * It does NOT upload to R2 — that's a separate ops step. The intent is to
 * stage the embedded files locally, sanity-check one in QuickTime / Apple
 * Music, then bulk-upload with `rclone` / `aws s3 cp`.
 */
import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { basename, extname, resolve, dirname } from "node:path";

function parseArgs(argv) {
  const out = { manifest: null, out: "./out/embedded", dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--manifest") out.manifest = argv[++i];
    else if (arg === "--out") out.out = argv[++i];
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(import.meta.url);
      process.exit(0);
    }
  }
  if (!out.manifest) {
    console.error("[embed] --manifest required");
    process.exit(2);
  }
  return out;
}

function buildFfmpegArgs({ input, cover, title, artist, album }, outPath) {
  const ext = extname(input).toLowerCase();
  const base = [
    "-y", // overwrite output (idempotent)
    "-i",
    input,
    "-i",
    cover,
    "-map",
    "0",
    "-map",
    "1",
  ];
  if (ext === ".m4a") {
    return [
      ...base,
      "-c",
      "copy",
      "-c:v:1",
      "png",
      "-disposition:v:1",
      "attached_pic",
      "-metadata",
      `title=${title}`,
      "-metadata",
      `artist=${artist}`,
      "-metadata",
      `album=${album}`,
      outPath,
    ];
  }
  if (ext === ".mp3") {
    return [
      ...base,
      "-c",
      "copy",
      "-id3v2_version",
      "3",
      "-metadata:s:v",
      "title=Album cover",
      "-metadata:s:v",
      "comment=Cover (front)",
      "-metadata",
      `title=${title}`,
      "-metadata",
      `artist=${artist}`,
      "-metadata",
      `album=${album}`,
      outPath,
    ];
  }
  throw new Error(`[embed] Unsupported extension: ${ext} (file: ${input})`);
}

function runFfmpeg(args) {
  return new Promise((resolveProm, rejectProm) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolveProm();
      else rejectProm(new Error(`ffmpeg exit ${code}\n${stderr}`));
    });
    proc.on("error", rejectProm);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const manifestRaw = await readFile(args.manifest, "utf8");
  const manifest = JSON.parse(manifestRaw);
  if (!Array.isArray(manifest)) {
    console.error("[embed] manifest must be a JSON array");
    process.exit(2);
  }
  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });

  let ok = 0;
  let fail = 0;
  for (const entry of manifest) {
    const outPath = resolve(outDir, basename(entry.input));
    const ffArgs = buildFfmpegArgs(entry, outPath);
    if (args.dryRun) {
      console.log(`ffmpeg ${ffArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
      ok++;
      continue;
    }
    try {
      await mkdir(dirname(outPath), { recursive: true });
      await runFfmpeg(ffArgs);
      console.log(`✅ ${basename(entry.input)} → ${outPath}`);
      ok++;
    } catch (err) {
      console.error(`❌ ${basename(entry.input)}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\n[embed] done · ${ok} ok · ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`[embed] fatal: ${err.message}`);
  process.exit(1);
});
