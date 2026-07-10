import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ecoChapterPrompt } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";
import { setEcoReaderHandoff } from "@/lib/eco/reader-handoff";

/**
 * EcoTopicCard — Sprint B (Eco contextual, mobile).
 *
 * A small, dismissible invitation shown near the top of a chapter, offering a
 * curated topic to explore with Eco (see ECO_CHAPTER_PROMPTS in @psico/types,
 * with a title-based fallback). Discreet by design — it never blocks reading
 * and can be dismissed for the session.
 *
 * When `onOpenEco` is provided (the reader), tapping opens the companion sheet
 * on the Eco tab with the topic seeded — no navigation. Without it, it falls
 * back to the reader→Eco handoff + navigating to the Eco tab.
 */
export function EcoTopicCard({
  bookSlug,
  chapterOrder,
  chapterTitle,
  onOpenEco,
}: {
  bookSlug: string;
  chapterOrder: number;
  chapterTitle: string;
  onOpenEco?: (prompt: string) => void;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const topic = ecoChapterPrompt(bookSlug, chapterOrder, chapterTitle);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>🌿</Text>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>CONVERSA CON ECO</Text>
          <Text style={styles.topicTitle}>{topic.title}</Text>
        </View>
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityLabel="Ocultar sugerencia"
          hitSlop={8}
        >
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() => {
          if (onOpenEco) {
            onOpenEco(topic.prompt);
            return;
          }
          setEcoReaderHandoff(topic.prompt, {
            bookSlug,
            chapterOrder,
            kind: "topic",
          });
          router.push("/eco" as never);
        }}
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.ctaText}>Explorar este tema →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.sage[200],
    backgroundColor: Colors.sage[50],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  icon: { fontSize: 18, marginTop: 1 },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: Colors.sage[600],
  },
  topicTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: Colors.warm[900],
    marginTop: 2,
  },
  close: { fontSize: 18, color: Colors.warm[400], paddingHorizontal: 4 },
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
