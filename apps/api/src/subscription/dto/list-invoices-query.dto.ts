import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Query params for `GET /api/subscriptions/invoices`.
 *
 * Stripe caps `limit` at 100 per page; we expose 50 because Mi Plan never
 * shows more than ~12 and a paginated fetch UX hasn't been designed yet.
 */
export class ListInvoicesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
