import type { Metadata } from "next";
import type { PlanInfo, Subscription } from "@psico/types";

import { ApiError } from "@/lib/api";
import { serverFetch, getSessionUser } from "@/lib/api.server";
import {
  createCheckoutAction,
  createPortalAction,
} from "@/actions/subscription";

export const metadata: Metadata = { title: "Mi plan" };

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Upgrade card (shown to FREE users) ────────────────────────────────────

function UpgradeCard({
  plan,
  isFeatured,
}: {
  plan: PlanInfo;
  isFeatured: boolean;
}) {
  const isMonthly = plan.plan === "PRO";
  const billingPlan = isMonthly ? "PRO_MONTHLY" : "PRO_YEARLY";
  const priceLabel = plan.prices.monthly
    ? `$${plan.prices.monthly}/mes`
    : `$${plan.prices.yearly}/año`;

  const checkoutWithPlan = createCheckoutAction.bind(null, billingPlan);

  return (
    <div
      className="relative flex flex-col rounded-3xl p-7"
      style={
        isFeatured
          ? {
              background: "var(--color-lavender-500)",
              boxShadow: "var(--shadow-soft)",
            }
          : {
              background: "white",
              border: "1.5px solid var(--color-warm-200)",
              boxShadow: "var(--shadow-card)",
            }
      }
    >
      {isFeatured && (
        <span
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold"
          style={{ background: "var(--color-sage-400)", color: "white" }}
        >
          Más popular
        </span>
      )}

      <h3
        className="mb-1 text-lg font-bold"
        style={{ color: isFeatured ? "white" : "var(--color-warm-800)" }}
      >
        {plan.name}
      </h3>
      <p
        className="mb-1 text-3xl font-bold"
        style={{
          color: isFeatured ? "white" : "var(--color-lavender-600)",
        }}
      >
        {priceLabel}
      </p>
      <p
        className="mb-5 text-sm"
        style={{
          color: isFeatured
            ? "rgba(255,255,255,0.75)"
            : "var(--color-warm-400)",
        }}
      >
        {plan.description}
      </p>

      <ul className="mb-6 flex flex-col gap-2.5">
        {plan.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-sm"
            style={{
              color: isFeatured
                ? "rgba(255,255,255,0.9)"
                : "var(--color-warm-600)",
            }}
          >
            <span
              className="mt-0.5 shrink-0 font-bold"
              style={{
                color: isFeatured
                  ? "var(--color-sage-200)"
                  : "var(--color-sage-500)",
              }}
            >
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>

      <form action={checkoutWithPlan} className="mt-auto">
        <button
          type="submit"
          className="w-full rounded-2xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          style={
            isFeatured
              ? { background: "white", color: "var(--color-lavender-600)" }
              : {
                  background: "var(--color-lavender-100)",
                  color: "var(--color-lavender-700)",
                }
          }
        >
          Actualizar a {plan.name}
        </button>
      </form>
    </div>
  );
}

// ── Active subscription (shown to PRO / ANNUAL users) ─────────────────────

function ActiveSubscription({ subscription }: { subscription: Subscription }) {
  const cancelAtEnd = subscription.cancelAtPeriodEnd;

  return (
    <div
      className="rounded-3xl p-7"
      style={{ background: "white", boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span
            className="mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
            style={{
              background: "var(--color-sage-100)",
              color: "var(--color-sage-700)",
            }}
          >
            ✓ Plan {subscription.plan} activo
          </span>
          <p
            className="text-2xl font-bold mt-1"
            style={{ color: "var(--color-warm-800)" }}
          >
            {subscription.plan === "PRO" ? "$7/mes" : "$59/año"}
          </p>
        </div>

        <div className="text-right text-sm">
          <p style={{ color: "var(--color-warm-500)" }}>
            {cancelAtEnd ? "Cancela el" : "Próxima renovación"}
          </p>
          <p
            className="font-semibold"
            style={{ color: "var(--color-warm-800)" }}
          >
            {formatDate(subscription.currentPeriodEnd)}
          </p>
        </div>
      </div>

      {cancelAtEnd && (
        <p
          className="mb-4 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "#FEF9E7",
            color: "#B45309",
            border: "1px solid #FDE68A",
          }}
        >
          Tu suscripción no se renovará automáticamente. Acceso disponible hasta{" "}
          {formatDate(subscription.currentPeriodEnd)}.
        </p>
      )}

      <form action={createPortalAction}>
        <button
          type="submit"
          className="rounded-2xl px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{
            background: "var(--color-lavender-100)",
            color: "var(--color-lavender-700)",
          }}
        >
          Gestionar suscripción →
        </button>
      </form>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function PlanPage() {
  const user = getSessionUser();

  const [subscription, plans] = await Promise.all([
    serverFetch<Subscription>("/subscriptions/me").catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return null;
      return null;
    }),
    serverFetch<PlanInfo[]>("/subscriptions/plans").catch(
      () => [] as PlanInfo[],
    ),
  ]);

  const userPlan = subscription?.plan ?? user?.plan ?? "FREE";
  const isFreePlan = userPlan === "FREE";

  const upgradePlans = plans.filter(
    (p) => p.plan === "PRO" || p.plan === "ANNUAL",
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1
          className="mb-1 text-2xl font-bold"
          style={{ color: "var(--color-warm-800)" }}
        >
          Mi plan
        </h1>
        <p className="text-sm" style={{ color: "var(--color-warm-500)" }}>
          {isFreePlan
            ? "Mejora tu experiencia con acceso completo al contenido."
            : "Gestiona tu suscripción activa."}
        </p>
      </div>

      {/* ── FREE user: upgrade options ── */}
      {isFreePlan && (
        <>
          <div
            className="mb-6 rounded-2xl px-5 py-4"
            style={{
              background: "var(--color-warm-100)",
              border: "1.5px solid var(--color-warm-200)",
            }}
          >
            <p
              className="text-sm font-medium"
              style={{ color: "var(--color-warm-700)" }}
            >
              Plan actual:{" "}
              <span style={{ color: "var(--color-lavender-600)" }}>
                Gratuito
              </span>{" "}
              — acceso al libro introductorio.
            </p>
          </div>

          <h2
            className="mb-5 text-lg font-semibold"
            style={{ color: "var(--color-warm-800)" }}
          >
            Elige tu plan
          </h2>

          <div className="grid gap-5 sm:grid-cols-2">
            {upgradePlans.map((plan) => (
              <UpgradeCard
                key={plan.plan}
                plan={plan}
                isFeatured={plan.plan === "PRO"}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Active subscriber ── */}
      {!isFreePlan && subscription && (
        <ActiveSubscription subscription={subscription} />
      )}

      {/* ── Fallback: paid plan but no subscription record ── */}
      {!isFreePlan && !subscription && (
        <p className="text-sm" style={{ color: "var(--color-warm-400)" }}>
          No se encontró información de tu suscripción. Contacta soporte si esto
          persiste.
        </p>
      )}
    </div>
  );
}
