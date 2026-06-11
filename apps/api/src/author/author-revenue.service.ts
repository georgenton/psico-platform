import { Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type { UpdatePayoutSettingsDto } from "./dto/update-payout-settings.dto";

export interface MonthlyRow {
  month: Date;
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  status: "PENDING" | "PAID";
  paidAt: Date | null;
  paymentReference: string | null;
}

export interface RevenueSummary {
  /** Suma de netCents YTD (año en curso). */
  ytdNetCents: number;
  /** Suma del último mes calendario completado. */
  lastMonthNetCents: number;
  /** Suma de earnings con status=PENDING. */
  pendingNetCents: number;
  /** Año en uso para YTD (UTC). */
  fiscalYear: number;
}

export interface RevenueResponse {
  summary: RevenueSummary;
  monthly: MonthlyRow[];
  settings: {
    method: "bank_ec" | "paypal" | "payphone" | "manual";
    details: Record<string, unknown>;
    taxId: string | null;
    legalName: string | null;
    legalAddress: string | null;
    updatedAt: Date | null;
  };
}

/**
 * AuthorRevenueService — Sprint S71.C-revenue.
 *
 * Surface read-only para el autor: earnings mensuales agregados +
 * configuración de payout. La inserción real de `AuthorEarning` rows
 * viene del back-office (Pulso) o de un job futuro de agregación
 * (deuda S71.D).
 *
 * Por qué CENTS y no DECIMAL: PrismaJS sin decimal nativo confiable
 * across drivers + JSON serialization a float drift. Cents enteros
 * dejan la matemática exacta. Frontend formatea a 2 decimales.
 */
@Injectable()
export class AuthorRevenueService {
  private readonly logger = new Logger("AuthorRevenueService");

  constructor(private readonly prisma: PrismaService) {}

  async getCobros(userId: string): Promise<RevenueResponse> {
    const [rows, settings] = await Promise.all([
      this.prisma.authorEarning.findMany({
        where: { authorUserId: userId },
        orderBy: { month: "desc" },
        take: 36, // últimos 3 años
      }),
      this.prisma.authorPayoutSetting.findUnique({
        where: { authorUserId: userId },
      }),
    ]);

    const now = new Date();
    const fiscalYear = now.getUTCFullYear();
    const lastMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );

    const summary: RevenueSummary = {
      fiscalYear,
      ytdNetCents: 0,
      lastMonthNetCents: 0,
      pendingNetCents: 0,
    };

    const monthly: MonthlyRow[] = [];
    const byMonth = new Map<string, MonthlyRow>();

    for (const r of rows) {
      const key = monthKey(r.month);
      const existing = byMonth.get(key);
      if (existing) {
        existing.grossCents += r.grossCents;
        existing.platformFeeCents += r.platformFeeCents;
        existing.netCents += r.netCents;
        // Status: if any row of the month is PENDING, the bucket is PENDING.
        if (existing.status === "PAID" && r.status === "PENDING") {
          existing.status = "PENDING";
        }
      } else {
        byMonth.set(key, {
          month: r.month,
          grossCents: r.grossCents,
          platformFeeCents: r.platformFeeCents,
          netCents: r.netCents,
          status: r.status,
          paidAt: r.paidAt,
          paymentReference: r.paymentReference,
        });
      }

      if (r.month.getUTCFullYear() === fiscalYear) {
        summary.ytdNetCents += r.netCents;
      }
      if (sameUtcMonth(r.month, lastMonth)) {
        summary.lastMonthNetCents += r.netCents;
      }
      if (r.status === "PENDING") {
        summary.pendingNetCents += r.netCents;
      }
    }

    for (const v of byMonth.values()) monthly.push(v);
    monthly.sort((a, b) => b.month.getTime() - a.month.getTime());

    return {
      summary,
      monthly,
      settings: {
        method:
          (settings?.method as
            | "bank_ec"
            | "paypal"
            | "payphone"
            | "manual"
            | undefined) ?? "manual",
        details: (settings?.details as Record<string, unknown>) ?? {},
        taxId: settings?.taxId ?? null,
        legalName: settings?.legalName ?? null,
        legalAddress: settings?.legalAddress ?? null,
        updatedAt: settings?.updatedAt ?? null,
      },
    };
  }

  async updatePayoutSettings(userId: string, dto: UpdatePayoutSettingsDto) {
    const data = {
      method: dto.method,
      details: (dto.details ?? {}) as never,
      taxId: dto.taxId ?? null,
      legalName: dto.legalName ?? null,
      legalAddress: dto.legalAddress ?? null,
    };

    const settings = await this.prisma.authorPayoutSetting.upsert({
      where: { authorUserId: userId },
      create: { authorUserId: userId, ...data },
      update: data,
    });

    this.logger.log(
      `[author-revenue] payout settings updated user=${userId} method=${dto.method}`,
    );

    return {
      ok: true as const,
      settings: {
        method: settings.method,
        details: settings.details as Record<string, unknown>,
        taxId: settings.taxId,
        legalName: settings.legalName,
        legalAddress: settings.legalAddress,
        updatedAt: settings.updatedAt,
      },
    };
  }
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function sameUtcMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}
