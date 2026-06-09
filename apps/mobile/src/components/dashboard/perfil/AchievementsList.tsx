import { StyleSheet, Text, View } from "react-native";
import type { AchievementProgress } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

export function AchievementsList({
  achievements,
}: {
  achievements: AchievementProgress[];
}) {
  return (
    <View style={styles.wrap} testID="achievements-list">
      <Text style={styles.title}>Logros</Text>
      {achievements.length === 0 ? (
        <Text style={styles.empty}>
          Empezá a usar Psico y mostraremos acá tus logros.
        </Text>
      ) : (
        achievements.map((a) => {
          const unlocked = Boolean(a.unlockedAt);
          const pct =
            a.progressTarget > 0
              ? Math.min(
                  100,
                  Math.round((a.progressCurrent / a.progressTarget) * 100),
                )
              : 0;
          return (
            <View
              key={a.id}
              style={[
                styles.card,
                unlocked
                  ? { borderColor: Colors.sage[400] }
                  : { borderColor: Colors.warm[200], opacity: 0.7 },
              ]}
              testID={`achievement-${a.id}`}
            >
              <View style={styles.row}>
                <Text style={styles.icon}>{unlocked ? "🏆" : "🔒"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{a.label}</Text>
                  <Text style={styles.desc}>{a.description}</Text>
                </View>
              </View>
              {!unlocked ? (
                <View style={styles.progressWrap}>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {a.progressCurrent}/{a.progressTarget}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })
      )}
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
  empty: {
    fontSize: 13,
    color: Colors.warm[500],
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  icon: { fontSize: 22 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.warm[900] },
  desc: { fontSize: 11, color: Colors.warm[500], marginTop: 2 },
  progressWrap: { marginTop: 4 },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.warm[200],
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: Colors.lavender[500],
  },
  progressText: { fontSize: 10, color: Colors.warm[500], marginTop: 4 },
});
