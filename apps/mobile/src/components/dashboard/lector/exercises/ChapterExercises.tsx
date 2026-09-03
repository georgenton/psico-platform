import { useState } from "react";
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
 *
 * `myths_lens` — the book's own integrative activity — renders as the FUNCTIONAL
 * FALLBACK the design allows: its five steps in full, so a reader on a phone
 * can do the whole activity, plus the same route into the encrypted diary. The
 * web build renders it as an interaction; porting that is a UI project, and
 * shipping half of it here would be worse than shipping the honest text.
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
  const [openSteps, setOpenSteps] = useState<string | null>(null);
  if (exercises.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Actividades de este capítulo</Text>
      {exercises.map((ex) => (
        <View key={ex.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.icon}>
              {ex.kind === "breathe"
                ? "🌬️"
                : ex.kind === "myths_lens"
                  ? "🔍"
                  : "🪷"}
            </Text>
            <View style={styles.textCol}>
              <Text style={styles.title}>{ex.title}</Text>
              <Text style={styles.desc}>
                {ex.kind === "reflect" ? ex.prompt : ex.description}
              </Text>
              {ex.kind === "myths_lens" && openSteps === ex.id ? (
                <View testID={`myths-steps-${ex.id}`}>
                  {ex.fallbackSteps.map((step, i) => (
                    <Text key={step} style={styles.step}>
                      {`${i + 1}. ${step}`}
                    </Text>
                  ))}
                  <Text style={styles.privacy}>
                    Lo que escribas se queda contigo. Si quieres guardarlo, pasa
                    a tu diario: ahí se cifra de extremo a extremo.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (ex.kind === "breathe") return onBreathe(ex);
              if (ex.kind === "myths_lens") {
                return setOpenSteps((prev) => (prev === ex.id ? null : ex.id));
              }
              return onReflect(ex.prompt);
            }}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.ctaText}>
              {ex.kind === "breathe"
                ? "Empezar →"
                : ex.kind === "myths_lens"
                  ? openSteps === ex.id
                    ? "Ocultar los pasos"
                    : "Ver los pasos →"
                  : "Escribir mi respuesta →"}
            </Text>
          </Pressable>
          {ex.kind === "myths_lens" && openSteps === ex.id ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onReflect(ex.betterQuestionPrompt)}
              style={({ pressed }) => [
                styles.secondary,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.secondaryText}>
                🪷 Escribirlo en mi diario
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  step: {
    marginTop: Spacing.xs,
    fontSize: 12.5,
    lineHeight: 19,
    color: Colors.warm[700],
  },
  privacy: {
    marginTop: Spacing.sm,
    fontSize: 11.5,
    lineHeight: 17,
    color: Colors.warm[500],
  },
  secondary: {
    marginTop: Spacing.sm,
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.warm[300],
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  secondaryText: { fontSize: 12.5, fontWeight: "600", color: Colors.warm[700] },
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
