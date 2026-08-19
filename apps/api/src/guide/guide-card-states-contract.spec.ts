import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GUIDE_CARD_STATES_KEY_PATTERN,
  GUIDE_CARD_STATES_MAX_PINS,
  GUIDE_CARD_STATES_MAX_VERSION,
  parseGuideCardStatesBody,
} from "./guide-card-states-params";
import {
  GUIDE_CARD_STATES_BODY,
  GUIDE_CARD_STATES_RESPONSE,
} from "./dto/guide.openapi";

/**
 * C.1 — the batch contract has THREE statements of the same rules, and this is
 * where they are forced to agree:
 *
 *   1. the parser, which is the runtime authority;
 *   2. the OpenAPI document, which is what integrators read;
 *   3. the API client, which refuses locally so a typo does not cost a round
 *      trip.
 *
 * Drift here is the quiet kind. A client that accepts a version the server
 * rejects turns a bad request into a mystery; a client stricter than the
 * server refuses work the server would have done; and a document that matches
 * neither is worse than no document, because somebody will build against it.
 *
 * The client is read as TEXT rather than imported: `apps/api` does not depend
 * on `@psico/api-client`, and adding that dependency to satisfy a test would
 * make the server's build depend on its own client.
 */

const CLIENT_SRC = join(
  process.cwd(),
  "../../packages/api-client/src/guide.ts",
);

const client = () => readFileSync(CLIENT_SRC, "utf8");

/** Read a numeric constant the client exports, or fail loudly. */
function clientNumber(name: string): number {
  const match = client().match(new RegExp(`export const ${name} = ([0-9_]+);`));
  if (!match) throw new Error(`client does not export ${name}`);
  return Number(match[1]!.replace(/_/g, ""));
}

describe("ratchet · parser ↔ OpenAPI", () => {
  it("publishes the parser's cap, not a retyped copy of it", () => {
    const pins = GUIDE_CARD_STATES_BODY.properties?.pins as {
      minItems: number;
      maxItems: number;
    };
    expect(pins.maxItems).toBe(GUIDE_CARD_STATES_MAX_PINS);
    // The parser refuses an empty batch, so the document must too.
    expect(pins.minItems).toBe(1);
  });

  it("publishes the parser's key grammar and version range", () => {
    const pin = (
      GUIDE_CARD_STATES_BODY.properties?.pins as { items: Record<string, any> }
    ).items;
    expect(pin.properties.guideKey.pattern).toBe(GUIDE_CARD_STATES_KEY_PATTERN);
    expect(pin.properties.guideVersion.minimum).toBe(1);
    expect(pin.properties.guideVersion.maximum).toBe(
      GUIDE_CARD_STATES_MAX_VERSION,
    );
  });

  it("closes both objects, so an unread field is refused on paper too", () => {
    expect(GUIDE_CARD_STATES_BODY.additionalProperties).toBe(false);
    const pin = (
      GUIDE_CARD_STATES_BODY.properties?.pins as { items: Record<string, any> }
    ).items;
    expect(pin.additionalProperties).toBe(false);
    expect(pin.required.sort()).toEqual(["guideKey", "guideVersion"]);
  });

  it("documents the answer the service actually returns — no session", () => {
    const item = (
      GUIDE_CARD_STATES_RESPONSE.properties?.items as {
        items: Record<string, any>;
      }
    ).items;
    expect(item.required.sort()).toEqual(["guidePin", "resumePin", "status"]);
    expect(Object.keys(item.properties).sort()).toEqual([
      "guidePin",
      "resumePin",
      "status",
    ]);
    // The field the review removed must not come back through the document.
    expect(JSON.stringify(GUIDE_CARD_STATES_RESPONSE)).not.toMatch(
      /"session"|sessionId|stepsCompleted/,
    );
  });
});

describe("ratchet · parser ↔ client", () => {
  it("agrees on the cap, digit for digit", () => {
    expect(clientNumber("GUIDE_CARD_STATES_MAX_PINS")).toBe(
      GUIDE_CARD_STATES_MAX_PINS,
    );
  });

  it("agrees on the largest version a pin may name", () => {
    expect(clientNumber("GUIDE_CARD_STATES_MAX_VERSION")).toBe(
      GUIDE_CARD_STATES_MAX_VERSION,
    );
  });

  it("agrees on the key grammar, character for character", () => {
    const match = client().match(/const GUIDE_KEY_RE = \/(.+?)\/;/);
    expect(match?.[1]).toBe(GUIDE_CARD_STATES_KEY_PATTERN);
  });

  it("rejects locally what the parser rejects on arrival", () => {
    // Stated as behaviour, not as a regex comparison: these are the values the
    // client's guard is written against, and the parser must refuse each one.
    const bad = [
      { guideKey: "Eec-C1", guideVersion: 1 },
      { guideKey: "eec c1", guideVersion: 1 },
      { guideKey: "", guideVersion: 1 },
      { guideKey: "eec", guideVersion: 0 },
      { guideKey: "eec", guideVersion: -1 },
      { guideKey: "eec", guideVersion: 1.5 },
      { guideKey: "eec", guideVersion: GUIDE_CARD_STATES_MAX_VERSION + 1 },
    ];
    for (const pin of bad) {
      expect(() => parseGuideCardStatesBody({ pins: [pin] })).toThrow();
    }
    // And accepts the boundary both sides call valid.
    expect(
      parseGuideCardStatesBody({
        pins: [
          { guideKey: "eec", guideVersion: GUIDE_CARD_STATES_MAX_VERSION },
        ],
      }).pins,
    ).toHaveLength(1);
  });

  it("chunks instead of refusing a chapter longer than one batch", () => {
    const src = client();
    // The loop that splits, and the constant it steps by.
    expect(src).toMatch(/i \+= GUIDE_CARD_STATES_MAX_PINS/);
    // All-or-nothing, and an ALIGNMENT check before anything is handed back:
    // the right number of verdicts, each about the pin it was asked for.
    expect(src).toMatch(/Promise\.all\(/);
    expect(src).toMatch(/items\.length === wanted\.length/);
    expect(src).toMatch(/guidePin\?\.guideKey === wanted\[i\]!\.guideKey/);
    expect(src).toMatch(
      /if \(!aligned\) throw new Error\(GUIDE_CARD_STATES_ANSWER_INVALID\);/,
    );
    // A cap the client enforces on the WHOLE list would defeat the chunking.
    expect(src).not.toMatch(
      /pins\.length > GUIDE_CARD_STATES_MAX_PINS|wanted\.length > GUIDE_CARD_STATES_MAX_PINS/,
    );
  });

  it("never echoes a rejected pin", () => {
    const src = client();
    const method = src.slice(src.indexOf("getExperienceCardStates:"));
    const body = method.slice(0, method.indexOf("\n  getRecoverableSession"));
    // The only strings thrown are the two codes.
    const thrown = [...body.matchAll(/throw new Error\(([^)]*)\)/g)].map((m) =>
      m[1]!.trim(),
    );
    expect(thrown.sort()).toEqual([
      "GUIDE_CARD_STATES_ANSWER_INVALID",
      "GUIDE_CARD_STATES_PARAMS_INVALID",
    ]);
    expect(body).not.toMatch(/\$\{[^}]*guideKey/);
  });
});
