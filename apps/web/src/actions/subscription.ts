"use server";

import { redirect } from "next/navigation";
import type {
  BillingInterval,
  CheckoutSessionResponse,
  PortalSessionResponse,
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
