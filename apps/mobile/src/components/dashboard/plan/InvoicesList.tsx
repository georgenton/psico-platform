import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { InvoiceListResponse, InvoiceStatus } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * InvoicesList (mobile) — Sprint front-fase1.
 *
 * Renders the last invoices as a stacked list. PDF link opens the
 * Stripe-hosted URL via `Linking.openURL` so the browser handles auth /
 * download. Empty state mirrors the web copy.
 */
export function InvoicesList({
  invoices,
}: {
  invoices: InvoiceListResponse | null;
}) {
  if (!invoices) return null;

  if (invoices.invoices.length === 0) {
    return (
      <View>
        <Text style={styles.title}>Facturas</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Aún no hay facturas. La primera aparecerá después de tu próximo
            cargo.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.title}>Facturas</Text>
      <View style={styles.list}>
        {invoices.invoices.map((inv, idx) => (
          <View
            key={inv.id}
            style={[styles.row, idx === 0 ? null : styles.rowBorder]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{formatDate(inv.date)}</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amount}>
                  {formatAmount(inv.amount, inv.currency)}
                </Text>
                <StatusPill status={inv.status} />
              </View>
            </View>
            {inv.pdfUrl ? (
              <Pressable
                onPress={() => {
                  void Linking.openURL(inv.pdfUrl!);
                }}
                hitSlop={8}
                style={styles.pdfBtn}
              >
                <Ionicons
                  name="download-outline"
                  size={18}
                  color={Colors.lavender[700]}
                />
                <Text style={styles.pdfText}>PDF</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
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
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

const STATUS_STYLES: Record<
  InvoiceStatus,
  { label: string; bg: string; fg: string }
> = {
  paid: { label: "Pagada", bg: Colors.sage[100], fg: Colors.sage[600] },
  open: { label: "Pendiente", bg: "#FEF9E7", fg: "#B45309" },
  void: { label: "Anulada", bg: Colors.warm[100], fg: Colors.warm[500] },
  uncollectible: { label: "Incobrable", bg: "#FEE2E2", fg: "#B91C1C" },
  draft: { label: "Borrador", bg: Colors.warm[100], fg: Colors.warm[500] },
};

function StatusPill({ status }: { status: InvoiceStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[800],
    marginBottom: Spacing.sm,
  },
  empty: {
    backgroundColor: Colors.warm[50],
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.warm[500],
    lineHeight: 18,
  },
  list: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.warm[100],
  },
  date: {
    fontSize: 12,
    color: Colors.warm[500],
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.lavender[50],
  },
  pdfText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.lavender[700],
  },
  pill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
});
