import Link from "next/link";
import type { PlanInfo } from "@psico/types";

interface FormattedPrice {
  main: string;
  sub: string;
}

function formatPrice(plan: PlanInfo): FormattedPrice {
  const { prices } = plan;
  if (!prices.monthly && !prices.yearly) {
    return { main: "Gratis", sub: "para siempre" };
  }
  if (prices.monthly) {
    return {
      main: `$${prices.monthly}`,
      sub: prices.yearly ? `/mes · o $${prices.yearly}/año` : "/mes",
    };
  }
  return { main: `$${prices.yearly}`, sub: "/año" };
}

export function PricingSection({ plans }: { plans: PlanInfo[] }) {
  const displayPlans = plans.filter((p) => p.plan !== "B2B");

  return (
    <section
      id="planes"
      className="py-20 sm:py-24"
      style={{ background: "var(--color-warm-50)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-14 text-center">
          <h2
            className="mb-4 text-3xl font-bold sm:text-4xl"
            style={{ color: "var(--color-warm-800)" }}
          >
            Planes y precios
          </h2>
          <p className="text-lg" style={{ color: "var(--color-warm-500)" }}>
            Empieza gratis. Crece cuando estés listo.
          </p>
        </div>

        <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayPlans.map((plan) => {
            const isFeatured = plan.plan === "PRO";
            const price = formatPrice(plan);

            return (
              <div
                key={plan.plan}
                className="relative flex flex-col rounded-3xl p-8"
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
                {/* "Más popular" badge */}
                {isFeatured && (
                  <span
                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold"
                    style={{
                      background: "var(--color-sage-400)",
                      color: "white",
                    }}
                  >
                    Más popular
                  </span>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <h3
                    className="mb-3 text-lg font-bold"
                    style={{
                      color: isFeatured ? "white" : "var(--color-warm-800)",
                    }}
                  >
                    {plan.name}
                  </h3>
                  <div className="mb-2 flex items-baseline gap-1">
                    <span
                      className="text-4xl font-bold"
                      style={{
                        color: isFeatured
                          ? "white"
                          : "var(--color-lavender-600)",
                      }}
                    >
                      {price.main}
                    </span>
                    <span
                      className="text-sm"
                      style={{
                        color: isFeatured
                          ? "rgba(255,255,255,0.7)"
                          : "var(--color-warm-400)",
                      }}
                    >
                      {price.sub}
                    </span>
                  </div>
                  <p
                    className="text-sm"
                    style={{
                      color: isFeatured
                        ? "rgba(255,255,255,0.75)"
                        : "var(--color-warm-400)",
                    }}
                  >
                    {plan.description}
                  </p>
                </div>

                {/* Feature list */}
                <ul className="mb-8 flex flex-1 flex-col gap-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm"
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
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href="/register"
                  className="block rounded-2xl py-3 text-center text-sm font-semibold transition-opacity hover:opacity-90"
                  style={
                    isFeatured
                      ? {
                          background: "white",
                          color: "var(--color-lavender-600)",
                        }
                      : {
                          background: "var(--color-lavender-100)",
                          color: "var(--color-lavender-700)",
                        }
                  }
                >
                  {plan.plan === "FREE" ? "Empezar gratis" : "Elegir plan"}
                </Link>
              </div>
            );
          })}
        </div>

        {/* B2B footnote */}
        <p
          className="mt-10 text-center text-sm"
          style={{ color: "var(--color-warm-400)" }}
        >
          ¿Eres institución o empresa?{" "}
          <a
            href="mailto:hola@psicoplatform.com"
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--color-lavender-600)" }}
          >
            Escríbenos sobre el plan B2B →
          </a>
        </p>
      </div>
    </section>
  );
}
