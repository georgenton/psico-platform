import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A chapter number is a claim about the BOOK. `Chapter.order` is a claim about
 * our reading sequence. They are the same only by coincidence — in a book whose
 * first unit is a preface, every editorial number is one behind the order.
 *
 *   API_PRESENTATION_RULE
 *     use the chapter title;
 *     never derive an editorial number from the platform order.
 *
 * The web surfaces learned this first, and the API followed three responses
 * later — Inicio's insight, the activity subtitle, and the audiobook metadata
 * title — each of which had quietly been printing `order` as «Capítulo N».
 *
 * This guards the rule, not the word. «Capítulo» in static editorial copy is
 * fine; what fails is INTERPOLATING the ordering key into a label. So the
 * pattern looks for the two together, and nothing else:
 *
 *     Cap. ${…order…}   /   Capítulo ${…chapterN…}
 *
 * Routes and sort keys are untouched by design: `/lector/${chapter.order}` is
 * what the route is keyed on and must keep working. Only labels are policed.
 *
 * Related but NOT covered here, on purpose:
 *   EDITORIAL_LABEL_METADATA_PRESENT=false   nothing stores such a label
 *   EDITORIAL_LABEL_WIRING_COMPLETE=false    no contract, no transport, no wiring
 * The day a book carries its own label, this ratchet keeps holding: the label
 * will come from the book, not from `order`.
 */

const API_SRC = join(__dirname, "..");

/** Interpolating the ordering key straight into a visible chapter label. */
const FORBIDDEN = /Cap(?:ítulo|\.)\s*\$\{[^}]*(?:\.order|chapterN|\border\b)/;

/**
 * Production code only. Specs legitimately assert on the old strings while
 * proving they are gone, and pg-specs seed fixtures named «Capítulo N».
 */
function isProductionSource(name: string): boolean {
  return (
    name.endsWith(".ts") &&
    !name.endsWith(".spec.ts") &&
    !name.endsWith(".pg-spec.ts") &&
    !name.endsWith(".e2e-spec.ts") &&
    !name.endsWith(".d.ts")
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (isProductionSource(entry)) out.push(full);
  }
  return out;
}

/**
 * Strip comments before matching. An explanatory line that QUOTES the old
 * shape — as several of the fixed files now do — is documentation, not a
 * response the reader ever sees.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("API_PRESENTATION_RULE — platform order is never an editorial number", () => {
  it("no API response interpolates chapter order into a «Capítulo N» label", () => {
    const offenders: string[] = [];

    for (const file of walk(API_SRC)) {
      const code = stripComments(readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        if (FORBIDDEN.test(line)) {
          offenders.push(
            `${file.slice(API_SRC.length + 1)}:${i + 1}  ${line.trim()}`,
          );
        }
      });
    }

    expect(
      offenders,
      `Use the chapter title. \`order\` positions a unit in the reading\n` +
        `sequence; it is not the book's own chapter number, and a book with\n` +
        `front matter makes them differ. Routes may keep using it.\n\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("catches the shapes it is meant to catch", () => {
    // Guards the guard: a ratchet that matches nothing protects nothing.
    expect(FORBIDDEN.test("title: `Cap. ${chapter.order} · ${chapter.title}`")).toBe(true); // prettier-ignore
    expect(FORBIDDEN.test("body: `Capítulo ${continueBook.chapterN}: x`")).toBe(true); // prettier-ignore
    expect(FORBIDDEN.test("subtitle: `Capítulo ${r.chapter.order} · 40%`")).toBe(true); // prettier-ignore

    // And leaves alone what is not the defect.
    expect(FORBIDDEN.test("href: `/lector/${chapter.order}`")).toBe(false);
    expect(FORBIDDEN.test('headline: "Capítulo 1"')).toBe(false);
    expect(FORBIDDEN.test("title: c.title ?? `Capítulo ${c.n}`")).toBe(false);
  });
});
