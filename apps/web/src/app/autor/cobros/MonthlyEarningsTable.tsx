import type { AuthorMonthlyRevenueRow } from "@psico/types";

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatMonth(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "long",
  });
}

export function MonthlyEarningsTable({
  rows,
}: {
  rows: AuthorMonthlyRevenueRow[];
}) {
  if (rows.length === 0) {
    return (
      <article
        className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        Aún no tienes earnings registrados. Tan pronto se generen las
        primeras agregaciones, aparecerán aquí mes a mes.
      </article>
    );
  }

  return (
    <article
      className="overflow-hidden rounded-2xl border-[1.5px] bg-white"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <table className="w-full text-[12.5px]">
        <thead
          style={{
            background: "var(--color-warm-50)",
            color: "var(--color-warm-700)",
          }}
        >
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Mes</th>
            <th className="px-4 py-3 text-right font-semibold">Bruto</th>
            <th className="px-4 py-3 text-right font-semibold">Comisión</th>
            <th className="px-4 py-3 text-right font-semibold">Neto</th>
            <th className="px-4 py-3 text-left font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={`${typeof r.month === "string" ? r.month : r.month.toISOString()}-${idx}`}
              style={{
                borderTop: idx === 0 ? undefined : "1px solid var(--color-warm-100)",
                color: "var(--color-warm-800)",
              }}
            >
              <td className="px-4 py-3 capitalize">{formatMonth(r.month)}</td>
              <td className="px-4 py-3 text-right">
                {formatUsd(r.grossCents)}
              </td>
              <td className="px-4 py-3 text-right">
                – {formatUsd(r.platformFeeCents)}
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                {formatUsd(r.netCents)}
              </td>
              <td className="px-4 py-3">
                <span
                  className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                  style={{
                    background:
                      r.status === "PAID"
                        ? "var(--color-sage-100)"
                        : "var(--color-warm-100)",
                    color:
                      r.status === "PAID"
                        ? "var(--color-sage-700)"
                        : "var(--color-warm-700)",
                  }}
                >
                  {r.status}
                </span>
                {r.paymentReference ? (
                  <span
                    className="ml-2 text-[10.5px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    Ref: {r.paymentReference}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
