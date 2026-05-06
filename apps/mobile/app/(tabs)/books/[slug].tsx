import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { contentApi } from "@psico/api-client";
import type { BookWithChapters, UserPlan } from "@psico/types";
import { useAuth } from "@/context/auth";
import { Colors, Radius, Spacing } from "@/theme";

const PLAN_RANK: Record<UserPlan, number> = {
  FREE: 0,
  PRO: 1,
  ANNUAL: 2,
  B2B: 3,
};

const PLAN_LABEL: Record<UserPlan, string> = {
  FREE: "Gratuito",
  PRO: "Pro",
  ANNUAL: "Pro Anual",
  B2B: "Empresarial",
};

export default function BookDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [book, setBook] = useState<BookWithChapters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    contentApi
      .getBook(slug)
      .then(setBook)
      .catch(() => setError("No se pudo cargar el libro."))
      .finally(() => setLoading(false));
  }, [slug]);

  if (!user) return null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.lavender[500]} />
      </View>
    );
  }

  if (error || !book) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Libro no encontrado."}</Text>
      </View>
    );
  }

  const isLocked = PLAN_RANK[book.plan] > PLAN_RANK[user.plan];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Cover */}
      <View style={styles.coverContainer}>
        <View style={styles.cover}>
          <Text style={styles.coverInitials}>
            {book.title.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Book info */}
      <View style={styles.content}>
        {book.plan !== "FREE" ? (
          <View style={styles.planBadgeRow}>
            <Ionicons
              name={isLocked ? "lock-closed" : "checkmark-circle"}
              size={14}
              color={isLocked ? Colors.lavender[500] : Colors.sage[500]}
            />
            <Text
              style={[
                styles.planBadgeText,
                { color: isLocked ? Colors.lavender[500] : Colors.sage[500] },
              ]}
            >
              {isLocked
                ? `Requiere plan ${PLAN_LABEL[book.plan]}`
                : `Plan ${PLAN_LABEL[book.plan]}`}
            </Text>
          </View>
        ) : null}

        <Text style={styles.title}>{book.title}</Text>

        {book.description ? (
          <Text style={styles.description}>{book.description}</Text>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="list" size={16} color={Colors.warm[500]} />
            <Text style={styles.statText}>{book.totalChapters} capítulos</Text>
          </View>
        </View>

        {/* Chapter list */}
        <Text style={styles.sectionTitle}>Capítulos</Text>

        {book.chapters.length === 0 ? (
          <Text style={styles.emptyText}>
            No hay capítulos disponibles aún.
          </Text>
        ) : (
          book.chapters.map((chapter, idx) => (
            <View key={chapter.id} style={styles.chapterRow}>
              <View style={styles.chapterNumber}>
                <Text style={styles.chapterNumberText}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chapterTitle}>{chapter.title}</Text>
                {chapter.durationMinutes ? (
                  <Text style={styles.chapterMeta}>
                    {chapter.durationMinutes} min
                  </Text>
                ) : null}
              </View>
              {isLocked ? (
                <Ionicons
                  name="lock-closed"
                  size={14}
                  color={Colors.warm[400]}
                />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={Colors.warm[400]}
                />
              )}
            </View>
          ))
        )}

        {/* Upgrade CTA when locked */}
        {isLocked ? (
          <View style={styles.upgradeCta}>
            <Ionicons name="star" size={28} color={Colors.lavender[500]} />
            <Text style={styles.upgradeTitle}>
              Desbloquea este libro con plan {PLAN_LABEL[book.plan]}
            </Text>
            <Text style={styles.upgradeSubtitle}>
              Accede a todos los capítulos, audios y ejercicios.
            </Text>
            <Pressable
              style={styles.upgradeBtn}
              onPress={() => router.push("/(tabs)/plan")}
            >
              <Text style={styles.upgradeBtnText}>Actualizar mi plan</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    paddingBottom: Spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
    padding: Spacing.lg,
  },
  errorText: {
    fontSize: 15,
    color: Colors.warm[600],
    textAlign: "center",
  },
  coverContainer: {
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  cover: {
    width: 140,
    height: 190,
    borderRadius: Radius.xl,
    backgroundColor: Colors.lavender[200],
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.lavender[950],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  coverInitials: {
    fontSize: 48,
    fontWeight: "700",
    color: Colors.lavender[600],
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  planBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.warm[800],
    lineHeight: 32,
  },
  description: {
    fontSize: 15,
    color: Colors.warm[600],
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: Colors.warm[500],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  emptyText: {
    fontSize: 14,
    color: Colors.warm[500],
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: Colors.warm[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  chapterNumber: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
  },
  chapterNumberText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.lavender[600],
  },
  chapterTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[800],
  },
  chapterMeta: {
    fontSize: 11,
    color: Colors.warm[500],
    marginTop: 2,
  },
  upgradeCta: {
    backgroundColor: Colors.lavender[50],
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[800],
    textAlign: "center",
  },
  upgradeSubtitle: {
    fontSize: 13,
    color: Colors.warm[500],
    textAlign: "center",
    lineHeight: 18,
  },
  upgradeBtn: {
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    marginTop: Spacing.sm,
  },
  upgradeBtnText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
});
