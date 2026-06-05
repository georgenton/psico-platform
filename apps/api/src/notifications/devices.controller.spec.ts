import { beforeEach, describe, expect, it, vi } from "vitest";
import { DevicesController } from "./devices.controller";

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    deviceToken: {
      upsert: vi.fn().mockResolvedValue({ id: "dt-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  } as unknown as ConstructorParameters<typeof DevicesController>[0];
}

describe("DevicesController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts on (token) so re-registering the same device is idempotent", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "dt-1" });
    const ctrl = new DevicesController(
      buildPrisma({
        deviceToken: { upsert, deleteMany: vi.fn() } as never,
      }),
    );

    const res = await ctrl.register(
      { sub: "u-1" },
      { platform: "EXPO", token: "ExponentPushToken[x]" },
    );

    expect(res).toEqual({ id: "dt-1" });
    expect(upsert).toHaveBeenCalledOnce();
    const args = upsert.mock.calls[0]![0] as {
      where: { token: string };
      create: { userId: string };
      update: { userId: string };
    };
    expect(args.where).toEqual({ token: "ExponentPushToken[x]" });
    // Re-claim by current user (account switch on same device).
    expect(args.create.userId).toBe("u-1");
    expect(args.update.userId).toBe("u-1");
  });

  it("unregister scopes deleteMany to owner — no cross-account deletion", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const ctrl = new DevicesController(
      buildPrisma({
        deviceToken: { upsert: vi.fn(), deleteMany } as never,
      }),
    );

    await ctrl.unregister({ sub: "u-1" }, "dt-1");

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "dt-1", userId: "u-1" },
    });
  });
});
