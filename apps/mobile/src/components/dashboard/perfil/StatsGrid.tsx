import { StyleSheet, Text, View } from "react-native";
import type { UserStats } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

type Stat = {
  label: string;
  value: number;
  unit?: string;
  emoji: string;
};

export function StatsGrid({ stats }: { stats: UserStats }) {
  const items: Stat[] = [
    {
      label: "Racha actual",
      value: stats.currentStreakDays,
      unit: stats.currentStreakDays === 1 ? "día" : "días",
      emoji: "🔥",
    },
    {
      label: "Libros completados",
      value: stats.booksCompleted,
      emoji: "📚",
    },
    {
      label: "Entradas del diario",
      value: stats.diaryEntries,
      emoji: "✎",
    },
    {
      label: "Minutos en la app",
      value: stats.minutesTotal,
      unit: "min",
      emoji: "⏱️",
    },
  ];

  return (
    <View style={styles.wrap} testID="stats-grid">
      <Text style={styles.title}>Tu actividad</Text>
      <View style={styles.grid}>
        {items.map((s) => (
          <View key={s.label} style={styles.cell} testID={`stat-${s.label}`}>
            <Text style={styles.emoji}>{s.emoji}</Text>
            <Text style={styles.value}>
              {s.value.toLocaleString("es-419")}
              {s.unit ? <Text style={styles.unit}>{" " + s.unit}</Text> : null}
            </Text>
            <Text style={styles.label}>{s.label}</Text>
          </View>
        ))}
      </View>
      {stats.longestStreakDays > 0 ? (
        <Text style={styles.footnote}>
          Mejor racha histórica: {stats.longestStreakDays}{" "}
          {stats.longestStreakDays === 1 ? "día" : "días"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  cell: {
    flexBasis: "47%",
    backgroundColor: "#fff",
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    gap: 4,
  },
  emoji: { fontSize: 20 },
  value: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
    marginTop: 4,
  },
  unit: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.warm[500],
  },
  label: {
    fontSize: 12,
    color: Colors.warm[500],
  },
  footnote: {
    fontSize: 11,
    color: Colors.warm[500],
    paddingHorizontal: Spacing.xs,
    marginTop: 4,
  },
});
