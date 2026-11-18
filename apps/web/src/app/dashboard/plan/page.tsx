import type { Metadata } from "next";
import type { PlanInfo, PlanResponse, Subscription } from "@psico/types";
import {
  PURCHASES_CLOSED_BODY,
  PURCHASES_CLOSED_HEADLINE,
  PURCHASES_PROPOSAL_NOTICE,
} from "@psico/types";

import { isNextThrow, serverFetch, getSessionUser } from "@/lib/api.server";
import {
  createCheckoutAction,
  createPortalAction,
} from "@/actions/subscription";
import { InvoicesList } from "@/components/dashboard/plan/InvoicesList";
import { SubscriptionActions } from "@/components/dashboard/plan/SubscriptionActions";
import { UsageCards } from "@/components/dashboard/plan/UsageCards";

export const metadata: Metadata = { title: "Mi plan" };
export const dynamic = "force-dynamic";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Aviso de compras cerradas ─────────────────────────────────────────────

/**
 * Lo que la pantalla dice cuando no se puede contratar.
 *
 * El texto y el aviso de importes vienen de `@psico/types` para que la portada
 * y el producto digan lo mismo: alguien que lee «Propuesta de precios · No
 * disponible para compra» en la landing y encuentra un botón de compra dentro
 * concluye, con razón, que una de las dos miente.
 */
function PurchasesClosedNotice() {
  return (
    <div
      className="mb-6 rounded-2xl px-5 py-4"
      style={{
        background: "var(--color-warm-100)",
        border: "1.5px solid var(--color-warm-200)",
      }}
    >
      <p
        className="text-sm font-semibold"
        style={{ color: "var(--color-warm-800)" }}
      >
        {PURCHASES_CLOSED_HEADLINE}
      </p>
      <p
        className="mt-1 text-sm"
        style={{ color: "var(--color-warm-600)", lineHeight: 1.5 }}
      >
        {PURCHASES_CLOSED_BODY}
      </p>
      <p
        className="mt-2 text-xs font-medium"
        style={{ color: "var(--color-warm-500)" }}
      >
        {PURCHASES_PROPOSAL_NOTICE}
      </p>
    </div>
  );
}

// ── Upgrade card (shown to FREE users) ────────────────────────────────────

function UpgradeCard({
  plan,
  isFeatured,
  purchasesOpen,
}: {
  plan: PlanInfo;
  isFeatured: boolean;
  /**
   * Decidido por el servidor, no por esta pantalla. Con las compras cerradas
   * la tarjeta sigue describiendo el plan —es información útil— pero no ofrece
   * una acción que el servidor va a rechazar.
   */
  purchasesOpen: boolean;
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
              // El panel destacado lleva texto blanco y texto secundario
              // translúcido encima. Sobre lavender-500 eso medía 2.74:1 y
              // 3.26:1. Usa el relleno de marca que sí carga texto.
              background: "var(--bg-brand-strong)",
              boxShadow: "var(--shadow-soft)",
            }
          : {
              background: "var(--bg-surface)",
              border: "1.5px solid var(--color-warm-200)",
              boxShadow: "var(--shadow-card)",
            }
      }
    >
      {isFeatured && (
        <span
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold"
          style={{ background: "var(--bg-action)", color: "white" }}
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
      {!purchasesOpen && (
        <p
          className="mb-1 text-xs font-medium"
          style={{
            color: isFeatured
              ? "rgba(255,255,255,0.85)"
              : "var(--color-warm-500)",
          }}
        >
          {PURCHASES_PROPOSAL_NOTICE}
        </p>
      )}
      <p
        className="mb-5 text-sm"
        style={{
          color: isFeatured ? "rgba(255,255,255,0.9)" : "var(--color-warm-400)",
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

      {/*
        Con las compras cerradas NO se renderiza el formulario. No es un botón
        deshabilitado: un `disabled` sigue siendo una llamada a contratar, y la
        pantalla pasaría a prometer algo para «más tarde» que nadie ha decidido
        cuándo es. Queda una línea que dice lo que hay.
      */}
      {purchasesOpen ? (
        <form action={checkoutWithPlan} className="mt-auto">
          <button
            type="submit"
            className="w-full rounded-2xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={
              isFeatured
                ? {
                    background: "var(--bg-surface)",
                    color: "var(--color-lavender-700)",
                  }
                : {
                    background: "var(--color-lavender-100)",
                    color: "var(--color-lavender-700)",
                  }
            }
          >
            Actualizar a {plan.name}
          </button>
        </form>
      ) : (
        <p
          className="mt-auto rounded-2xl py-3 text-center text-sm font-medium"
          style={
            isFeatured
              ? {
                  background: "rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.9)",
                }
              : {
                  background: "var(--color-warm-100)",
                  color: "var(--color-warm-600)",
                }
          }
        >
          Sin contratación disponible
        </p>
      )}
    </div>
  );
}

// ── Active subscription (shown to PRO / ANNUAL users) ─────────────────────

function ActiveSubscription({ subscription }: { subscription: Subscription }) {
  const cancelAtEnd = subscription.cancelAtPeriodEnd;

  return (
    <div
      className="rounded-3xl p-7"
      style={{
        background: "var(--bg-surface)",
        boxShadow: "var(--shadow-card)",
      }}
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

      <div className="flex flex-wrap items-center gap-3">
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
        <SubscriptionActions
          cancelAtPeriodEnd={cancelAtEnd}
          effectiveAt={subscription.currentPeriodEnd}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function PlanPage() {
  const user = getSessionUser();

  // Sprint S11: single envolvente request — replaces the 4 parallel fetches
  // the previous page issued (me + plans + usage + invoices). The backend
  // already parallelises those reads internally so we get the same wall-clock
  // performance with a quarter of the request volume.
  let plan: PlanResponse | null = null;
  try {
    plan = await serverFetch<PlanResponse>("/plan");
  } catch (err) {
    if (isNextThrow(err)) throw err;
    // Non-auth failure (Stripe outage etc.). We render the FREE preview
    // shell so the user still sees something useful.
    plan = null;
  }

  const userPlan = plan?.tier ?? user?.plan ?? "FREE";
  const isFreePlan = userPlan === "FREE";
  const subscription = plan?.subscription ?? null;
  const usage = plan?.usage ?? null;
  const invoices = plan?.invoices ? { invoices: plan.invoices } : null;
  const plans: PlanInfo[] = plan?.plans ?? [];

  const upgradePlans = plans.filter(
    (p) => p.plan === "PRO" || p.plan === "ANNUAL",
  );

  // La decide el servidor (`GET /api/plan`). El `?? false` no es una
  // formalidad: un cliente nuevo contra una API anterior —o un `/plan` que
  // falló y dejó `plan` en null— no debe acabar ofreciendo una compra. La
  // ausencia de un permiso no es un permiso.
  const purchasesOpen = plan?.purchases?.open ?? false;

  return (
    <div className="max-w-3xl">
      {/* Sprint G3 — generic screen-head sweep. */}
      <div className="screen-head">
        <h1 className="screen-title">
          <span className="eb">Cuenta y privacidad</span>
          Mi plan
        </h1>
      </div>
      <p className="screen-sub" style={{ margin: "-14px 0 26px" }}>
        {isFreePlan
          ? purchasesOpen
            ? "Mejora tu experiencia con acceso completo al contenido."
            : "Esto es lo que incluye tu plan actual y lo que estamos preparando."
          : "Gestiona tu suscripción activa."}
      </p>

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
              <span style={{ color: "var(--color-lavender-700)" }}>
                Gratuito
              </span>{" "}
              — acceso al libro introductorio.
            </p>
          </div>

          {!purchasesOpen && <PurchasesClosedNotice />}

          <h2
            className="mb-5 text-lg font-semibold"
            style={{ color: "var(--color-warm-800)" }}
          >
            {purchasesOpen ? "Elige tu plan" : "Los planes que estamos armando"}
          </h2>

          <div className="grid gap-5 sm:grid-cols-2">
            {upgradePlans.map((plan) => (
              <UpgradeCard
                key={plan.plan}
                plan={plan}
                isFeatured={plan.plan === "PRO"}
                purchasesOpen={purchasesOpen}
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

      {/* ── Usage cards (Sprint front-fase1) ─────────────────────────────── */}
      <div className="mt-8">
        <UsageCards usage={usage} />
      </div>

      {/* ── Invoices (Sprint front-fase1) ────────────────────────────────── */}
      <div className="mt-8">
        <InvoicesList invoices={invoices} />
      </div>
    </div>
  );
}
