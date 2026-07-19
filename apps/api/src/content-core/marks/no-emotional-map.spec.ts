import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-6C invariant: the mark write/read code path must NEVER import from or write
 * to the Emotional Map. Marks are book-anchoring metadata; the Emotional Map is a
 * separate subsystem (out of scope for this PR). This static guard fails the
 * build if a future edit couples them.
 */
const FILES = [
  join(__dirname, "mark-anchor.ts"),
  join(__dirname, "..", "read", "content-marks.ts"),
  // CC-6E — the content-access policy is entitlement, not the Emotional Map.
  join(__dirname, "..", "access", "content-access.ts"),
  join(__dirname, "..", "access", "content-access.service.ts"),
  // CC-6F — the targeted backfill runner is ops surface, not the Emotional Map.
  join(__dirname, "..", "backfill-runner.ts"),
  join(__dirname, "..", "backfill-cli.ts"),
];

describe("CC-6C — marks never touch the Emotional Map", () => {
  it.each(FILES)("%s has no emotional-map coupling", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/emotional-map/i);
    expect(src).not.toMatch(/EmotionalMap/);
    expect(src).not.toMatch(/emotionalMapSnapshot/i);
  });
});
