import type { PlanInfo } from "@psico/types";
import { apiClient } from "./client";

export type BillingInterval = "PRO_MONTHLY" | "PRO_YEARLY" | "B2B";

export interface CheckoutSession {
  url: string;
}

export const subscriptionApi = {
  getPlans: () => apiClient.get<PlanInfo[]>("/subscriptions/plans"),

  createCheckoutSession: (
    billingPlan: BillingInterval,
    successUrl: string,
    cancelUrl: string,
  ) =>
    apiClient.post<CheckoutSession>("/subscriptions/checkout", {
      billingPlan,
      successUrl,
      cancelUrl,
    }),
};
