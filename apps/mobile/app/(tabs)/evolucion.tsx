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
  EmotionalMapResult,
  EvolucionEmotionalSeriesPoint,
  EvolucionMilestone,
  EvolucionResponse,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Mi Evolución — Sprint H1b · Mobile parity with design v2 (s-evolucion).
 *
 * The web `/dashboard/evolucion` uses a 2-col grid: `.evo-chart` (line
 * chart with monthly snapshots) + `.evo-quarter` (3 stats rows), then a
 * `.tl` vertical timeline of milestones. On mobile we stack the same
 * three concepts in a single column.
 *
 * Chart rendering uses pure RN Views (vertical bars) instead of SVG to
 * avoid adding `react-native-svg` as a dep just for this surface — bars
 * communicate the same trend on a phone-sized canvas and we don't need
 * the curve fidelity. Snapshot-only fallback when series length < 2
 * mirrors the web EvoChart.
 *
 * Two parallel fetches: `/evolucion` (stats + milestones + series, Sprint
 * E1+G2) and `/home` (cached emotionalMap for the snapshot fallback).
 */

const MAX_BAR_HEIGHT = 110;

const MONTH_LABELS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const ICON_BY_TOKEN: Record<string, IconName> = {
  "book-open": "book-outline",
  flame: "flame-outline",
  star: "star-outline",
  patterns: "stats-chart-outline",
  eco: "leaf-outline",
  reflections: "create-outline",
};

export default function EvolucionScreen() {
  const router = useRouter();
  const [evolucion, setEvolucion] = useState<EvolucionResponse | null>(null);
  const [map, setMap] = useState<EmotionalMapResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [evolucionResult, homeResult] = await Promise.allSettled([
      evolucionApi.get(),
      homeApi.get(),
    ]);
    if (evolucionResult.status !== "fulfilled") {
      setError("No pudimos cargar tu evolución.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setEvolucion(evolucionResult.value);
    setMap(
      homeResult.status === "fulfilled" ? homeResult.value.emotionalMap : null,
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
          title: "Mi Evolución",
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
        ) : error || !evolucion ? (
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
            {/* screen-head */}
            <View style={styles.head}>
              <Text style={styles.eyebrow}>Tu transformación en el tiempo</Text>
              <Text style={styles.title}>Mi Evolución</Text>
              <Text style={styles.sub}>
                No es un registro de cuánto leíste, sino de cómo fuiste
                cambiando. Cada hito es un momento en que entendiste algo nuevo
                sobre ti.
              </Text>
            </View>

            {/* evo-chart */}
            <EvoChartMobile map={map} series={evolucion.emotionalSeries} />

            {/* evo-quarter — stat rows. Fase C: Evolución IS the learning
                dashboard, so the engagement counters that used to sit on the
                map screen (Eco chats, reading marks) land here. */}
            <View style={styles.quarter}>
              <Text style={styles.quarterTag}>Este trimestre</Text>
              <QuarterRow
                icon="create-outline"
                value={
                  evolucion.stats.reflexiones === 1
                    ? "1 reflexión"
                    : `${evolucion.stats.reflexiones} reflexiones`
                }
                label="escritas este mes"
              />
              <QuarterRow
                icon="book-outline"
                value={
                  evolucion.stats.capitulosCompletados === 1
                    ? "1 capítulo"
                    : `${evolucion.stats.capitulosCompletados} capítulos`
                }
                label="terminados de tus libros"
              />
              <QuarterRow
                icon="leaf-outline"
                value={
                  evolucion.stats.conversacionesEco === 1
                    ? "1 mensaje con Eco"
                    : `${evolucion.stats.conversacionesEco} mensajes con Eco`
                }
                label="conversaciones que iniciaste tú"
              />
              <QuarterRow
                icon="create-outline"
                value={
                  evolucion.stats.marcasLectura === 1
                    ? "1 subrayado o nota"
                    : `${evolucion.stats.marcasLectura} subrayados y notas`
                }
                label="marcas que dejaste al leer"
              />
              <QuarterRow
                icon="flame-outline"
                value={
                  evolucion.stats.rachaActual === 0
                    ? "Aún sin racha activa"
                    : `${evolucion.stats.rachaActual} días seguidos`
                }
                label={
                  evolucion.stats.rachaMasLarga > evolucion.stats.rachaActual
                    ? `tu mejor racha fue ${evolucion.stats.rachaMasLarga} días`
                    : "tu racha más larga hasta hoy"
                }
              />
            </View>

            {/* tl — milestones timeline */}
            <View style={styles.tlCard}>
              <Text style={styles.tlTag}>Hitos de tu transformación</Text>
              {evolucion.milestones.length === 0 ? (
                <Text style={styles.tlEmpty}>
                  Cuando completes acciones (primera reflexión, primer capítulo,
                  7 días seguidos…) verás cada hito que vas desbloqueando aquí.
                </Text>
              ) : (
                <Timeline milestones={evolucion.milestones} />
              )}
            </View>

            <Pressable
              style={styles.mapCta}
              onPress={() => router.push("/(tabs)/mapa")}
              accessibilityRole="button"
            >
              <Text style={styles.mapCtaText}>Ver mi mapa emocional →</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

// ─── EvoChartMobile ──────────────────────────────────────────────────────

function EvoChartMobile({
  map,
  series,
}: {
  map: EmotionalMapResult | null;
  series: EvolucionEmotionalSeriesPoint[];
}) {
  const hasSeries = series.length >= 2;
  const snapshotPct = map?.pct ?? 0;
  const lastPct = hasSeries ? series[series.length - 1]!.pct : snapshotPct;
  const firstPct = hasSeries ? series[0]!.pct : snapshotPct;
  const delta = lastPct - firstPct;

  // Snapshot fallback: synthesize a 6-bar series with the snapshot at the end.
  const displaySeries = hasSeries
    ? series
    : Array.from({ length: 6 }, (_, i) => ({
        monthIso: i === 5 ? "now" : `gap-${i}`,
        pct: i === 5 ? snapshotPct : 0,
      }));

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTag}>Comprensión emocional</Text>
      <View style={styles.chartScore}>
        <Text style={styles.chartValue}>{lastPct}%</Text>
        <View style={styles.chartDelta}>
          <Ionicons name="trending-up" size={11} color={Colors.sage[600]} />
          <Text style={styles.chartDeltaText}>
            {hasSeries
              ? `${delta >= 0 ? "+" : ""}${delta} pts en ${series.length === 1 ? "1 mes" : `${series.length} meses`}`
              : "Snapshot actual"}
          </Text>
        </View>
      </View>

      <View style={styles.chartBars}>
        {displaySeries.map((p, i) => {
          const isLast = i === displaySeries.length - 1;
          const isPlaceholder = !hasSeries && !isLast;
          const heightPx = Math.max(
            isPlaceholder ? 6 : 12,
            (p.pct / 100) * MAX_BAR_HEIGHT,
          );
          return (
            <View key={p.monthIso} style={styles.chartBarCol}>
              <View
                style={[
                  styles.chartBar,
                  {
                    height: heightPx,
                    backgroundColor: isPlaceholder
                      ? Colors.warm[200]
                      : isLast
                        ? Colors.lavender[600]
                        : Colors.lavender[400],
                  },
                ]}
                accessibilityRole="image"
                accessibilityLabel={`${p.pct}% — ${i === displaySeries.length - 1 ? "último mes" : formatMonth(p.monthIso)}`}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.chartXAxis}>
        {hasSeries
          ? series.map((p) => (
              <Text key={p.monthIso} style={styles.chartXLabel}>
                {formatMonth(p.monthIso)}
              </Text>
            ))
          : ["—", "—", "—", "—", "—", "Hoy"].map((s, i) => (
              <Text key={i} style={styles.chartXLabel}>
                {s}
              </Text>
            ))}
      </View>
      {!hasSeries ? (
        <Text style={styles.chartHint}>
          Cuando acumules más meses de práctica, aquí verás tu evolución real.
          Por ahora, solo tu snapshot de hoy.
        </Text>
      ) : null}
    </View>
  );
}

// ─── QuarterRow ──────────────────────────────────────────────────────────

function QuarterRow({
  icon,
  value,
  label,
}: {
  icon: IconName;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.quarterRow}>
      <View style={styles.quarterIcon}>
        <Ionicons name={icon} size={18} color={Colors.lavender[600]} />
      </View>
      <View style={styles.quarterMeta}>
        <Text style={styles.quarterValue}>{value}</Text>
        <Text style={styles.quarterLabel}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────

function Timeline({ milestones }: { milestones: EvolucionMilestone[] }) {
  const unlocked = milestones
    .filter((m) => m.unlockedAt !== null)
    .sort((a, b) => (a.unlockedAt ?? "").localeCompare(b.unlockedAt ?? ""));
  const inProgress = milestones
    .filter((m) => m.unlockedAt === null)
    .slice(0, 2);

  return (
    <View style={styles.tlList}>
      {unlocked.map((m, i) => (
        <TimelineItem
          key={m.id}
          milestone={m}
          variant={i % 2 === 1 ? "sage" : "default"}
        />
      ))}
      {inProgress.map((m) => (
        <TimelineItem key={m.id} milestone={m} variant="next" />
      ))}
    </View>
  );
}

function TimelineItem({
  milestone,
  variant,
}: {
  milestone: EvolucionMilestone;
  variant: "default" | "sage" | "next";
}) {
  const icon = ICON_BY_TOKEN[milestone.icon] ?? "stats-chart-outline";
  const isNext = variant === "next";
  const dotBg = isNext
    ? Colors.warm[100]
    : variant === "sage"
      ? Colors.sage[100]
      : Colors.lavender[100];
  const dotIconColor = isNext
    ? Colors.warm[500]
    : variant === "sage"
      ? Colors.sage[600]
      : Colors.lavender[600];

  return (
    <View style={styles.tlItem}>
      <View style={styles.tlDotCol}>
        <View
          style={[
            styles.tlDot,
            { backgroundColor: dotBg },
            isNext ? styles.tlDotDashed : null,
          ]}
        >
          <Ionicons name={icon} size={18} color={dotIconColor} />
        </View>
        <View style={styles.tlLine} />
      </View>
      <View style={styles.tlBody}>
        <Text style={styles.tlMonth}>
          {formatMilestoneDate(milestone.unlockedAt) ?? "Próximo paso"}
        </Text>
        <Text style={styles.tlHeadline}>{milestone.label}</Text>
        <Text style={styles.tlDescription}>{milestone.description}</Text>
        <View
          style={[
            styles.tlChip,
            isNext ? styles.tlChipNext : null,
            variant === "sage" ? styles.tlChipSage : null,
          ]}
        >
          <Text style={styles.tlChipText}>
            {isNext
              ? `Falta: ${Math.max(0, milestone.progressTarget - milestone.progressCurrent)}`
              : milestone.category
                ? `+ ${milestone.category}`
                : "+ hito desbloqueado"}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function formatMonth(iso: string): string {
  const monthIdx = Number(iso.slice(5, 7)) - 1;
  return MONTH_LABELS[monthIdx] ?? "—";
}

function formatMilestoneDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const month = d.toLocaleDateString("es-EC", { month: "long" });
  return month.charAt(0).toUpperCase() + month.slice(1);
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

  // chart card
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
  },
  chartTag: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.lavender[600],
  },
  chartScore: {
    marginTop: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  chartValue: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.warm[900],
    letterSpacing: -0.7,
  },
  chartDelta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.sage[100],
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  chartDeltaText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.sage[700],
  },
  chartBars: {
    marginTop: 12,
    height: MAX_BAR_HEIGHT + 4,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    gap: 4,
  },
  chartBarCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  chartBar: {
    width: "100%",
    maxWidth: 32,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  chartXAxis: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  chartXLabel: {
    fontSize: 10,
    color: Colors.warm[500],
    fontWeight: "600",
  },
  chartHint: {
    marginTop: 12,
    fontSize: 12,
    color: Colors.warm[500],
    lineHeight: 17,
  },

  // quarter
  quarter: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
    gap: 12,
  },
  quarterTag: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.sage[600],
    marginBottom: 4,
  },
  quarterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quarterIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
  },
  quarterMeta: {
    flex: 1,
  },
  quarterValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  quarterLabel: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.warm[500],
  },

  // timeline card
  tlCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
  },
  tlTag: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.lavender[600],
    marginBottom: 14,
  },
  tlEmpty: {
    fontSize: 13,
    color: Colors.warm[500],
    lineHeight: 19,
  },
  tlList: {
    gap: 4,
  },
  tlItem: {
    flexDirection: "row",
    gap: 12,
  },
  tlDotCol: {
    alignItems: "center",
    width: 36,
  },
  tlDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tlDotDashed: {
    borderWidth: 1.5,
    borderColor: Colors.warm[300],
    borderStyle: "dashed",
  },
  tlLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.warm[200],
    marginTop: 2,
  },
  tlBody: {
    flex: 1,
    paddingBottom: 18,
  },
  tlMonth: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Colors.warm[500],
  },
  tlHeadline: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  tlDescription: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.warm[600],
    lineHeight: 18,
  },
  tlChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: Colors.lavender[100],
  },
  tlChipSage: {
    backgroundColor: Colors.sage[100],
  },
  tlChipNext: {
    backgroundColor: Colors.warm[100],
  },
  tlChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.lavender[700],
  },

  // CTA
  mapCta: {
    marginTop: Spacing.sm,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.lavender[100],
    borderRadius: Radius.md,
  },
  mapCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.lavender[700],
  },
});
