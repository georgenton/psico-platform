import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * What Content Studio is allowed to say out loud.
 *
 * An editor is not an operator. When something fails they need to know what to
 * do next, and "R2", "objectKey" or a Cloudflare error code tells them nothing
 * they can act on while telling anyone reading over their shoulder — or looking
 * at a screenshot in a chat — how our storage is laid out.
 *
 * The rule is not "never mention these words": comments explain the design and
 * should keep doing so, and a variable named `objectKey` is fine. The rule is
 * that they must not reach the SCREEN. So this walks the string literals that
 * end up rendered and checks those.
 *
 * The same argument covers the deferred video provider. "Cloudflare", "quota"
 * and "billing" are our problems; the editor's version of that fact is that
 * video upload is not available yet.
 */

const ROOT = join(__dirname);

/** Words that would be a leak if a person ever read them in the CMS. */
const FORBIDDEN = [
  "prisma",
  "objectkey",
  "cloudflare",
  "videouid",
  "cloudflarestream",
  "r2.cloudflarestorage",
  "signedurl",
  "presigned",
  "bucket",
  "stacktrace",
  // Provider economics, which the deferred-video copy must never surface.
  "quota",
  "cuota",
  "billing",
  "facturación",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    // Tests name the forbidden words on purpose — that is how they assert them.
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Strip comments, then collect string and template literals.
 *
 * Deliberately crude. It over-collects — a non-rendered string counts too —
 * which errs toward failing loudly rather than letting something through.
 */
function renderedText(source: string): string {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

  const literals = withoutComments.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? [];
  return literals.join("\n").toLowerCase();
}

describe("Content Studio never shows an editor our infrastructure", () => {
  const files = sourceFiles(ROOT);

  it("finds the CMS source to check", () => {
    // A path change that silently emptied this list would make every assertion
    // below pass while checking nothing.
    expect(files.length).toBeGreaterThan(8);
  });

  it.each(FORBIDDEN)("says nothing about %s", (word) => {
    const offenders = files.filter((file) =>
      renderedText(readFileSync(file, "utf8")).includes(word),
    );
    expect(offenders.map((f) => f.slice(f.lastIndexOf("/") + 1))).toEqual([]);
  });
});
