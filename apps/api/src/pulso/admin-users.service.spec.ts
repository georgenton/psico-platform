import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUsersService } from "./admin-users.service";

function makePrisma() {
  return {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    roleChangeLog: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

describe("AdminUsersService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: AdminUsersService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new AdminUsersService(prisma as never);
  });

  describe("listUsers", () => {
    it("default limit 50, no filters", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await svc.listUsers({});
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
      expect(args.take).toBe(50);
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    });

    it("limit cap at 200", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await svc.listUsers({ limit: 999 });
      expect(prisma.user.findMany.mock.calls[0][0].take).toBe(200);
    });

    it("q substring matches email + name (case-insensitive)", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await svc.listUsers({ q: " jorge " });
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { email: { contains: "jorge", mode: "insensitive" } },
        { name: { contains: "jorge", mode: "insensitive" } },
      ]);
    });

    it("role filter exact", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await svc.listUsers({ role: "AUTHOR" });
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        role: "AUTHOR",
      });
    });

    it("returns total + items shape", async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "a@p.com", role: "USER" },
      ]);
      const res = await svc.listUsers({});
      expect(res.total).toBe(1);
      expect(res.items[0].email).toBe("a@p.com");
    });
  });

  describe("getRecentRoleChanges", () => {
    it("limited to 20 newest-first for target", async () => {
      prisma.roleChangeLog.findMany.mockResolvedValue([]);
      await svc.getRecentRoleChanges("u1");
      expect(prisma.roleChangeLog.findMany).toHaveBeenCalledWith({
        where: { targetUserId: "u1" },
        orderBy: { changedAt: "desc" },
        take: 20,
      });
    });
  });

  describe("changeRole", () => {
    it("404 when user not found", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        svc.changeRole("u404", "admin1", "AUTHOR", undefined),
      ).rejects.toThrow(/USER_NOT_FOUND/);
    });

    it("409 CANNOT_DEMOTE_SELF when admin demotes themselves", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "admin1",
        role: "ADMIN",
        email: "a@p.com",
      });
      await expect(
        svc.changeRole("admin1", "admin1", "USER", undefined),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "CANNOT_DEMOTE_SELF" }),
      });
    });

    it("idempotent when target already has the role (no log)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        role: "AUTHOR",
        email: "a@p.com",
      });
      const res = await svc.changeRole("u1", "admin1", "AUTHOR", undefined);
      expect(res.changed).toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("USER → AUTHOR promotes + logs", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        role: "USER",
        email: "a@p.com",
      });
      const res = await svc.changeRole(
        "u1",
        "admin1",
        "AUTHOR",
        "B2B onboarding",
      );
      expect(res.changed).toBe(true);
      expect(res.role).toBe("AUTHOR");
      expect(res.oldRole).toBe("USER");
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("admin can keep being ADMIN (re-set to same role)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "admin1",
        role: "ADMIN",
        email: "a@p.com",
      });
      const res = await svc.changeRole("admin1", "admin1", "ADMIN", undefined);
      expect(res.changed).toBe(false);
    });

    it("admin can demote ANOTHER admin (not self)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "other-admin",
        role: "ADMIN",
        email: "b@p.com",
      });
      const res = await svc.changeRole(
        "other-admin",
        "admin1",
        "USER",
        "rotación de equipo",
      );
      expect(res.changed).toBe(true);
      expect(res.role).toBe("USER");
    });
  });
});
