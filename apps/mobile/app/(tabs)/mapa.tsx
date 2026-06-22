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
import { evolucionApi, homeApi } from "@psico/api-client";
import type {
  EmotionalMapAxes,
  EmotionalMapResult,
  EvolucionStats,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Mapa Emocional — Sprint H1b · Mobile parity with design v2 (s-mapa).
 *
 * The web `/dashboard/mapa` page uses a 2-col grid: `map-stage` (dark
 * radar) + `map-dims` (axis bars), plus `map-feed` chips below. On a
 * phone the radar visual is too small to read, so we lead with the
 * comprehension score and the 6 axis bars stacked vertically, then a
 * feed-equivalent summary card with the evolución stats.
 *
 * Two parallel fetches: `/home` (cached emotional map, Sprint D) and
 * `/evolucion` (stats for the feed counts). Pull-to-refresh re-fires
 * both.
 */

const AXES = [
  "Calma",
  "Claridad",
  "Conexión",
  "Propósito",
  "Compasión",
  "Consciencia",
] as const;

type AxisIcon = React.ComponentProps<typeof Ionicons>["name"];

const AXIS_ICONS: AxisIcon[] = [
  "leaf-outline",
  "book-outline",
  "people-outline",
  "flame-outline",
  "heart-outline",
  "bulb-outline",
];

export default function MapaScreen() {
  const router = useRouter();
  const [map, setMap] = useState<EmotionalMapResult | null>(null);
  const [stats, setStats] = useState<EvolucionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [homeResult, evolucionResult] = await Promise.allSettled([
      homeApi.get(),
      evolucionApi.get(),
    ]);
    if (homeResult.status !== "fulfilled") {
      setError("No pudimos cargar tu mapa emocional.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setMap(homeResult.value.emotionalMap);
    setStats(
      evolucionResult.status === "fulfilled"
        ? evolucionResult.value.stats
        : null,
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Mi Mapa Emocional",
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
        ) : error || !map ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>
              {error ?? "Sin datos para mostrar."}
            </Text>
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
            {/* screen-head equivalent */}
            <View style={styles.head}>
              <Text style={styles.eyebrow}>El corazón de tu experiencia</Text>
              <Text style={styles.title}>Tu Mapa Emocional</Text>
              <Text style={styles.sub}>
                Una representación viva de tu mundo interior. Se actualiza sola
                a medida que lees, escribes y conversas.
              </Text>
            </View>

            {/* map-stage replacement — dark card with score + provider chip */}
            <View style={styles.stage}>
              <View style={styles.stageHead}>
                <View style={styles.stageDot} />
                <Text style={styles.stageTitle}>
                  Dimensiones del autoconocimiento
                </Text>
              </View>
              <Text style={styles.stageMeta}>
                Actualizado · {formatDate(map.computedAt)}
              </Text>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreValue}>{map.pct}%</Text>
                <Text style={styles.scoreLabel}>Comprensión emocional</Text>
              </View>
              <View style={styles.providerChip}>
                <Ionicons name="trending-up" size={12} color={Colors.white} />
                <Text style={styles.providerText}>
                  {map.provider === "anthropic"
                    ? "Análisis con IA"
                    : "Análisis rule-based"}
                </Text>
              </View>
            </View>

            {/* map-dims — 6 stacked bars */}
            <View style={styles.dims}>
              {AXES.map((label, i) => {
                const v = (map.values as EmotionalMapAxes)[i] ?? 0.5;
                const pct = Math.round(v * 100);
                const icon = AXIS_ICONS[i] ?? "ellipse-outline";
                return (
                  <View key={label} style={styles.dim}>
                    <View style={styles.dimTop}>
                      <View style={styles.dimName}>
                        <View style={styles.dimIconWrap}>
                          <Ionicons
                            name={icon}
                            size={15}
                            color={Colors.lavender[600]}
                          />
                        </View>
                        <Text style={styles.dimLabel}>{label}</Text>
                      </View>
                      <Text style={styles.dimPct}>{pct}%</Text>
                    </View>
                    <View
                      style={styles.dimBar}
                      accessibilityRole="progressbar"
                      accessibilityLabel={`${label} ${pct}%`}
                    >
                      <View style={[styles.dimFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* map-feed equivalent — resumen card */}
            {stats ? (
              <View style={styles.feed}>
                <Text style={styles.feedTag}>Lo que alimenta tu mapa</Text>
                <FeedRow
                  icon="create-outline"
                  value={stats.reflexiones}
                  label={
                    stats.reflexiones === 1
                      ? "reflexión escrita"
                      : "reflexiones escritas"
                  }
                />
                <FeedRow
                  icon="book-outline"
                  value={stats.capitulosCompletados}
                  label={
                    stats.capitulosCompletados === 1
                      ? "capítulo terminado"
                      : "capítulos terminados"
                  }
                />
                <FeedRow
                  icon="time-outline"
                  value={stats.minutosLectura}
                  label="minutos de lectura"
                />
                <FeedRow
                  icon="flame-outline"
                  value={stats.rachaActual}
                  label={
                    stats.rachaActual === 1
                      ? "día seguido"
                      : "días seguidos hoy"
                  }
                />
              </View>
            ) : null}

            <Pressable
              style={styles.evoCta}
              onPress={() => router.push("/(tabs)/evolucion")}
              accessibilityRole="button"
            >
              <Text style={styles.evoCtaText}>Ver mi evolución →</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

// ─── FeedRow ──────────────────────────────────────────────────────────────

function FeedRow({
  icon,
  value,
  label,
}: {
  icon: AxisIcon;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.feedRow}>
      <View style={styles.feedRowIcon}>
        <Ionicons name={icon} size={16} color={Colors.sage[600]} />
      </View>
      <Text style={styles.feedRowValue}>{value}</Text>
      <Text style={styles.feedRowLabel}>{label}</Text>
    </View>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  // stage (dark hero card)
  stage: {
    backgroundColor: Colors.warm[900],
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  stageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.sage[400],
  },
  stageTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.85)",
  },
  stageMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  scoreRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  scoreValue: {
    fontSize: 40,
    fontWeight: "800",
    color: Colors.white,
    letterSpacing: -1,
  },
  scoreLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
  providerChip: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  providerText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.white,
  },

  // dims
  dims: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
    gap: 14,
  },
  dim: {},
  dimTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  dimName: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dimIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
  },
  dimLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.warm[800],
  },
  dimPct: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.warm[500],
  },
  dimBar: {
    height: 7,
    borderRadius: 9999,
    backgroundColor: Colors.warm[100],
    overflow: "hidden",
  },
  dimFill: {
    height: "100%",
    backgroundColor: Colors.lavender[500],
    borderRadius: 9999,
  },

  // feed
  feed: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
    gap: 10,
  },
  feedTag: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.sage[600],
    marginBottom: 6,
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  feedRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.sage[100],
    alignItems: "center",
    justifyContent: "center",
  },
  feedRowValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.warm[900],
    minWidth: 30,
  },
  feedRowLabel: {
    fontSize: 13,
    color: Colors.warm[600],
    flex: 1,
  },

  // CTA
  evoCta: {
    marginTop: Spacing.sm,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.lavender[100],
    borderRadius: Radius.md,
  },
  evoCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.lavender[700],
  },
});
