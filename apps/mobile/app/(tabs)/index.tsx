import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { contentApi } from "@psico/api-client";
import type { Book } from "@psico/types";
import { useAuth } from "@/context/auth";
import { Colors, Radius, Spacing } from "@/theme";
import type { UserPlan } from "@psico/types";

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

const PLAN_COLORS: Record<UserPlan, string> = {
  FREE: Colors.warm[400],
  PRO: Colors.lavender[500],
  ANNUAL: Colors.lavender[600],
  B2B: Colors.sage[500],
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);

  useEffect(() => {
    contentApi
      .getBooks()
      .then((data) => setBooks(data.slice(0, 4)))
      .catch(() => {})
      .finally(() => setLoadingBooks(false));
  }, []);

  if (!user) return null;

  const userPlanRank = PLAN_RANK[user.plan];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.userName}>{user.name.split(" ")[0]} 👋</Text>
        </View>
        <View
          style={[
            styles.planBadge,
            { backgroundColor: PLAN_COLORS[user.plan] + "20" },
          ]}
        >
          <Ionicons
            name="diamond"
            size={12}
            color={PLAN_COLORS[user.plan]}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.planLabel, { color: PLAN_COLORS[user.plan] }]}>
            {PLAN_LABEL[user.plan]}
          </Text>
        </View>
      </View>

      {/* Featured banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Psicoeducación contigo</Text>
        <Text style={styles.bannerSubtitle}>
          Aprende a gestionar tus emociones con libros y ejercicios guiados.
        </Text>
        <Pressable
          style={styles.bannerCta}
          onPress={() => router.push("/(tabs)/books")}
        >
          <Text style={styles.bannerCtaText}>Explorar biblioteca</Text>
          <Ionicons
            name="arrow-forward"
            size={16}
            color={Colors.lavender[600]}
          />
        </Pressable>
      </View>

      {/* Recent books */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Biblioteca</Text>

        {loadingBooks ? (
          <ActivityIndicator
            color={Colors.lavender[500]}
            style={{ marginTop: Spacing.md }}
          />
        ) : (
          <FlatList
            data={books}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              gap: Spacing.md,
              paddingRight: Spacing.md,
            }}
            renderItem={({ item }) => {
              const locked = PLAN_RANK[item.plan] > userPlanRank;
              return (
                <Pressable
                  style={styles.bookCard}
                  onPress={() =>
                    locked
                      ? router.push("/(tabs)/plan")
                      : router.push(`/(tabs)/books/${item.slug}`)
                  }
                >
                  {/* Cover placeholder */}
                  <View
                    style={[styles.bookCover, locked && styles.bookCoverLocked]}
                  >
                    <Text style={styles.bookInitials}>
                      {item.title.slice(0, 2).toUpperCase()}
                    </Text>
                    {locked ? (
                      <View style={styles.lockOverlay}>
                        <Ionicons
                          name="lock-closed"
                          size={20}
                          color={Colors.white}
                        />
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {locked ? (
                    <Text style={styles.bookPlanBadge}>
                      {PLAN_LABEL[item.plan]}
                    </Text>
                  ) : (
                    <Text style={styles.bookChapters}>
                      {item.totalChapters} capítulos
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* Upgrade CTA for free users */}
      {user.plan === "FREE" ? (
        <Pressable
          style={styles.upgradeBanner}
          onPress={() => router.push("/(tabs)/plan")}
        >
          <Ionicons name="star" size={20} color={Colors.lavender[500]} />
          <View style={{ flex: 1, marginLeft: Spacing.sm }}>
            <Text style={styles.upgradeTitle}>
              Desbloquea todo el contenido
            </Text>
            <Text style={styles.upgradeSubtitle}>
              Actualiza a Pro desde $7/mes
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={Colors.lavender[500]}
          />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greeting: {
    fontSize: 15,
    color: Colors.warm[500],
  },
  userName: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  planLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  banner: {
    backgroundColor: Colors.lavender[100],
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.lavender[800],
    marginBottom: Spacing.xs,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: Colors.warm[600],
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  bannerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "flex-start",
  },
  bannerCtaText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.lavender[600],
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  bookCard: {
    width: 140,
  },
  bookCover: {
    width: 140,
    height: 190,
    borderRadius: Radius.lg,
    backgroundColor: Colors.lavender[200],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  bookCoverLocked: {
    backgroundColor: Colors.warm[300],
  },
  bookInitials: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.lavender[600],
  },
  lockOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  bookTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.warm[800],
    lineHeight: 18,
  },
  bookPlanBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.lavender[500],
    marginTop: 2,
  },
  bookChapters: {
    fontSize: 11,
    color: Colors.warm[500],
    marginTop: 2,
  },
  upgradeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.lavender[50],
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
    borderRadius: Radius.xl,
    padding: Spacing.md,
  },
  upgradeTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  upgradeSubtitle: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: 2,
  },
});
