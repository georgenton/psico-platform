import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAad,
  CIRCLES_KEY_ENV,
  CirclesCipher,
  CirclesCryptoError,
  parseCirclesKey,
  resolveCirclesCipher,
  type CircleEnvelopeContext,
} from "./circles-crypto";

/**
 * The AEAD envelope (PR3 · spec §G).
 *
 * What is under test is not "does AES work" — it does. It is the BINDING: the
 * additional authenticated data ties a ciphertext to the circle, activity,
 * participant, template pin, sharing mode and field keys it was written for.
 * Move the row, swap two people's envelopes, or edit `fieldKeys` afterwards,
 * and it stops opening. Not because a check noticed — because the tag no longer
 * verifies, which an attacker with database write access cannot forge.
 */

const KEY = randomBytes(32);
const cipher = new CirclesCipher(KEY);

const context = (
  over: Partial<CircleEnvelopeContext> = {},
): CircleEnvelopeContext => ({
  circleId: "c-1",
  activityId: "act-1",
  participantId: "p-1",
  templateKey: "tpl",
  templateVersion: 1,
  sharingMode: "SELECTED_FIELDS",
  fieldKeys: ["campo-a"],
  ...over,
});

const BODY = JSON.stringify({
  mode: "SELECTED_FIELDS",
  fields: [{ fieldKey: "campo-a", value: "algo íntimo" }],
});

describe("circles crypto · the envelope binds where it belongs", () => {
  it("round-trips under the exact context it was sealed for", () => {
    const sealed = cipher.seal(BODY, context());
    expect(cipher.open(sealed, context())).toBe(BODY);
  });

  it("never stores the plaintext", () => {
    const sealed = cipher.seal(BODY, context());
    expect(sealed.ciphertext).not.toContain("algo íntimo");
    expect(sealed.ciphertext).not.toContain(BODY);
    expect(sealed.payloadHash).not.toContain("algo íntimo");
  });

  it.each([
    ["another circle", { circleId: "c-2" }],
    ["another activity", { activityId: "act-2" }],
    ["another participant", { participantId: "p-2" }],
    ["another template", { templateKey: "otra" }],
    ["another template version", { templateVersion: 2 }],
    ["another sharing mode", { sharingMode: "EDITED_SUMMARY" }],
    ["edited field keys", { fieldKeys: ["campo-a", "campo-b"] }],
  ])("refuses to open under %s", (_label, over) => {
    const sealed = cipher.seal(BODY, context());
    // This is the case that matters most: one person's envelope must not
    // decrypt as another's, even for somebody who can write to the database.
    expect(() => cipher.open(sealed, context(over))).toThrow(
      CirclesCryptoError,
    );
  });

  it("orders field keys canonically, so two clients agree", () => {
    // The AAD binds the keys. If their order mattered, the same answer sent
    // with keys in a different order would produce an envelope that later
    // refuses to open — a bug that only appears once real data exists.
    const a = buildAad(context({ fieldKeys: ["b", "a"] }));
    const b = buildAad(context({ fieldKeys: ["a", "b"] }));
    expect(a.equals(b)).toBe(true);
  });

  it("keeps the payload hash keyed, not a bare digest of the answer", () => {
    // A plain SHA-256 of an intimate answer is a lookup key: the corpus is
    // small, so hash the guesses and match the column. Two ciphers with
    // different keys must produce different hashes for the same body.
    const other = new CirclesCipher(randomBytes(32));
    expect(cipher.macOf(BODY, context())).not.toBe(
      other.macOf(BODY, context()),
    );
    // And it is bound to the same context as the ciphertext.
    expect(cipher.macOf(BODY, context())).not.toBe(
      cipher.macOf(BODY, context({ participantId: "p-2" })),
    );
  });

  it("rejects a tampered ciphertext with the one opaque code", () => {
    const sealed = cipher.seal(BODY, context());
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(() =>
      cipher.open(
        { ...sealed, ciphertext: bytes.toString("base64") },
        context(),
      ),
    ).toThrow(CirclesCryptoError);
  });
});

describe("circles crypto · the key, and the posture that decides it", () => {
  it("refuses a missing or malformed key, without echoing it", () => {
    for (const raw of [undefined, "", "   ", "not-base64!!", "c2hvcnQ="]) {
      let code = "";
      try {
        parseCirclesKey(raw);
      } catch (err) {
        code = (err as CirclesCryptoError).code;
      }
      expect(["CIRCLES_KEY_MISSING", "CIRCLES_KEY_INVALID"]).toContain(code);
    }
  });

  it("boots under `off` with no key at all", () => {
    // A closed surface must not be able to keep a deployment down over a key it
    // will never use. This is the exact posture production is in.
    expect(resolveCirclesCipher({}, "off")).toBeNull();
    expect(
      resolveCirclesCipher({ [CIRCLES_KEY_ENV]: "garbage" }, "off"),
    ).toBeNull();
  });

  it("fails the boot under `pilot` or `on` without a usable key", () => {
    // Not the first request, and not silently: a surface that is supposed to
    // encrypt what two people share must not come up if it cannot. There is no
    // ephemeral fallback — one would produce ciphertext nobody can read after a
    // restart, which is data loss wearing the costume of resilience.
    for (const mode of ["pilot", "on"] as const) {
      expect(() => resolveCirclesCipher({}, mode)).toThrow(CirclesCryptoError);
      expect(() =>
        resolveCirclesCipher({ [CIRCLES_KEY_ENV]: "too-short" }, mode),
      ).toThrow(CirclesCryptoError);
      expect(
        resolveCirclesCipher(
          { [CIRCLES_KEY_ENV]: KEY.toString("base64") },
          mode,
        ),
      ).toBeInstanceOf(CirclesCipher);
    }
  });
});
