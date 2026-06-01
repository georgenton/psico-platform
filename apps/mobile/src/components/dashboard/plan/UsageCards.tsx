import { StyleSheet, Text, View } from "react-native";
import type { UsageResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * UsageCards (mobile) — Sprint front-fase1.
 *
 * Mirrors the web component. 4 mini-cards in a 2×2 grid. Progress bar
 * appears only when there's a numeric quota > 0. `quota === null` means
 * unlimited (B2B; diary on all plans). `quota === 0` means "not included"
 * (FREE voice).
 */
export function UsageCards({ usage }: { usage: UsageResponse | null }) {
  if (!usage) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          No pudimos cargar tu uso. Reintenta en unos minutos.
        </Text>
      </View>
    );
  }

  const items: CardItem[] = [
    {
      icon: "📚",
      label: "Libros",
      current: usage.books.completedThisPeriod,
      quota: null,
      unit: "",
    },
    {
      icon: "💬",
      label: "Eco",
      current: usage.eco.messagesThisPeriod,
      quota: usage.eco.quota,
      unit: "",
    },
    {
      icon: "🎙️",
      label: "Voz",
      current: usage.voice.minutesThisPeriod,
      quota: usage.voice.quota,
      unit: "min",
    },
    {
      icon: "✎",
      label: "Diario",
      current: usage.diary.entriesThisPeriod,
      quota: usage.diary.quota,
      unit: "",
    },
  ];

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Tu uso este período</Text>
        <Text style={styles.period}>
          {formatPeriod(usage.period.start, usage.period.end)}
        </Text>
      </View>

      <View style={styles.grid}>
        {items.map((it) => (
          <UsageCard key={it.label} {...it} />
        ))}
      </View>
    </View>
  );
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface CardItem {
  icon: string;
  label: string;
  current: number;
  quota: number | null;
  unit: string;
}

function UsageCard({ icon, label, current, quota, unit }: CardItem) {
  const ratio = quota && quota > 0 ? Math.min(1, current / quota) : 0;
  const atCap = quota !== null && quota > 0 && current >= quota;
  const notIncluded = quota === 0;
  const counterColor = atCap ? Colors.error : Colors.warm[800];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={[styles.counter, { color: counterColor }]}>
        {current.toLocaleString("es-EC")}
        {unit ? ` ${unit}` : ""}
      </Text>
      <Text style={styles.sub}>
        {quota === null
          ? "ilimitado"
          : notIncluded
            ? "no incluido"
            : `de ${quota.toLocaleString("es-EC")}${unit ? ` ${unit}` : ""}`}
      </Text>
      {quota !== null && quota > 0 ? (
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${ratio * 100}%`,
                backgroundColor: atCap ? Colors.error : Colors.lavender[500],
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

function formatPeriod(start: Date | string, end: Date | string): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-EC", { day: "numeric", month: "short" });
  return `${fmt(new Date(start))} – ${fmt(new Date(end))}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  period: {
    fontSize: 11,
    color: Colors.warm[400],
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[500],
  },
  counter: {
    fontSize: 20,
    fontWeight: "700",
  },
  sub: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.warm[400],
  },
  barTrack: {
    marginTop: 8,
    height: 6,
    backgroundColor: Colors.warm[100],
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  fallback: {
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
  },
  fallbackText: {
    fontSize: 12,
    color: Colors.warm[500],
  },
});
