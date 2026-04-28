import { IsEnum, IsUrl } from "class-validator";

export enum BillingPlan {
  PRO_MONTHLY = "PRO_MONTHLY",
  PRO_YEARLY = "PRO_YEARLY",
  B2B = "B2B",
}

export class CreateCheckoutSessionDto {
  @IsEnum(BillingPlan)
  billingPlan!: BillingPlan;

  @IsUrl({}, { message: "successUrl must be a valid URL" })
  successUrl!: string;

  @IsUrl({}, { message: "cancelUrl must be a valid URL" })
  cancelUrl!: string;
}
