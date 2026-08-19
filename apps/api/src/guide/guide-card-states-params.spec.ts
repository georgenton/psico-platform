import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GUIDE_CARD_STATES_MAX_PINS,
  GUIDE_INVALID_CARD_STATES_BODY,
  parseGuideCardStatesBody,
} from "./guide-card-states-params";

/**
 * C.1 — the batch body parser, and the route's posture.
 *
 * A malformed pin is a bad request, not a negative answer: replying `START` to
 * "guide version zero" would answer a question nobody asked. And the error is
 * value-free — the rejected key never travels into a message something will
 * eventually log.
 */

const pin = (over: Record<string, unknown> = {}) => ({
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
  ...over,
});

describe("parseGuideCardStatesBody · what it accepts", () => {
  it("takes one pin", () => {
    expect(parseGuideCardStatesBody({ pins: [pin()] })).toEqual({
      pins: [{ guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 }],
    });
  });

  it("keeps the requested ORDER and repeats a repeated pin", () => {
    // Two experiences may be deliberately bound to the same guide. Deduping
    // here would make the caller re-align answers by hand, and dropping the
    // duplicate would hide that they genuinely share a lineage.
    const parsed = parseGuideCardStatesBody({
      pins: [
        pin({ guideKey: "b" }),
        pin({ guideKey: "a" }),
        pin({ guideKey: "b" }),
      ],
    });
    expect(parsed.pins.map((p) => p.guideKey)).toEqual(["b", "a", "b"]);
  });

  it("takes a full chapter's worth", () => {
    const pins = Array.from({ length: GUIDE_CARD_STATES_MAX_PINS }, (_, i) =>
      pin({ guideVersion: i + 1 }),
    );
    expect(parseGuideCardStatesBody({ pins }).pins).toHaveLength(
      GUIDE_CARD_STATES_MAX_PINS,
    );
  });
});

describe("parseGuideCardStatesBody · what it refuses", () => {
  const refuses = (body: unknown) =>
    expect(() => parseGuideCardStatesBody(body)).toThrowError(
      GUIDE_INVALID_CARD_STATES_BODY,
    );

  it("refuses a body that is not an object with a pins array", () => {
    refuses(null);
    refuses(undefined);
    refuses("pins");
    refuses({});
    refuses({ pins: "eec" });
    refuses({ pins: {} });
  });

  it("refuses an empty batch", () => {
    // Asking about nothing is a caller bug, not a request for nothing.
    refuses({ pins: [] });
  });

  it("refuses more than the cap", () => {
    // An unbounded batch turns one authenticated request into as much work as
    // the caller likes.
    refuses({
      pins: Array.from({ length: GUIDE_CARD_STATES_MAX_PINS + 1 }, () => pin()),
    });
  });

  it("refuses a key outside the catalog grammar", () => {
    refuses({ pins: [pin({ guideKey: "Eec-C1" })] });
    refuses({ pins: [pin({ guideKey: "eec c1" })] });
    refuses({ pins: [pin({ guideKey: "" })] });
    refuses({ pins: [pin({ guideKey: 1 })] });
    refuses({ pins: [pin({ guideKey: "a".repeat(201) })] });
  });

  it("refuses a version that is not a canonical positive integer", () => {
    for (const guideVersion of [0, -1, 1.5, NaN, Infinity, "1", null, 1e12]) {
      refuses({ pins: [pin({ guideVersion })] });
    }
  });

  it("refuses the whole batch when ONE pin is bad", () => {
    // Never half-parsed: a caller must not end up querying with some pins
    // validated and others guessed.
    refuses({ pins: [pin(), pin({ guideVersion: 0 })] });
  });

  it("never echoes the rejected value", () => {
    try {
      parseGuideCardStatesBody({ pins: [pin({ guideKey: "SECRETO-Raro" })] });
      throw new Error("expected a rejection");
    } catch (err) {
      const text = `${(err as Error).name} ${(err as Error).message}`;
      expect(text).not.toContain("SECRETO");
      expect((err as Error).message).toBe(GUIDE_INVALID_CARD_STATES_BODY);
    }
  });
});

describe("ratchet · the batch route's posture", () => {
  const controller = () =>
    readFileSync(join(process.cwd(), "src/guide/guide.controller.ts"), "utf8");

  it("is a read: no-store, and it creates nothing", () => {
    const src = controller();
    const route = src.slice(src.indexOf('@Post("experiences/state")'));
    const body = route.slice(0, route.indexOf("\n  @Get") + 1);
    expect(body).toMatch(/@HttpCode\(200\)/);
    expect(body).toMatch(/Cache-Control", "private, no-store"/);
    // The lifecycle call is the read; no command, no receipt, no event.
    expect(body).toMatch(/resolveExperienceCardStates\(/);
    expect(body).not.toMatch(/\.start\(|\.completeStep\(|appendValidated/);
  });

  it("scopes every lookup to the JWT's actor", () => {
    const src = controller();
    // The class guard, and the actor taken from the token rather than the body.
    expect(src).toMatch(/@UseGuards\(JwtAuthGuard\)/);
    expect(src).toMatch(/resolveExperienceCardStates\(\s*user\.userId,/);
  });

  it("rejects a malformed body with the canonical code, not a negative answer", () => {
    const src = controller();
    expect(src).toMatch(
      /catch \{\s*throw new BadRequestException\(\{ code: GUIDE_INVALID_CARD_STATES_BODY \}\);/,
    );
  });
});
