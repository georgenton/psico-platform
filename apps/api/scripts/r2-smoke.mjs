#!/usr/bin/env node
/**
 * R2 smoke test — proves a NON-PRODUCTION bucket is really usable.
 *
 * Media bytes are the part of Content Studio that a mock cannot honestly
 * rehearse: large bodies, timeouts, partial writes and signed reads only fail
 * against a real bucket. This exists so that question is answered BEFORE the
 * upload feature is written, with one command and no guessing.
 *
 * It proves the two access shapes separately, because they are not the same
 * promise:
 *
 *   PUBLIC   — what covers and chapter illustrations use: `R2_PUBLIC_URL` +
 *              key, fetched with no credentials.
 *   SIGNED   — what audiobook, podcast and transcripts use: a short-lived
 *              presigned GET. This one must work WITHOUT the public base URL,
 *              because that is the whole point of a protected master.
 *
 * Safety, in order of how much damage each prevents:
 *
 *   - refuses to run without an explicit opt-in;
 *   - refuses when NODE_ENV looks like production;
 *   - writes ONE tiny object under a `dev/` prefix with a random name;
 *   - deletes only that object, by the key it just minted;
 *   - never prints a credential, a bucket, an account id or a signed URL.
 *
 * Usage (from a shell that has the NON-PRODUCTION R2 vars loaded):
 *
 *   R2_SMOKE_ALLOW=yes-non-production pnpm --filter @psico/api smoke:r2
 */

import { randomBytes } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function refuse(reason) {
  console.error(`REFUSED: ${reason}`);
  process.exit(2);
}

// ── Guards ───────────────────────────────────────────────────────────────────

if (process.env.R2_SMOKE_ALLOW !== "yes-non-production") {
  refuse(
    "set R2_SMOKE_ALLOW=yes-non-production to confirm this is NOT a production bucket",
  );
}
if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
  refuse("NODE_ENV=production — this test never runs against production");
}

const required = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) refuse(`missing env: ${missing.join(", ")}`);

/**
 * The one bucket this test may ever write to.
 *
 * An exact match, not a pattern. "contains dev" would happily accept
 * `psico-media` on a typo, and the production bucket is the one place a stray
 * PutObject would actually cost something. Pinning the literal name means a
 * misconfigured `.env` fails here rather than in production storage.
 */
const DEV_BUCKET = "psico-media-dev";

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET_NAME;

if (bucket !== DEV_BUCKET) {
  refuse(
    `R2_BUCKET_NAME must be exactly "${DEV_BUCKET}" — this test never writes to any other bucket`,
  );
}
const publicBase = process.env.R2_PUBLIC_URL ?? null;

// A Cloudflare account id is 32 hex characters. Anything else is a placeholder,
// and saying so here beats a TLS error nobody can read.
if (!/^[0-9a-f]{32}$/.test(accountId)) {
  refuse(
    `R2_ACCOUNT_ID is not a 32-character hex account id (got ${accountId.length} chars) — this looks like a placeholder`,
  );
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Server-owned, disposable, and obviously a test.
const key = `dev/content-studio/r2-smoke/${randomBytes(8).toString("hex")}.txt`;
const body = `psico r2 smoke ${randomBytes(6).toString("hex")}`;

/** Errors are reported by NAME and STATUS only — a message can echo a key back. */
const brief = (e) =>
  `${e?.name ?? "Error"}${e?.$metadata?.httpStatusCode ? ` (${e.$metadata.httpStatusCode})` : ""}`;

let wrote = false;

try {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    record("AUTH + bucket reachable", true);
  } catch (e) {
    record("AUTH + bucket reachable", false, brief(e));
    throw e;
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "text/plain",
      }),
    );
    wrote = true;
    record("WRITE tiny object", true);
  } catch (e) {
    record("WRITE tiny object", false, brief(e));
    throw e;
  }

  try {
    const got = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const read = await got.Body.transformToString();
    record("READ back with credentials", read === body, "byte-exact");
  } catch (e) {
    record("READ back with credentials", false, brief(e));
  }

  // The protected path: a presigned GET must work on its own, with no public
  // base URL involved. This is the shape audiobook and podcast masters use.
  try {
    const signed = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 60 },
    );
    const res = await fetch(signed);
    const read = await res.text();
    const ok = res.ok && read === body;
    record(
      "SIGNED access (protected media shape)",
      ok,
      ok ? "byte-exact, no public URL used" : `status ${res.status}`,
    );
  } catch (e) {
    record("SIGNED access (protected media shape)", false, brief(e));
  }

  // The public path is INFORMATIONAL. It is how covers and illustrations are
  // served; a failure here does not block protected audio, and a success here
  // must never be taken as licence to serve audio the same way.
  if (publicBase) {
    try {
      const res = await fetch(`${publicBase.replace(/\/+$/, "")}/${key}`);
      const read = res.ok ? await res.text() : "";
      record(
        "PUBLIC base URL (images only — informational)",
        res.ok && read === body,
        res.ok ? "bucket is public-by-URL" : `status ${res.status}`,
      );
    } catch (e) {
      record("PUBLIC base URL (images only — informational)", false, brief(e));
    }
  } else {
    console.log("SKIP  PUBLIC base URL — R2_PUBLIC_URL not set");
  }
} catch {
  // Already recorded; fall through to cleanup and the summary.
} finally {
  if (wrote) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      record("CLEANUP smoke object", true);
    } catch (e) {
      // Loud on purpose: a leftover object under `dev/` is harmless but should
      // not be silent, or the prefix quietly fills up.
      record("CLEANUP smoke object", false, `${brief(e)} — leftover under dev/`);
    }
  }
}

// The public check is informational and does not decide the exit code: the
// blocking question is whether protected media works.
const blocking = results.filter(
  (r) => !r.name.startsWith("PUBLIC base URL"),
);
const failed = blocking.filter((r) => !r.ok);

console.log(
  `\n${failed.length === 0 ? "R2 SMOKE PASS" : "R2 SMOKE FAIL"} — ${blocking.length - failed.length}/${blocking.length} required checks`,
);
process.exit(failed.length === 0 ? 0 : 1);
