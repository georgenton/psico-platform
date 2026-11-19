import type { PlanInfo } from "@psico/types";
import {
  PURCHASES_CLOSED_BODY,
  PURCHASES_CLOSED_HEADLINE,
  PURCHASES_PROPOSAL_NOTICE,
} from "@psico/types";

import { createCheckoutAction } from "@/actions/subscription";

/**
 * Las tarjetas de plan de Mi plan, fuera de la página.
 *
 * ── Por qué viven en su propio fichero ────────────────────────────────────
 *
 * Estaban dentro de `dashboard/plan/page.tsx`, que es un Server Component que
 * hace `serverFetch` y lee cookies: no se puede montar en una prueba, así que
 * lo único que se podía comprobar era el TEXTO del fichero — que el formulario
 * apareciera después de la guarda.
 *
 * Esa comprobación tenía un agujero que sólo se ve al escribir la mutación:
 * **intercambiar las dos ramas la aprueba igual**. Con
 * `purchasesOpen ? (aviso) : (formulario)` el formulario sigue estando después
 * de la guarda y sigue habiendo uno solo — y la pantalla ofrecería contratar
 * justo cuando no se puede. Una prueba de posición no distingue qué rama
 * corresponde a qué valor; sólo renderizar lo distingue.
 *
 * Sacarlas aquí no cambia una línea de lo que se pinta. Lo que cambia es que
 * ahora se pueden montar con `purchasesOpen` en los dos valores y preguntarle
 * a la pantalla qué ofrece.
 */

// ── Aviso de compras cerradas ─────────────────────────────────────────────

/**
 * Lo que la pantalla dice cuando no se puede contratar.
 *
 * El texto y el aviso de importes vienen de `@psico/types` para que la portada
 * y el producto digan lo mismo: alguien que lee «Propuesta de precios · No
 * disponible para compra» en la landing y encuentra un botón de compra dentro
 * concluye, con razón, que una de las dos miente.
 */
export function PurchasesClosedNotice() {
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

export function UpgradeCard({
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
