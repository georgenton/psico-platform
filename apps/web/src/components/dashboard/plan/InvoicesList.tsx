import type { InvoiceListResponse, InvoiceStatus } from "@psico/types";

/**
 * InvoicesList — Sprint front-fase1 (Mi Plan web).
 *
 * Shows the user's last invoices from Stripe. The server already maps to
 * `InvoiceSummary[]` with amounts in major units. We render a simple table
 * with status pill, amount, and a hosted-PDF link (Stripe signs it with a
 * short-lived token).
 *
 * Empty state: trialing users + users who just upgraded haven't been
 * billed yet → "Aún no hay facturas".
 */
export function InvoicesList({
  invoices,
}: {
  invoices: InvoiceListResponse | null;
}) {
  if (!invoices) {
    return null; // Don't show the section at all if the call failed.
  }

  if (invoices.invoices.length === 0) {
    return (
      <section>
        <h2
          className="mb-3 text-lg font-semibold"
          style={{ color: "var(--color-warm-800)" }}
        >
          Facturas
        </h2>
        <p
          className="rounded-2xl p-5 text-sm"
          style={{
            background: "var(--color-warm-50)",
            border: "1.5px solid var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          Aún no hay facturas. La primera aparecerá después de tu próximo cargo.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2
        className="mb-3 text-lg font-semibold"
        style={{ color: "var(--color-warm-800)" }}
      >
        Facturas
      </h2>
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: "white",
          border: "1.5px solid var(--color-warm-200)",
        }}
      >
        <table className="w-full">
          <thead>
            <tr
              className="text-left text-[11px] font-bold uppercase tracking-wider"
              style={{
                background: "var(--color-warm-50)",
                color: "var(--color-warm-500)",
              }}
            >
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Monto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {invoices.invoices.map((inv, idx) => (
              <tr
                key={inv.id}
                style={{
                  borderTop:
                    idx === 0 ? "none" : "1px solid var(--color-warm-100)",
                }}
              >
                <td
                  className="px-4 py-3 text-sm"
                  style={{ color: "var(--color-warm-700)" }}
                >
                  {formatDate(inv.date)}
                </td>
                <td
                  className="px-4 py-3 text-sm font-semibold"
                  style={{ color: "var(--color-warm-800)" }}
                >
                  {formatAmount(inv.amount, inv.currency)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={inv.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {inv.pdfUrl ? (
                    <a
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:opacity-70"
                      style={{ color: "var(--color-lavender-700)" }}
                    >
                      Descargar →
                    </a>
                  ) : (
                    <span
                      className="text-sm"
                      style={{ color: "var(--color-warm-400)" }}
                    >
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(amount: number, currency: string): string {
  // Stripe returns ISO codes lowercase ("usd"). Intl wants uppercase.
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

const STATUS_STYLES: Record<
  InvoiceStatus,
  { label: string; bg: string; fg: string }
> = {
  paid: {
    label: "Pagada",
    bg: "var(--color-sage-100)",
    fg: "var(--color-sage-700)",
  },
  open: {
    label: "Pendiente",
    bg: "#FEF9E7",
    fg: "#B45309",
  },
  void: {
    label: "Anulada",
    bg: "var(--color-warm-100)",
    fg: "var(--color-warm-500)",
  },
  uncollectible: {
    label: "Incobrable",
    bg: "#FEE2E2",
    fg: "#B91C1C",
  },
  draft: {
    label: "Borrador",
    bg: "var(--color-warm-100)",
    fg: "var(--color-warm-500)",
  },
};

function StatusPill({ status }: { status: InvoiceStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
