import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Query params for `GET /api/billing/invoices` (and the deprecated
 * `/api/subscriptions/invoices`).
 *
 * Stripe caps `limit` at 100 per page; we expose 50 because Mi Plan
 * never shows more than ~12 invoices and a paginated fetch UX hasn't
 * been designed yet. Defaults to 12 server-side if omitted.
 */
export class ListInvoicesQueryDto {
  /**
   * Max number of invoices to fetch (1–50). Default 12 when omitted —
   * matches the row count of the Mi Plan invoice table.
   *
   * Stripe returns newest-first; no cursor is exposed yet (single-page
   * UX). When pagination is needed, add `starting_after`.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
