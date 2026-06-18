import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PasswordChangeWithRekeyDto } from "./password-change-with-rekey.dto";

/**
 * DTO-level tests for the rekey body, focused on the salt-length bound
 * that broke every real rekey in prod before `fix-salt-length-dto`.
 *
 * Background: the DTO used to validate `newCryptoSalt` with
 * `Length(24, 28)`, but `auth.service` produces salts via Node
 * `randomBytes(16).toString("base64url")` → 22 chars. Any user trying to
 * rekey hit a 400 before the service even saw the request. We loosened
 * the bound to `Length(22, 28)`. These tests lock that in.
 */

function buildBody(overrides: Partial<PasswordChangeWithRekeyDto> = {}) {
  return plainToInstance(PasswordChangeWithRekeyDto, {
    currentPassword: "OldPassword123!",
    newPassword: "NewPassword456!",
    newCryptoSalt: "a".repeat(22), // realistic 16-byte b64url unpadded length
    reencryptedEntries: [],
    ...overrides,
  });
}

async function firstSaltError(dto: PasswordChangeWithRekeyDto) {
  const errs = await validate(dto);
  return errs.find((e) => e.property === "newCryptoSalt");
}

describe("PasswordChangeWithRekeyDto · salt length validation", () => {
  it("accepts a 22-char base64url salt (what auth actually produces)", async () => {
    expect(await firstSaltError(buildBody())).toBeUndefined();
  });

  it("accepts a 24-char salt (forward compat: future 18-byte clients)", async () => {
    expect(
      await firstSaltError(buildBody({ newCryptoSalt: "a".repeat(24) })),
    ).toBeUndefined();
  });

  it("accepts a 28-char salt (upper bound)", async () => {
    expect(
      await firstSaltError(buildBody({ newCryptoSalt: "a".repeat(28) })),
    ).toBeUndefined();
  });

  it("rejects a 21-char salt — too small for 128-bit floor", async () => {
    const err = await firstSaltError(
      buildBody({ newCryptoSalt: "a".repeat(21) }),
    );
    expect(err?.constraints).toBeDefined();
  });

  it("rejects a 29-char salt — likely client bug", async () => {
    const err = await firstSaltError(
      buildBody({ newCryptoSalt: "a".repeat(29) }),
    );
    expect(err?.constraints).toBeDefined();
  });

  it("rejects non-base64url characters even at the right length", async () => {
    const err = await firstSaltError(
      // 22 chars but with `+` and `/` (raw base64, not base64url)
      buildBody({ newCryptoSalt: "+/=" + "a".repeat(19) }),
    );
    expect(err?.constraints).toBeDefined();
  });
});
