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
import { useRouter } from "expo-router";
import { ApiError, patronesApi } from "@psico/api-client";
import type {
  PatronesPeriod,
  PatronesResponse,
  PatronesWeeklySummary,
} from "@psico/types";

import { Colors, Radius, Spacing } from "@/theme";

/**
 * Patrones — mobile screen (Sprint S10).
 *
 * Mirrors the web /dashboard/patrones page:
 * - FREE → paywall preview with CTA to /plan
 * - Pro with <7 entries → empty state nudging to /diario
 * - Pro full view → mood heatmap + hour chart + weekly summary card
 *
 * Privacy contract: the server only aggregates plaintext metadata
 * (mood, tags, createdAt) — body cipher is never touched.
 */
export default function PatronesScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<PatronesPeriod>("30d");
  const [data, setData] = useState<PatronesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: PatronesPeriod) => {
    setError(null);
    try {
      const res = await patronesApi.get(p);
      setData(res);
    } catch {
      setError("No pudimos cargar tus patrones. Reintenta más tarde.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(period);
  }, [period, load]);

  function onRefresh() {
    setRefreshing(true);
    load(period);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.warm[50] }}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.lavender[500]}
        />
      }
    >
      <Text style={styles.title}>Patrones</Text>
      <Text style={styles.subtitle}>
        Lo que tu diario va dibujando con el tiempo.
      </Text>

      <PeriodTabs period={period} onChange={setPeriod} />

      {error ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : !data ? null : data.locked ? (
        <PaywallCard
          entryCount={data.entryCount}
          onCta={() => router.push("/plan")}
        />
      ) : data.entryCount < 7 ? (
        <EmptyState
          entryCount={data.entryCount}
          onCta={() => router.push("/(tabs)/reflexiones")}
        />
      ) : (
        <ProView data={data} onChanged={() => load(period)} />
      )}
    </ScrollView>
  );
}

// ───────────────────────────────────────────────────────────────────────

function PeriodTabs({
  period,
  onChange,
}: {
  period: PatronesPeriod;
  onChange: (p: PatronesPeriod) => void;
}) {
  const options: Array<{ value: PatronesPeriod; label: string }> = [
    { value: "30d", label: "30 días" },
    { value: "90d", label: "90 días" },
    { value: "1y", label: "1 año" },
  ];
  return (
    <View style={styles.tabsRow}>
      {options.map((o) => {
        const active = o.value === period;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PaywallCard({
  entryCount,
  onCta,
}: {
  entryCount: number;
  onCta: () => void;
}) {
  return (
    <View style={styles.paywall}>
      <Text style={styles.paywallEyebrow}>FUNCIÓN PRO</Text>
      <Text style={styles.paywallTitle}>
        Tu mapa emocional · sin descifrar nada
      </Text>
      <Text style={styles.paywallBody}>
        Hicimos los patrones para que veas tu propio ritmo: cuándo escribes, qué
        emociones se repiten, qué semanas estuvieron pesadas. Todo desde la
        metadata de tu diario, sin que el servidor toque tu texto.
      </Text>
      {[
        "Heatmap del mes con tus moods.",
        "Hora del día con más entradas.",
        "Resumen semanal generado por Eco (opt-in).",
        "Compartir con tu terapeuta (próximamente).",
      ].map((line) => (
        <Text key={line} style={styles.paywallBullet}>
          ✓ {line}
        </Text>
      ))}
      <Text style={styles.paywallFootnote}>
        Llevas {entryCount} entradas este período. Suficiente para empezar.
      </Text>
      <Pressable style={styles.proCta} onPress={onCta}>
        <Text style={styles.proCtaText}>Hazte Pro</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({
  entryCount,
  onCta,
}: {
  entryCount: number;
  onCta: () => void;
}) {
  return (
    <View style={[styles.card, { alignItems: "center" }]}>
      <Text style={{ fontSize: 28, marginBottom: 4 }}>🌱</Text>
      <Text style={styles.cardTitle}>Aún estamos juntando data</Text>
      <Text style={[styles.muted, { textAlign: "center", marginTop: 4 }]}>
        Necesitas al menos 7 entradas en este período para que los patrones
        muestren algo real. Llevas {entryCount}.
      </Text>
      <Pressable style={[styles.proCta, { marginTop: 16 }]} onPress={onCta}>
        <Text style={styles.proCtaText}>✎ Ir al Diario</Text>
      </Pressable>
    </View>
  );
}

function ProView({
  data,
  onChanged,
}: {
  data: PatronesResponse;
  onChanged: () => void;
}) {
  const swatchByMood: Record<string, string> = {};
  for (const d of data.moodMap) {
    if (!swatchByMood[d.moodId]) swatchByMood[d.moodId] = d.swatch;
  }

  return (
    <View style={{ gap: Spacing.md, marginTop: Spacing.md }}>
      <WeeklyCard summary={data.weeklySummary} onChanged={onChanged} />
      <MoodHeatmap days={data.moodMap} />
      <HourChart hourMood={data.hourMood} swatchByMood={swatchByMood} />
      <Text style={styles.disclaimer}>
        Las correlaciones que mostramos no son causas. Tu cuerpo y tu vida son
        más complejos que un gráfico.
      </Text>
    </View>
  );
}

function WeeklyCard({
  summary,
  onChanged,
}: {
  summary: PatronesWeeklySummary | null;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState(summary);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function regenerate() {
    setSubmitting(true);
    setErr(null);
    try {
      const body = await patronesApi.regenerateWeeklySummary();
      setCurrent(body.weeklySummary);
      onChanged();
    } catch (e: unknown) {
      const status = e instanceof ApiError ? e.statusCode : undefined;
      if (status === 422) {
        setErr("Necesitas al menos 7 entradas esta semana.");
      } else {
        setErr("No pudimos generar el resumen. Reintenta luego.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.weeklyCard}>
      <Text style={styles.weeklyEyebrow}>RESUMEN SEMANAL · IA</Text>
      {current ? (
        <>
          <Text style={styles.weeklyHeadline}>{current.headline}</Text>
          <Text style={styles.weeklyBody}>{current.narrative}</Text>
          <Text style={styles.weeklyMeta}>
            Generado el{" "}
            {new Date(current.generatedAt).toLocaleDateString("es-EC", {
              day: "numeric",
              month: "long",
            })}{" "}
            · {current.entriesUsed} entradas usadas
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.weeklyHeadline}>Tu resumen de la semana</Text>
          <Text style={styles.weeklyBody}>
            Pídele a Eco un párrafo editorial sobre tu semana — sin tocar el
            contenido cifrado de tus entradas.
          </Text>
        </>
      )}
      <Pressable
        style={[styles.weeklyCta, submitting && { opacity: 0.6 }]}
        onPress={regenerate}
        disabled={submitting}
      >
        <Text style={styles.weeklyCtaText}>
          {submitting
            ? "Generando…"
            : current
              ? "Regenerar"
              : "Generar resumen ahora"}
        </Text>
      </Pressable>
      {err ? <Text style={styles.weeklyErr}>{err}</Text> : null}
    </View>
  );
}

function MoodHeatmap({ days }: { days: PatronesResponse["moodMap"] }) {
  if (days.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>Tu mapa aparecerá cuando escribas más.</Text>
      </View>
    );
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;
  const start = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  const cells: Array<{ iso: string; swatch?: string }> = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    cells.push({ iso, swatch: byDate.get(iso)?.swatch });
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>MAPA EMOCIONAL · DÍA A DÍA</Text>
      <View style={styles.card}>
        <View style={styles.heatmapGrid}>
          {cells.map((c) => (
            <View
              key={c.iso}
              style={[
                styles.heatmapCell,
                {
                  backgroundColor: c.swatch ?? Colors.warm[100],
                  opacity: c.swatch ? 1 : 0.55,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function HourChart({
  hourMood,
  swatchByMood,
}: {
  hourMood: PatronesResponse["hourMood"];
  swatchByMood: Record<string, string>;
}) {
  const totals = hourMood.map((b) => {
    const entries = Object.entries(b.moodCounts);
    if (entries.length === 0) {
      return { hour: b.hour, count: 0, swatch: null as string | null };
    }
    let best = entries[0]!;
    let total = 0;
    for (const [m, n] of entries) {
      total += n;
      if (n > best[1]) best = [m, n];
    }
    return {
      hour: b.hour,
      count: total,
      swatch: swatchByMood[best[0]] ?? null,
    };
  });
  const max = Math.max(1, ...totals.map((t) => t.count));

  return (
    <View>
      <Text style={styles.sectionLabel}>
        TU DÍA EMOCIONAL · ¿CUÁNDO ESCRIBES?
      </Text>
      <View style={styles.card}>
        <View style={styles.hourRow}>
          {totals.map((t) => {
            const h = Math.round((t.count / max) * 60) + 4;
            return (
              <View key={t.hour} style={styles.hourCol}>
                <View
                  style={{
                    width: 8,
                    height: h,
                    borderRadius: 3,
                    backgroundColor: t.swatch ?? Colors.warm[200],
                    opacity: t.count ? 1 : 0.3,
                  }}
                />
                <Text style={styles.hourLabel}>{t.hour}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  subtitle: {
    fontSize: 13,
    color: Colors.warm[500],
    marginTop: 4,
  },
  tabsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: Colors.white,
  },
  tabActive: {
    backgroundColor: Colors.warm[900],
    borderColor: Colors.warm[900],
  },
  tabText: {
    color: Colors.warm[700],
    fontSize: 12,
    fontWeight: "600",
  },
  tabTextActive: {
    color: Colors.white,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    marginTop: Spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[900],
    marginTop: 4,
  },
  muted: {
    fontSize: 13,
    color: Colors.warm[500],
  },
  paywall: {
    marginTop: Spacing.md,
    padding: 22,
    borderRadius: Radius.xl,
    backgroundColor: Colors.lavender[600],
  },
  paywallEyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  paywallTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 26,
  },
  paywallBody: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 10,
  },
  paywallBullet: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    marginTop: 6,
  },
  paywallFootnote: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11.5,
    marginTop: 14,
  },
  proCta: {
    marginTop: 16,
    alignSelf: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
  },
  proCtaText: {
    color: Colors.lavender[700],
    fontSize: 13,
    fontWeight: "700",
  },
  weeklyCard: {
    padding: 20,
    borderRadius: Radius.xl,
    backgroundColor: Colors.lavender[500],
  },
  weeklyEyebrow: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  weeklyHeadline: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 22,
  },
  weeklyBody: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 10,
  },
  weeklyMeta: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    marginTop: 10,
  },
  weeklyCta: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
  },
  weeklyCtaText: {
    color: Colors.lavender[700],
    fontSize: 13,
    fontWeight: "700",
  },
  weeklyErr: {
    color: "#FECACA",
    fontSize: 12,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: Colors.warm[500],
    marginBottom: 8,
  },
  heatmapGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  heatmapCell: {
    width: 24,
    height: 24,
    borderRadius: 5,
  },
  hourRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 80,
  },
  hourCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    justifyContent: "flex-end",
  },
  hourLabel: {
    fontSize: 8.5,
    color: Colors.warm[500],
  },
  disclaimer: {
    fontSize: 10.5,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: 12,
  },
});
