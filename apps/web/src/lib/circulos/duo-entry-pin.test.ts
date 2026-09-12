import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * One screen, one guide.
 *
 * The standalone route states its Experience pin on the SERVER (so eligibility
 * can be resolved before anything reaches the browser) while the player states
 * the same guide's pin on the CLIENT. Two literals naming one thing can drift,
 * and the drift would be silent: the page would play one guide and offer a Dúo
 * belonging to another. This is the check that they stay equal.
 *
 * The alternative — exporting one constant from the client module — was
 * rejected on purpose: it would pull a `"use client"` module into the server
 * page's import graph to read a string.
 */

/** `src/lib/circulos` → `apps/web`. */
const WEB = resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(join(WEB, rel), "utf8");
}

/** The first `key: "value"` / `key: 1` pair for a field, or null. */
function field(src: string, name: string): string | null {
  const str = new RegExp(`${name}:\\s*["']([^"']+)["']`).exec(src);
  if (str) return str[1]!;
  const num = new RegExp(`${name}:\\s*(\\d+)`).exec(src);
  return num ? num[1]! : null;
}

const PAGE =
  "src/app/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente/page.tsx";
const MOUNT = "src/components/dashboard/guide/GuidePlayerMount.tsx";

describe("the standalone route's two pins name the same guide", () => {
  it("server Experience pin === client Guide pin", () => {
    const page = read(PAGE);
    const mount = read(MOUNT);

    const experienceKey = field(page, "experienceKey");
    const experienceVersion = field(page, "experienceVersion");
    const guideKey = field(mount, "guideKey");
    const guideVersion = field(mount, "guideVersion");

    // Both must actually be found — a rename that removed one would otherwise
    // make this pass by comparing null to null.
    expect(experienceKey).toBeTruthy();
    expect(guideKey).toBeTruthy();

    expect(experienceKey).toBe(guideKey);
    expect(experienceVersion).toBe(guideVersion);
  });

  it("the route's own name still matches the guide it plays", () => {
    // The directory IS the guide key. If a future rename moves one and not the
    // other, the screen would be reachable under a name for a different guide.
    const page = read(PAGE);
    expect(field(page, "experienceKey")).toBe("eec-c1-cuerpo-antes-que-mente");
  });
});

describe("every Dúo CTA mount is server-rendered", () => {
  it("no 'use client' module renders DuoEntryPoint", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(join(WEB, "src"), {
      recursive: true,
    } as never) as string[]) {
      if (typeof file !== "string") continue;
      if (!/\.tsx?$/.test(file)) continue;
      if (/\.(test|spec)\.tsx?$/.test(file)) continue;
      const src = read(join("src", file));
      if (!src.includes("DuoEntryPoint")) continue;
      // The component's own file is the definition, not a mount.
      if (file.endsWith("DuoEntryPoint.tsx")) continue;
      if (/^\s*["']use client["']/m.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
