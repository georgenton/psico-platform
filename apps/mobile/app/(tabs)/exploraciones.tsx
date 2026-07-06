import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { journeysApi } from "@psico/api-client";
import type { JourneyListItem, JourneyListResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Exploraciones — Sprint H1d · Mobile parity with design v2 (s-exploraciones).
 *
 * The web `/dashboard/exploraciones` page renders a `screen-head`, a
 * featured `.ex-feature` card with the first journey, then a
 * `.explore-grid` of `.ex-card` for the rest. We mirror that structure
 * on a single mobile column.
 *
 * Data: `journeysApi.list()` → `JourneyListResponse` (Sprint B5). Empty
 * state matches the design copy ("Próximamente — estamos curando…").
 */

type CoverPalette = "cool" | "warm" | "mixed";

const COVER_GRADIENTS: Record<
  CoverPalette,
  { backgroundColor: string; tint: string }
> = {
  cool: { backgroundColor: Colors.lavender[600], tint: Colors.lavender[700] },
  warm: { backgroundColor: Colors.warm[600], tint: Colors.warm[700] },
  mixed: { backgroundColor: Colors.sage[600], tint: Colors.sage[700] },
};

export default function ExploracionesScreen() {
  const router = useRouter();
  const [data, setData] = useState<JourneyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await journeysApi.list();
      setData(res);
    } catch {
      setError("No pudimos cargar las exploraciones.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Exploraciones",
          headerBackTitle: "Atrás",
        }}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={Colors.lavender[500]}
          />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.lavender[500]} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => {
                setLoading(true);
                load();
              }}
            >
              <Text style={styles.retryBtnText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* screen-head */}
            <View style={styles.head}>
              <Text style={styles.eyebrow}>Recorridos de transformación</Text>
              <Text style={styles.title}>Exploraciones</Text>
              <Text style={styles.sub}>
                No son cursos ni libros sueltos — son recorridos guiados hacia
                algo que quieres trabajar en ti. Cada uno combina lectura,
                ejercicios y reflexión, y alimenta tu mapa.
              </Text>
            </View>

            {!data || data.journeys.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <FeaturedCard
                  journey={data.journeys[0]!}
                  onPress={() => router.push("/(tabs)/books")}
                />
                {data.journeys.length > 1 ? (
                  <>
                    <Text style={styles.sectionLabel}>Más recorridos</Text>
                    <View style={styles.grid}>
                      {data.journeys.slice(1).map((j, i) => (
                        <ExploreCard
                          key={j.id}
                          journey={j}
                          index={i}
                          onPress={() => router.push("/(tabs)/books")}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyIcon}>🧭</Text>
      <Text style={styles.emptyTitle}>Próximamente</Text>
      <Text style={styles.emptyBody}>
        Estamos curando las primeras rutas. Vuelve en unos días para encontrar
        bundles temáticos de libros y prácticas.
      </Text>
    </View>
  );
}

// ─── FeaturedCard ────────────────────────────────────────────────────────

function FeaturedCard({
  journey,
  onPress,
}: {
  journey: JourneyListItem;
  onPress: () => void;
}) {
  const palette = COVER_GRADIENTS[journey.coverToken];
  const bookCount = journey.books.length;
  return (
    <Pressable
      style={[styles.featured, { backgroundColor: palette.backgroundColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Recorrido destacado: ${journey.title}`}
    >
      <Text style={styles.featuredTag}>Recorrido destacado</Text>
      <Text style={styles.featuredTitle}>{journey.title}</Text>
      <Text style={styles.featuredSubtitle}>{journey.subtitle}</Text>
      {journey.description ? (
        <Text style={styles.featuredDescription} numberOfLines={3}>
          {journey.description}
        </Text>
      ) : null}

      <View style={styles.featuredMeta}>
        <View style={styles.featuredMetaItem}>
          <Ionicons name="book-outline" size={13} color={Colors.white} />
          <Text style={styles.featuredMetaText}>
            {bookCount} {bookCount === 1 ? "libro" : "libros"}
          </Text>
        </View>
        <View style={styles.featuredMetaItem}>
          <Ionicons name="time-outline" size={13} color={Colors.white} />
          <Text style={styles.featuredMetaText}>
            {formatDuration(journey.durationMinutes)}
          </Text>
        </View>
      </View>

      <View style={styles.featuredCta}>
        <Text style={styles.featuredCtaText}>Empezar recorrido →</Text>
      </View>
    </Pressable>
  );
}

// ─── ExploreCard ─────────────────────────────────────────────────────────

function ExploreCard({
  journey,
  index,
  onPress,
}: {
  journey: JourneyListItem;
  index: number;
  onPress: () => void;
}) {
  const palette = COVER_GRADIENTS[journey.coverToken];
  const sage = index % 2 === 1;
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Recorrido: ${journey.title}`}
    >
      <View
        style={[styles.cardCover, { backgroundColor: palette.backgroundColor }]}
      >
        <Ionicons name="compass" size={28} color={Colors.white} />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTag, sage ? styles.cardTagSage : null]}>
          {journey.books.length} libros ·{" "}
          {formatDuration(journey.durationMinutes)}
        </Text>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {journey.title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {journey.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl,
  },
  errorText: {
    color: Colors.warm[600],
    marginBottom: Spacing.md,
    fontSize: 14,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.lavender[500],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: "600",
    fontSize: 14,
  },

  // head
  head: {
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.lavender[500],
  },
  title: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    letterSpacing: -0.5,
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.warm[600],
    lineHeight: 20,
  },

  // empty
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.warm[200],
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.warm[900],
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: Colors.warm[600],
    textAlign: "center",
    lineHeight: 19,
  },

  // featured card
  featured: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  featuredTag: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.85)",
  },
  featuredTitle: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: "800",
    color: Colors.white,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  featuredSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "rgba(255,255,255,0.92)",
    lineHeight: 20,
  },
  featuredDescription: {
    marginTop: 10,
    fontSize: 13,
    color: "rgba(255,255,255,0.78)",
    lineHeight: 19,
  },
  featuredMeta: {
    marginTop: 14,
    flexDirection: "row",
    gap: 12,
  },
  featuredMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  featuredMetaText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.white,
  },
  featuredCta: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: Colors.white,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  featuredCtaText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: Colors.warm[900],
  },

  // section label
  sectionLabel: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.warm[500],
  },

  // grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.warm[200],
  },
  cardCover: {
    height: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: Spacing.sm,
  },
  cardTag: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.lavender[600],
  },
  cardTagSage: {
    color: Colors.sage[600],
  },
  cardTitle: {
    marginTop: 6,
    fontSize: 13.5,
    fontWeight: "700",
    color: Colors.warm[900],
    lineHeight: 18,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 11.5,
    color: Colors.warm[600],
    lineHeight: 16,
  },
});
