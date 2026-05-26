import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { booksApi } from "@psico/api-client";
import type { BookListItem, UserPlan } from "@psico/types";
import { useAuth } from "@/context/auth";
import { Colors, Radius, Spacing } from "@/theme";

const PLAN_RANK: Record<UserPlan, number> = {
  FREE: 0,
  PRO: 1,
  ANNUAL: 2,
  B2B: 3,
};

const COVER_COLORS = [
  Colors.lavender[200],
  Colors.sage[100],
  Colors.lavender[100],
  Colors.sage[50],
];

export default function BooksScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    booksApi
      .list()
      .then((data) => setBooks(data.books))
      .catch(() => setError("No se pudo cargar la biblioteca."))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  const userPlanRank = PLAN_RANK[user.plan];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.lavender[500]} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.retryBtn}
          onPress={() => {
            setError(null);
            setLoading(true);
            booksApi
              .list()
              .then((data) => setBooks(data.books))
              .catch(() => setError("No se pudo cargar la biblioteca."))
              .finally(() => setLoading(false));
          }}
        >
          <Text style={styles.retryBtnText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList<BookListItem>
      data={books}
      keyExtractor={(item) => item.id}
      numColumns={2}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        // BookListItem exposes tierRequired ("free"|"pro"). For the gating
        // we compare it to the user's plan rank (which is a UserPlan).
        const locked = (item.tierRequired === "pro" ? 1 : 0) > userPlanRank;
        const coverColor = COVER_COLORS[index % COVER_COLORS.length];

        return (
          <Pressable
            style={styles.card}
            onPress={() =>
              locked
                ? router.push("/(tabs)/plan")
                : router.push(`/(tabs)/books/${item.slug}`)
            }
          >
            {/* Cover */}
            <View style={[styles.cover, { backgroundColor: coverColor }]}>
              <Text style={styles.coverInitials}>
                {item.title.slice(0, 2).toUpperCase()}
              </Text>

              {locked ? (
                <View style={styles.lockOverlay}>
                  <Ionicons name="lock-closed" size={28} color={Colors.white} />
                  <Text style={styles.lockText}>Requiere plan Pro</Text>
                </View>
              ) : null}
            </View>

            {/* Info */}
            <View style={styles.info}>
              <Text style={styles.bookTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.bookMeta}>{item.chapters} capítulos</Text>
              {locked ? (
                <View style={styles.planTag}>
                  <Ionicons
                    name="lock-closed"
                    size={10}
                    color={Colors.lavender[500]}
                  />
                  <Text style={styles.planTagText}>Requiere plan Pro</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
    gap: Spacing.md,
  },
  errorText: {
    fontSize: 15,
    color: Colors.warm[600],
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  list: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  row: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: "hidden",
    shadowColor: Colors.warm[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cover: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverInitials: {
    fontSize: 40,
    fontWeight: "700",
    color: Colors.lavender[700],
  },
  lockOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(42, 36, 32, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  lockText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.white,
    textAlign: "center",
  },
  info: {
    padding: Spacing.sm,
    gap: 4,
  },
  bookTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[800],
    lineHeight: 18,
  },
  bookMeta: {
    fontSize: 11,
    color: Colors.warm[500],
  },
  planTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  planTagText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.lavender[500],
  },
});
