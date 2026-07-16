import { describe, it, expect, vi } from "vitest";
import { revokeAllUserSessions } from "./session-revocation";

describe("revokeAllUserSessions (ADR 0015)", () => {
  function makeTx() {
    return {
      user: { update: vi.fn().mockResolvedValue({}) },
      refreshToken: {
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    };
  }

  it("bumps authRevision by 1 for the user", async () => {
    const tx = makeTx();
    await revokeAllUserSessions(tx, "user-1");
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { authRevision: { increment: 1 } },
    });
  });

  it("deletes every refresh token for the user", async () => {
    const tx = makeTx();
    await revokeAllUserSessions(tx, "user-1");
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("bumps the revision BEFORE deleting tokens (both, in order)", async () => {
    const tx = makeTx();
    const order: string[] = [];
    tx.user.update.mockImplementation(async () => {
      order.push("bump");
      return {};
    });
    tx.refreshToken.deleteMany.mockImplementation(async () => {
      order.push("delete");
      return { count: 0 };
    });
    await revokeAllUserSessions(tx, "user-1");
    expect(order).toEqual(["bump", "delete"]);
  });
});
