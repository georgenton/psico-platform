import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * No runtime code may build a reader URL out of a number.
 *
 * Phase B.A settled that a position is a locator and `ReaderChapterRef` is the
 * identity. A previous round reported `POSITIONAL_HREF_GENERATORS_REMAINING=0`
 * — and `BookHero` was still pushing `/lector/${chapter}`, where `chapter` came
 * from `ceil(pct / 100 * book.chapters)`. The count was measured by hand, so it
 * was only ever as complete as the search behind it.
 *
 * This is that search, run by CI instead. It reads the source rather than the
 * behaviour, which is the point: a generator can be added anywhere, and no
 * behavioural test covers a file nobody has written yet.
 */

/**
 * Both clients. The invariant is not "web builds good URLs" — it is that no
 * runtime anywhere turns a position into a reader destination, and mobile has
 * its own navigation code that no web-scoped scan would ever see.
 */
const ROOTS = [
  join(__dirname, "..", ".."),
  join(__dirname, "..", "..", "..", "..", "mobile", "app"),
  join(__dirname, "..", "..", "..", "..", "mobile", "src"),
].filter((d) => existsSync(d));

/** Files that legitimately mention the old shape. */
const ALLOWED = [
  // The compatibility route itself — it exists to receive those URLs.
  join(
    "app",
    "dashboard",
    "biblioteca",
    "[idOrSlug]",
    "lector",
    "[chapterOrder]",
  ),
  // Tests and fixtures naming old URLs on purpose, this one included.
  ".test.",
  ".spec.",
];

/**
 * A reader path whose last segment is interpolated from something numeric.
 *
 * Deliberately narrow: `/lector/${...}` followed by a closing backtick or
 * quote, where the expression is not a discriminated `readerRef` path. The
 * canonical helper output (`/lector/c/${id}`, `/lector/u/${id}`) has a segment
 * between, so it does not match.
 */
const POSITIONAL = [
  // `/lector/${chapter}` — the template form.
  /\/lector\/\$\{[^}]*\}\s*[`"']/,
  // "/lector/" + chapter — the same thing spelled differently. The invariant
  // is semantic, so an equivalent expression must not slip past it.
  /["'`]\/lector\/["'`]\s*(\+|\.concat\s*\()/,
];

const hasPositional = (src: string) => POSITIONAL.some((re) => re.test(src));

/**
 * Cache invalidation is not navigation.
 *
 * `revalidatePath` names a route to drop from the cache; nobody follows it, and
 * the positional reader route still exists precisely so old links keep working.
 * Only these calls are stripped — the rest of the file is still scanned, so a
 * real generator hiding in the same module would still be caught.
 */
function withoutCacheCalls(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.includes("revalidatePath("))
    .join("\n");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("POSITIONAL_HREF_GENERATORS_REMAINING", () => {
  const offenders = ROOTS.flatMap((root) =>
    walk(root)
      .filter((f) => !ALLOWED.some((a) => f.includes(a)))
      .filter((f) => hasPositional(withoutCacheCalls(readFileSync(f, "utf8"))))
      .map((f) => f.slice(root.length + 1)),
  );

  it("no runtime file builds a reader URL from a position", () => {
    expect(offenders).toEqual([]);
  });

  it("it scans both clients", () => {
    // A web-only scan would have declared mobile clean without reading it.
    expect(ROOTS.length).toBeGreaterThanOrEqual(2);
    expect(ROOTS.some((r) => r.includes("mobile"))).toBe(true);
  });

  it("catches the template form BookHero used", () => {
    // Without this, an over-narrow regex would report zero offenders forever.
    expect(
      hasPositional(
        "router.push(`/dashboard/biblioteca/${book.slug}/lector/${chapter}`)",
      ),
    ).toBe(true);
    expect(hasPositional("`/books/${slug}/lector/${order}`")).toBe(true);
  });

  it("catches the same thing spelled as concatenation", () => {
    // Semantic invariant: rewriting the expression must not defeat the check.
    expect(hasPositional('"/lector/" + n')).toBe(true);
    expect(hasPositional("'/lector/' + order")).toBe(true);
    expect(hasPositional('"/lector/".concat(chapter)')).toBe(true);
  });

  it("does not flag the canonical identity paths", () => {
    expect(
      hasPositional("`/dashboard/biblioteca/${slug}/lector/c/${chapterId}`"),
    ).toBe(false);
    expect(hasPositional("`/books/${slug}/lector/u/${unitId}`")).toBe(false);
    expect(hasPositional("readerChapterPath(slug, ref)")).toBe(false);
  });
});
