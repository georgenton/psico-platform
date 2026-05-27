import type {
  CancelSubscriptionRequest,
  CancelSubscriptionResponse,
  InvoiceListResponse,
  PlanInfo,
  PortalSessionResponse,
  ReactivateSubscriptionResponse,
  UsageResponse,
} from "@psico/types";
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

  // ─── Sprint S7 ──────────────────────────────────────────────────────────

  /** Stripe Customer Portal session. The browser should redirect to .url. */
  createPortalSession: (returnUrl: string) =>
    apiClient.post<PortalSessionResponse>("/subscriptions/portal", {
      returnUrl,
    }),

  /** Aggregated usage for the current billing period. */
  getUsage: () => apiClient.get<UsageResponse>("/subscriptions/usage"),

  /** Most recent invoices (default 12 — Mi Plan caps at that). */
  listInvoices: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : "";
    return apiClient.get<InvoiceListResponse>(`/subscriptions/invoices${qs}`);
  },

  /** Cancel at period end. Stripe + local mirror flip together. */
  cancel: (body: CancelSubscriptionRequest = {}) =>
    apiClient.post<CancelSubscriptionResponse>("/subscriptions/cancel", body),

  /** Reactivate a sub that was pending cancellation. Idempotent. */
  reactivate: () =>
    apiClient.post<ReactivateSubscriptionResponse>(
      "/subscriptions/reactivate",
      {},
    ),
};
