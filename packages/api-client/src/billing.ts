import type {
  BillingReturnResponse,
  CancelSubscriptionRequest,
  CancelSubscriptionResponse,
  InvoiceListResponse,
  PatchSubscriptionRequest,
  PlanInfo,
  PlanResponse,
  PortalSessionResponse,
  ReactivateSubscriptionResponse,
  Subscription,
  UsageResponse,
} from "@psico/types";
import { apiClient } from "./client";

export type BillingInterval = "PRO_MONTHLY" | "PRO_YEARLY" | "B2B";

export interface CheckoutSession {
  url: string;
}

/**
 * Sprint S11 — canonical billing client. Replaces `subscriptionApi`.
 *
 * Routes under `/api/billing/*` per design 09-plan.md plus the top-level
 * `/api/plan` aggregator. The legacy `subscriptionApi` is kept as a thin
 * deprecated re-export for the 90-day deprecation window.
 *
 * Migration tips:
 *   - Mi Plan screen: drop the four parallel fetches and use `getPlan()`.
 *   - Cancel + reactivate flows: prefer `patchSubscription({ action })`
 *     over the legacy POSTs. The POSTs keep working but the PATCH is what
 *     the design models and what future actions (switch-plan) will live in.
 *   - Stripe success page: hit `getReturn(sessionId)` once instead of
 *     polling `getMySubscription()` — the webhook is the source of truth
 *     for the DB, this endpoint just gives you the right UI cue without
 *     racing it.
 */
export const billingApi = {
  // ── Top-level aggregator (the design's main read) ───────────────────────

  /** One request returns sub + usage + invoices + catalog. */
  getPlan: () => apiClient.get<PlanResponse>("/plan"),

  // ── Public catalog ──────────────────────────────────────────────────────

  getPlans: () => apiClient.get<PlanInfo[]>("/billing/plans"),

  // ── Authenticated reads ─────────────────────────────────────────────────

  getMySubscription: () => apiClient.get<Subscription | null>("/billing/me"),

  getUsage: () => apiClient.get<UsageResponse>("/billing/usage"),

  listInvoices: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : "";
    return apiClient.get<InvoiceListResponse>(`/billing/invoices${qs}`);
  },

  // ── Stripe interaction ──────────────────────────────────────────────────

  createCheckoutSession: (
    billingPlan: BillingInterval,
    successUrl: string,
    cancelUrl: string,
  ) =>
    apiClient.post<CheckoutSession>("/billing/checkout-session", {
      billingPlan,
      successUrl,
      cancelUrl,
    }),

  createPortalSession: (returnUrl: string) =>
    apiClient.post<PortalSessionResponse>("/billing/customer-portal", {
      returnUrl,
    }),

  /**
   * Stripe success callback. Pass the `session_id` Stripe appends to your
   * configured `successUrl`. Returns a status the front can render
   * (success / processing / failed) plus the user's current tier.
   */
  getReturn: (sessionId: string) =>
    apiClient.get<BillingReturnResponse>(
      `/billing/return?session_id=${encodeURIComponent(sessionId)}`,
    ),

  // ── Mutations ───────────────────────────────────────────────────────────

  /**
   * Consolidated mutation per design 09-plan.md §"Acciones del usuario".
   * The legacy `cancel` + `reactivate` POSTs still work for now.
   */
  patchSubscription: (body: PatchSubscriptionRequest) =>
    apiClient.patch<
      | CancelSubscriptionResponse
      | ReactivateSubscriptionResponse
      | { ok: true; switched: true; newPlanId: string }
    >("/billing/subscription", body),

  /** Legacy compat — prefer `patchSubscription({action:'cancel'})`. */
  cancel: (body: CancelSubscriptionRequest = {}) =>
    apiClient.post<CancelSubscriptionResponse>("/billing/cancel", body),

  /** Legacy compat — prefer `patchSubscription({action:'reactivate'})`. */
  reactivate: () =>
    apiClient.post<ReactivateSubscriptionResponse>("/billing/reactivate", {}),
};
