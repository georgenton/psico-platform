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

/**
 * C.3R — a well-formed reader context, carried by every body below.
 *
 * Spelled out rather than left implicit: once the context became required,
 * every negative in this file would otherwise have started failing because it
 * omitted the reader, and each would have gone green for a reason that has
 * nothing to do with the case it names.
 */
const READER = {
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  unitKey: "unidad-de-prueba-1",
};

/** A complete body; `over` mutates exactly the part under test. */
const body = (over: Record<string, unknown> = {}) => ({
  pins: [pin()],
  reader: READER,
  ...over,
});

describe("parseGuideCardStatesBody · what it accepts", () => {
  it("takes one pin", () => {
    expect(parseGuideCardStatesBody(body())).toEqual({
      pins: [{ guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 }],
      reader: READER,
    });
  });

  it("keeps the requested ORDER and repeats a repeated pin", () => {
    // Two experiences may be deliberately bound to the same guide. Deduping
    // here would make the caller re-align answers by hand, and dropping the
    // duplicate would hide that they genuinely share a lineage.
    const parsed = parseGuideCardStatesBody(
      body({
        pins: [
          pin({ guideKey: "b" }),
          pin({ guideKey: "a" }),
          pin({ guideKey: "b" }),
        ],
      }),
    );
    expect(parsed.pins.map((p) => p.guideKey)).toEqual(["b", "a", "b"]);
  });

  it("takes a full chapter's worth", () => {
    const pins = Array.from({ length: GUIDE_CARD_STATES_MAX_PINS }, (_, i) =>
      pin({ guideVersion: i + 1 }),
    );
    expect(parseGuideCardStatesBody(body({ pins })).pins).toHaveLength(
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
    refuses(body({ pins: "eec" }));
    refuses(body({ pins: {} }));
    // A body with a reader and no pins is still a body about nothing.
    refuses({ reader: READER });
  });

  it("refuses an empty batch", () => {
    // Asking about nothing is a caller bug, not a request for nothing.
    refuses(body({ pins: [] }));
  });

  it("refuses more than the cap", () => {
    // An unbounded batch turns one authenticated request into as much work as
    // the caller likes.
    refuses(
      body({
        pins: Array.from({ length: GUIDE_CARD_STATES_MAX_PINS + 1 }, () =>
          pin(),
        ),
      }),
    );
  });

  it("refuses a key outside the catalog grammar", () => {
    refuses(body({ pins: [pin({ guideKey: "Eec-C1" })] }));
    refuses(body({ pins: [pin({ guideKey: "eec c1" })] }));
    refuses(body({ pins: [pin({ guideKey: "" })] }));
    refuses(body({ pins: [pin({ guideKey: 1 })] }));
    refuses(body({ pins: [pin({ guideKey: "a".repeat(201) })] }));
  });

  it("refuses a version that is not a canonical positive integer", () => {
    for (const guideVersion of [0, -1, 1.5, NaN, Infinity, "1", null, 1e12]) {
      refuses(body({ pins: [pin({ guideVersion })] }));
    }
  });

  it("refuses the whole batch when ONE pin is bad", () => {
    // Never half-parsed: a caller must not end up querying with some pins
    // validated and others guessed.
    refuses(body({ pins: [pin(), pin({ guideVersion: 0 })] }));
  });

  it("refuses an unknown property at the ROOT", () => {
    // Not "ignored": a caller sending `userId` or `force` would otherwise read
    // the 200 as "accepted", and this endpoint implements neither.
    refuses(body({ userId: "u1" }));
    refuses(body({ force: true }));
    refuses(body({ includeSession: true }));
    refuses({ Pins: [pin()], reader: READER }); // casing is a different field
  });

  it("refuses an unknown property INSIDE a pin", () => {
    // `guideVerison` is the expensive one: silently dropped, the answer would
    // be about `guideVersion: undefined` — a confident verdict about a
    // question nobody asked.
    refuses(body({ pins: [{ guideKey: "eec-c1", guideVerison: 1 }] }));
    refuses(body({ pins: [pin({ extra: 1 })] }));
    refuses(body({ pins: [pin(), pin({ sessionId: "ses_1" })] }));
  });

  it("refuses an array where an object belongs", () => {
    refuses([body()]);
    refuses(body({ pins: [[]] }));
  });

  it("is not fooled by a prototype-shaped payload", () => {
    // `JSON.parse` puts `__proto__` on the object as an own key, so it is an
    // unknown property like any other — refused, not silently absorbed.
    const reader = JSON.stringify(READER);
    refuses(
      JSON.parse(
        '{"pins":[{"guideKey":"eec","guideVersion":1}],"reader":' +
          reader +
          ',"__proto__":{"admin":true}}',
      ),
    );
    refuses(
      JSON.parse(
        '{"pins":[{"guideKey":"eec","guideVersion":1,"__proto__":{"a":1}}],' +
          '"reader":' +
          reader +
          "}",
      ),
    );
    // …and inside the reader, which is the newest object on this surface.
    refuses(
      JSON.parse(
        '{"pins":[{"guideKey":"eec","guideVersion":1}],"reader":' +
          '{"bookSlug":"libro","chapterOrder":1,"unitKey":"uk",' +
          '"__proto__":{"a":1}}}',
      ),
    );
  });

  it("refuses a missing or malformed reader context", () => {
    // The context is what makes a verdict about somewhere. Without it the
    // server would have to guess where the reader is, which is the guess #639
    // is about.
    refuses({ pins: [pin()] });
    refuses(body({ reader: null }));
    refuses(body({ reader: "emociones-en-construccion" }));
    refuses(body({ reader: [] }));
    refuses(body({ reader: { bookSlug: "libro", chapterOrder: 1 } }));
    refuses(body({ reader: { ...READER, bookSlug: "Libro" } }));
    refuses(body({ reader: { ...READER, bookSlug: "con espacios" } }));
    refuses(body({ reader: { ...READER, unitKey: "" } }));
    refuses(body({ reader: { ...READER, unitKey: "no válido" } }));
    for (const chapterOrder of [0, -1, 1.5, NaN, Infinity, "1", null, 10_001]) {
      refuses(body({ reader: { ...READER, chapterOrder } }));
    }
  });

  it("refuses an internal identifier inside the reader", () => {
    // The one field a client must never be able to name: `contentUnitId` is
    // the server's own identity for the unit, and accepting it would let a
    // caller assert which unit it is standing in.
    refuses(body({ reader: { ...READER, contentUnitId: "cu_1" } }));
    refuses(body({ reader: { ...READER, unitId: "cu_1" } }));
    refuses(body({ reader: { ...READER, revisionId: "rev_1" } }));
  });

  it("never echoes the rejected value", () => {
    try {
      parseGuideCardStatesBody(
        body({ pins: [pin({ guideKey: "SECRETO-Raro" })] }),
      );
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
