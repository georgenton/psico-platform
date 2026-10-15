import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The wait that opens the group's room, and why it stopped reading the screen.
 *
 * The Círculos walk is the only test that covers the Dúo and the groups end to
 * end, so one of its green runs gets used as promotion evidence. This spec
 * exists because one of those greens meant nothing.
 *
 * `continuarConQuienesAceptaron` used to wait until the page text matched
 * `/Prepárate|preparar tu parte|Tu parte/i`. Of those three alternatives:
 *
 *   · `Prepárate` is not rendered anywhere in the product.
 *   · `preparar tu parte` exists ONLY as the message for
 *     `CIRCLE_ONBOARDING_OPEN` — «Todavía se están incorporando personas» —
 *     which is shown precisely because the room has NOT opened.
 *   · `Tu parte` matches that same sentence, and also matches «Puedes dejar tu
 *     parte lista» on the share preview, which likewise means still inviting.
 *
 * Every string it could match meant "not yet" or "already sent"; none meant
 * "open for preparation". The wait returned on the screen it was supposed to
 * wait past, and whether a run went green depended on which copy happened to
 * be on screen at the first poll. It surfaced as one scenario failing on
 * `continuing with the group opens the preparation (INVITING)` while the same
 * pattern passed elsewhere.
 *
 * What is pinned here is the DEFECT, not one correct wording: the wait for
 * this transition has to read the activity's state, not the page text. The two
 * sentences below are kept literal on purpose, together with the retired
 * expression, because that pair is a closed fact — it shows the ambiguity
 * without depending on the product keeping that copy.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WALK = readFileSync(resolve(HERE, "duo.walk.mjs"), "utf8");

/** One walk function's source, up to its closing `}` in column zero. */
function bodyOf(name) {
  const start = WALK.indexOf(`async function ${name}(`);
  expect(
    start,
    `${name} no longer exists in duo.walk.mjs; if it was renamed, rename this spec too`,
  ).toBeGreaterThan(-1);
  const end = WALK.indexOf("\n}\n", start);
  expect(end).toBeGreaterThan(start);
  return WALK.slice(start, end);
}

/**
 * The same body with comment lines removed.
 *
 * Needed because the rule is about what the code DOES, and the fix left an
 * explanation inside the function that quotes the defect's own phrases.
 * Without this filter the spec failed on its own documentation — which would
 * amount to forbidding the defect from being named.
 */
function codeOf(name) {
  return bodyOf(name)
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

describe("the wait that opens the group's room", () => {
  const code = codeOf("continuarConQuienesAceptaron");

  it("waits on the activity's state, not on the page text", () => {
    // After confirming, the activity is what decides.
    const afterConfirm = code.slice(code.indexOf("confirm.click()"));

    expect(afterConfirm).toContain("CircleActivity");
    expect(afterConfirm).toMatch(/!==\s*"INVITING"/);

    // And NOT the rendered text. `innerText` stays legitimate BEFORE
    // confirming — both `catch` blocks use it to explain why a button never
    // appeared — so the restriction is scoped to the wait itself.
    expect(afterConfirm).not.toContain("innerText");
  });

  it("does not go back to a text predicate for this transition", () => {
    expect(code).not.toMatch(/preparar tu parte/i);
    expect(code).not.toMatch(/Prepárate/i);
  });

  it("and this is why: the retired expression accepted a room still closed", () => {
    const RETIRED = /Prepárate|preparar tu parte|Tu parte/i;

    // The two sentences the product shows WHILE it is still inviting.
    const notOpenYet = [
      "Todavía se están incorporando personas. Puedes preparar tu parte; " +
        "podrás enviarla cuando quien organiza continúe con el grupo.",
      "Todavía se están incorporando personas. Puedes dejar tu parte lista;",
    ];

    for (const sentence of notOpenYet) {
      expect(
        RETIRED.test(sentence),
        `the retired expression accepted a screen that was not open: ${sentence}`,
      ).toBe(true);
    }
  });
});
