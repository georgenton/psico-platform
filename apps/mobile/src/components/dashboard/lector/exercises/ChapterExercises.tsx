import { Pressable, StyleSheet, Text, View } from "react-native";
import { chapterExercises } from "@psico/types";
import type { BreatheExercise } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * ChapterExercises — interactive activities section (mobile).
 *
 * Curated per (bookSlug, chapterOrder). `reflect` → onReflect(prompt) so the
 * reader opens the Reflexión tab of the companion sheet; `breathe` →
 * onBreathe(exercise) so the reader shows the breathing overlay. Renders
 * nothing when the chapter has no curated exercises.
 */
export function ChapterExercises({
  bookSlug,
  chapterOrder,
  onReflect,
  onBreathe,
}: {
  bookSlug: string;
  chapterOrder: number;
  onReflect: (prompt: string) => void;
  onBreathe: (exercise: BreatheExercise) => void;
}) {
  const exercises = chapterExercises(bookSlug, chapterOrder);
  if (exercises.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Actividades de este capítulo</Text>
      {exercises.map((ex) => (
        <View key={ex.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.icon}>
              {ex.kind === "breathe" ? "🌬️" : "🪷"}
            </Text>
            <View style={styles.textCol}>
              <Text style={styles.title}>{ex.title}</Text>
              <Text style={styles.desc}>
                {ex.kind === "breathe" ? ex.description : ex.prompt}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() =>
              ex.kind === "breathe" ? onBreathe(ex) : onReflect(ex.prompt)
            }
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.ctaText}>
              {ex.kind === "breathe" ? "Empezar →" : "Escribir mi respuesta →"}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.sage[200],
    backgroundColor: Colors.sage[50],
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  heading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: Colors.sage[600],
    marginBottom: 2,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: "white",
    padding: Spacing.sm + 2,
  },
  row: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start" },
  icon: { fontSize: 18, marginTop: 1 },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 13.5, fontWeight: "700", color: Colors.warm[900] },
  desc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.warm[600],
    marginTop: 2,
  },
  cta: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: Colors.sage[400],
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  ctaText: { fontSize: 12.5, fontWeight: "700", color: "white" },
});
