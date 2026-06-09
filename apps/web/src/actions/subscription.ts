"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type {
  BillingInterval,
  CancelSubscriptionResponse,
  CheckoutSessionResponse,
  PortalSessionResponse,
  ReactivateSubscriptionResponse,
} from "@psico/types";

import { serverFetch } from "@/lib/api.server";

/**
 * Resolve the absolute origin (e.g. `https://psico-platform-web.vercel.app`)
 * for the current request.
 *
 * Order of precedence:
 *   1. `NEXT_PUBLIC_APP_URL` env var — explicit override, useful for
 *      preview deploys that should redirect somewhere stable.
 *   2. Request headers (`x-forwarded-proto` + `x-forwarded-host`) — set
 *      by Vercel's edge and by Next.js in dev. This is what we want by
 *      default: the user lands back wherever they came from.
 *   3. Fallback to `http://localhost:3000` for tests / non-request
 *      contexts. The backend rejects localhost via `@IsUrl()` so this
 *      path should only fire in local development.
 *
 * Bug fix (2026-06-09): previously we hardcoded
 * `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`. When the
 * env var was missing on Vercel the localhost fallback got sent to the
 * backend which rejected it with `VALIDATION_ERROR: successUrl must be a
 * valid URL`. By deriving the origin from headers we make checkout work
 * out of the box wherever it's deployed.
 */
async function resolveAppOrigin(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit.replace(/\/$/, "");
  }
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  } catch {
    // headers() throws outside of a request context (e.g. unit tests).
  }
  return "http://localhost:3000";
}

export async function createCheckoutAction(
  billingPlan: BillingInterval,
): Promise<void> {
  const origin = await resolveAppOrigin();
  const { url } = await serverFetch<CheckoutSessionResponse>(
    "/subscriptions/checkout",
    {
      method: "POST",
      body: {
        billingPlan,
        successUrl: `${origin}/dashboard/plan?upgraded=true`,
        cancelUrl: `${origin}/dashboard/plan`,
      },
    },
  );
  redirect(url);
}

export async function createPortalAction(): Promise<void> {
  const origin = await resolveAppOrigin();
  const { url } = await serverFetch<PortalSessionResponse>(
    "/subscriptions/portal",
    {
      method: "POST",
      body: { returnUrl: `${origin}/dashboard/plan` },
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
