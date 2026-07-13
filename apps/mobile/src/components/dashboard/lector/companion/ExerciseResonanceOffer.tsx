import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { resonancesApi } from "@psico/api-client";
import type { ChapterConcept } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * ExerciseResonanceOffer (mobile) — ARC confirm step for the exercise source.
 *
 * Shown in the Reflexión sheet's saved state when opened from a chapter
 * exercise. Asks for an explicit confirmation; only that tap persists a
 * Resonance (`source: "exercise"`) and feeds the conexión axis. Standalone so
 * it can be unit-tested without the crypto-gated ReflexionSheetTab.
 */
export function ExerciseResonanceOffer({
  concept,
  bookSlug,
  chapterOrder,
}: {
  concept: ChapterConcept;
  bookSlug: string;
  chapterOrder: number;
}) {
  const [phase, setPhase] = useState<"offer" | "saving" | "done" | "error">(
    "offer",
  );

  async function confirm() {
    setPhase("saving");
    try {
      await resonancesApi.confirm({
        conceptKey: concept.key,
        conceptLabel: concept.label,
        bookSlug,
        chapterOrder,
        source: "exercise",
      });
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }

  return (
    <View style={styles.card}>
      {phase === "done" ? (
        <Text style={styles.body}>
          🌱 Añadido a tu mapa. Puedes verlo (y quitarlo) en Mis resonancias.
        </Text>
      ) : (
        <>
          <Text style={styles.body}>
            Hiciste este ejercicio sobre «{concept.label}». ¿Te resonó? Solo
            entra a tu mapa si tú lo confirmas.
          </Text>
          {phase === "error" ? (
            <Text style={styles.error}>No pudimos guardarlo. Reintenta.</Text>
          ) : null}
          <Pressable
            onPress={() => void confirm()}
            disabled={phase === "saving"}
            style={styles.btn}
          >
            <Text style={styles.btnText}>
              {phase === "saving" ? "Guardando…" : "🌱 Sí, añadir a mi mapa"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    backgroundColor: Colors.lavender[50],
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: Spacing.sm,
    gap: 8,
  },
  body: { fontSize: 12.5, lineHeight: 18, color: Colors.warm[700] },
  error: { fontSize: 11.5, color: Colors.rose[600] },
  btn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: Colors.lavender[500],
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  btnText: { color: "white", fontWeight: "700", fontSize: 12 },
});
