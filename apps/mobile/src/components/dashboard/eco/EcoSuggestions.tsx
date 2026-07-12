import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ecoApi } from "@psico/api-client";
import type { EcoSuggestion } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * EcoSuggestions (mobile) — adaptive conversation openers on the Eco screen.
 *
 * Fetches `/eco/suggestions` (rule-based, read-only) and renders them as a
 * horizontal chip strip above the chat. Picking one seeds the composer (and
 * scope) via `onPick` — it never sends automatically.
 */
export function EcoSuggestions({
  onPick,
}: {
  onPick: (suggestion: EcoSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<EcoSuggestion[]>([]);

  useEffect(() => {
    let active = true;
    ecoApi
      .getSuggestions()
      .then((res) => {
        if (active) setSuggestions(res.suggestions);
      })
      .catch(() => {
        // A nicety — a failure just hides the strip.
      });
    return () => {
      active = false;
    };
  }, []);

  if (suggestions.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>Para empezar</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {suggestions.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => onPick(s)}
            style={styles.chip}
            accessibilityRole="button"
          >
            <Text style={styles.chipTitle}>{s.title}</Text>
            <Text style={styles.chipReason} numberOfLines={1}>
              {s.reason}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: Colors.warm[500],
    marginBottom: 6,
  },
  strip: { gap: Spacing.sm, paddingRight: Spacing.lg },
  chip: {
    backgroundColor: Colors.sage[50],
    borderWidth: 1.5,
    borderColor: Colors.sage[200],
    borderRadius: Radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: 220,
  },
  chipTitle: { fontSize: 13, fontWeight: "700", color: Colors.sage[600] },
  chipReason: { fontSize: 11, color: Colors.warm[500], marginTop: 2 },
});
