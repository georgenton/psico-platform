import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorRevenueService } from "./author-revenue.service";

function makePrisma() {
  return {
    authorEarning: {
      findMany: vi.fn(),
    },
    authorPayoutSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe("AuthorRevenueService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: AuthorRevenueService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new AuthorRevenueService(prisma as never);
  });

  describe("getCobros", () => {
    it("empty state — no earnings + no settings → defaults", async () => {
      prisma.authorEarning.findMany.mockResolvedValue([]);
      prisma.authorPayoutSetting.findUnique.mockResolvedValue(null);
      const res = await svc.getCobros("u1");
      expect(res.summary.ytdNetCents).toBe(0);
      expect(res.summary.lastMonthNetCents).toBe(0);
      expect(res.summary.pendingNetCents).toBe(0);
      expect(res.monthly).toHaveLength(0);
      expect(res.settings.method).toBe("manual");
      expect(res.settings.details).toEqual({});
    });

    it("aggregates rows by month + sorts newest first", async () => {
      const now = new Date();
      const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const lastMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );
      prisma.authorEarning.findMany.mockResolvedValue([
        {
          month: lastMonth,
          grossCents: 10000,
          platformFeeCents: 3000,
          netCents: 7000,
          status: "PAID",
          paidAt: lastMonth,
          paymentReference: "TX-001",
        },
        {
          month: thisMonth,
          grossCents: 20000,
          platformFeeCents: 6000,
          netCents: 14000,
          status: "PENDING",
          paidAt: null,
          paymentReference: null,
        },
      ]);
      prisma.authorPayoutSetting.findUnique.mockResolvedValue(null);
      const res = await svc.getCobros("u1");
      expect(res.monthly).toHaveLength(2);
      expect(res.monthly[0].month.getTime()).toBeGreaterThan(
        res.monthly[1].month.getTime(),
      );
      expect(res.summary.lastMonthNetCents).toBe(7000);
      expect(res.summary.pendingNetCents).toBe(14000);
    });

    it("collapses multiple rows in the same month + flips bucket to PENDING when any row pends", async () => {
      const month = new Date(Date.UTC(2026, 0, 1));
      prisma.authorEarning.findMany.mockResolvedValue([
        {
          month,
          grossCents: 5000,
          platformFeeCents: 1500,
          netCents: 3500,
          status: "PAID",
          paidAt: month,
          paymentReference: "TX-A",
        },
        {
          month,
          grossCents: 5000,
          platformFeeCents: 1500,
          netCents: 3500,
          status: "PENDING",
          paidAt: null,
          paymentReference: null,
        },
      ]);
      prisma.authorPayoutSetting.findUnique.mockResolvedValue(null);
      const res = await svc.getCobros("u1");
      expect(res.monthly).toHaveLength(1);
      expect(res.monthly[0].netCents).toBe(7000);
      expect(res.monthly[0].status).toBe("PENDING");
    });

    it("YTD only includes current fiscal year", async () => {
      const lastYear = new Date(Date.UTC(2025, 5, 1));
      const thisYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
      prisma.authorEarning.findMany.mockResolvedValue([
        {
          month: lastYear,
          grossCents: 9999,
          platformFeeCents: 0,
          netCents: 9999,
          status: "PAID",
          paidAt: lastYear,
          paymentReference: null,
        },
        {
          month: thisYear,
          grossCents: 1000,
          platformFeeCents: 0,
          netCents: 1000,
          status: "PAID",
          paidAt: thisYear,
          paymentReference: null,
        },
      ]);
      prisma.authorPayoutSetting.findUnique.mockResolvedValue(null);
      const res = await svc.getCobros("u1");
      expect(res.summary.ytdNetCents).toBe(1000);
    });

    it("exposes existing settings", async () => {
      prisma.authorEarning.findMany.mockResolvedValue([]);
      prisma.authorPayoutSetting.findUnique.mockResolvedValue({
        method: "paypal",
        details: { email: "autor@x.com" },
        taxId: "0900000001",
        legalName: "Alice Author",
        legalAddress: "Quito, EC",
        updatedAt: new Date(),
      });
      const res = await svc.getCobros("u1");
      expect(res.settings.method).toBe("paypal");
      expect(res.settings.details).toEqual({ email: "autor@x.com" });
      expect(res.settings.legalName).toBe("Alice Author");
    });
  });

  describe("updatePayoutSettings", () => {
    it("upserts with method + details + tax info", async () => {
      const stored = {
        method: "bank_ec",
        details: { iban: "EC0000" },
        taxId: "0900000002",
        legalName: "Alice",
        legalAddress: null,
        updatedAt: new Date(),
      };
      prisma.authorPayoutSetting.upsert.mockResolvedValue(stored);
      const res = await svc.updatePayoutSettings("u1", {
        method: "bank_ec",
        details: { iban: "EC0000" },
        taxId: "0900000002",
        legalName: "Alice",
      });
      expect(res.ok).toBe(true);
      expect(res.settings.method).toBe("bank_ec");
      const args = prisma.authorPayoutSetting.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ authorUserId: "u1" });
      expect(args.create.method).toBe("bank_ec");
      expect(args.update.method).toBe("bank_ec");
    });

    it("defaults details to {} when not provided", async () => {
      prisma.authorPayoutSetting.upsert.mockResolvedValue({
        method: "manual",
        details: {},
        taxId: null,
        legalName: null,
        legalAddress: null,
        updatedAt: new Date(),
      });
      await svc.updatePayoutSettings("u1", { method: "manual" });
      const args = prisma.authorPayoutSetting.upsert.mock.calls[0][0];
      expect(args.create.details).toEqual({});
    });
  });
});
