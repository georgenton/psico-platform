#!/usr/bin/env node
/**
 * Refuse to deploy anywhere except the Vercel project you named.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `vercel deploy --prod --yes` inside a directory that is not linked does not
 * stop to ask. It CREATES a project, names it after the directory, links it,
 * and deploys. That is how a project called `artifact9` appeared: the command
 * was run from a prepared artifact folder whose `.vercel` had not been copied
 * across. Nothing was served — the root-directory default made the build run
 * the whole monorepo and it failed — but the failure was luck, not a guard.
 *
 * The dangerous version of that accident is the mirror image: a directory
 * linked to the PRODUCTION project when you meant to reach the test one. Same
 * command, same flags, no prompt, and it would have worked.
 *
 * So the target is asserted before the deploy rather than read from whatever
 * `.vercel` happens to be lying around:
 *
 *   node apps/web/e2e/circulos/vercel-target.mjs --dir <path> --project <prj_…> [--org <team_…>]
 *
 * Exit 0 means: this directory is linked, and linked to exactly that project.
 * Anything else — no `.vercel`, no `project.json`, an unreadable one, a
 * different project, a different org — is exit 1 and a sentence saying which.
 *
 * ── What it deliberately does NOT do ───────────────────────────────────────
 *
 * It does not link, create, repair or deploy. A guard that fixes what it finds
 * is a guard that can be satisfied by the thing it was meant to catch, and the
 * one-line fix ("copy the right .vercel in") belongs to the person who knows
 * which project they meant.
 *
 * Project and org ids are not secrets — they appear in every dashboard URL —
 * so they are printed. Nothing else in `.vercel` is read or echoed.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (flag) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? null : (process.argv[at + 1] ?? null);
};

const dir = arg("--dir");
const expectedProject = arg("--project");
const expectedOrg = arg("--org");

if (!dir || !expectedProject) {
  console.error(
    "usage: vercel-target.mjs --dir <path> --project <prj_…> [--org <team_…>]",
  );
  process.exit(2);
}

const refuse = (why) => {
  console.error(`✖ refusing to deploy from ${resolve(dir)}\n  ${why}`);
  process.exit(1);
};

const linkPath = join(dir, ".vercel", "project.json");

let link;
try {
  link = JSON.parse(readFileSync(linkPath, "utf8"));
} catch (err) {
  // Split deliberately: "there is no link" and "the link is unreadable" have
  // different fixes, and collapsing them sends somebody to the wrong one.
  refuse(
    err?.code === "ENOENT"
      ? `no .vercel/project.json — this directory is NOT linked, and a deploy with --yes would CREATE a project named after it. Copy the link of the project you mean into ${dir}/.vercel/.`
      : `.vercel/project.json could not be read (${err?.message ?? "unknown error"}).`,
  );
}

if (typeof link?.projectId !== "string" || link.projectId.length === 0) {
  refuse(".vercel/project.json carries no projectId.");
}

if (link.projectId !== expectedProject) {
  refuse(
    `linked to ${link.projectId}, expected ${expectedProject}. This is the accident that matters: same command, no prompt, wrong destination.`,
  );
}

if (expectedOrg && link.orgId !== expectedOrg) {
  refuse(`linked to org ${link.orgId ?? "(none)"}, expected ${expectedOrg}.`);
}

console.log(
  `✓ ${resolve(dir)} is linked to ${link.projectId}${
    expectedOrg ? ` in ${link.orgId}` : ""
  } — the expected target`,
);
