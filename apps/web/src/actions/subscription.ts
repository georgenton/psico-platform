"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  BillingInterval,
  CancelSubscriptionResponse,
  CheckoutSessionResponse,
  PortalSessionResponse,
  ReactivateSubscriptionResponse,
} from "@psico/types";

import { serverFetch } from "@/lib/api.server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function createCheckoutAction(
  billingPlan: BillingInterval,
): Promise<void> {
  const { url } = await serverFetch<CheckoutSessionResponse>(
    "/subscriptions/checkout",
    {
      method: "POST",
      body: {
        billingPlan,
        successUrl: `${APP_URL}/dashboard/plan?upgraded=true`,
        cancelUrl: `${APP_URL}/dashboard/plan`,
      },
    },
  );
  redirect(url);
}

export async function createPortalAction(): Promise<void> {
  const { url } = await serverFetch<PortalSessionResponse>(
    "/subscriptions/portal",
    {
      method: "POST",
      body: { returnUrl: `${APP_URL}/dashboard/plan` },
    },
  );
  redirect(url);
}

// ─── Sprint front-fase1 ────────────────────────────────────────────────────
//
// `cancelSubscriptionAction` and `reactivateSubscriptionAction` accept the
// optional cancellation reason from a Server-Action `<form action={...}>`.
// Both revalidate `/dashboard/plan` so the page re-renders with fresh
// `/subscriptions/me` + `/usage` data after the round trip.

/**
 * Cancel the user's active subscription at the period end. Idempotent on
 * the server side; we don't pre-gate by `cancelAtPeriodEnd` here because
 * the server already does (`SUBSCRIPTION_NOT_CANCELLABLE`).
 */
export async function cancelSubscriptionAction(
  formData: FormData,
): Promise<void> {
  const reason = formData.get("reason");
  const body = reason && typeof reason === "string" ? { reason } : {};
  await serverFetch<CancelSubscriptionResponse>("/subscriptions/cancel", {
    method: "POST",
    body,
  });
  revalidatePath("/dashboard/plan");
}

/**
 * Reactivate a subscription pending cancellation. No payload needed.
 */
export async function reactivateSubscriptionAction(): Promise<void> {
  await serverFetch<ReactivateSubscriptionResponse>(
    "/subscriptions/reactivate",
    { method: "POST", body: {} },
  );
  revalidatePath("/dashboard/plan");
}
