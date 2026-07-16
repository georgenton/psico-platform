import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy, type JwtPayload } from "./jwt.strategy";

/**
 * ADR 0015 — JwtStrategy now does a DB lookup on every request so server-side
 * state (disabled, revision bumped) invalidates a still-unexpired token.
 */
describe("JwtStrategy.validate (ADR 0015)", () => {
  const findUnique = vi.fn();
  const prisma = { user: { findUnique } } as never;
  const config = {
    get: vi.fn().mockReturnValue("test-secret-at-least-32-chars-long!!"),
  } as never;

  let strategy: JwtStrategy;

  const basePayload: JwtPayload = {
    sub: "user-1",
    email: "user@example.com",
    role: "USER",
    plan: "FREE",
    ar: 0,
  };

  const dbUser = {
    id: "user-1",
    email: "user@example.com",
    role: "USER",
    plan: "FREE",
    isActive: true,
    authRevision: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new JwtStrategy(config, prisma);
  });

  it("authorizes when the user is active and the revision matches", async () => {
    findUnique.mockResolvedValue(dbUser);
    const result = await strategy.validate(basePayload);
    expect(result).toEqual({
      userId: "user-1",
      email: "user@example.com",
      role: "USER",
      plan: "FREE",
    });
  });

  it("401 when the token carries no `ar` claim (legacy token)", async () => {
    const legacy = { ...basePayload } as Partial<JwtPayload>;
    delete legacy.ar;
    await expect(strategy.validate(legacy as JwtPayload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("401 when the token carries no `sub`", async () => {
    await expect(
      strategy.validate({ ...basePayload, sub: "" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("401 when the user no longer exists", async () => {
    findUnique.mockResolvedValue(null);
    await expect(strategy.validate(basePayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("401 when the account is inactive (disabled) — even if the revision matches", async () => {
    findUnique.mockResolvedValue({ ...dbUser, isActive: false });
    await expect(strategy.validate(basePayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("401 when the revision was bumped after the token was issued", async () => {
    // token was minted at ar=0; a password change / logout-all bumped it to 1.
    findUnique.mockResolvedValue({ ...dbUser, authRevision: 1 });
    await expect(strategy.validate(basePayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("ar=0 is a valid revision (fresh account), not treated as missing", async () => {
    findUnique.mockResolvedValue(dbUser);
    await expect(strategy.validate(basePayload)).resolves.toBeTruthy();
  });
});
