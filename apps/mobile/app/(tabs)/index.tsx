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
import { Ionicons } from "@expo/vector-icons";
import { homeApi } from "@psico/api-client";
import type { HomeResponse } from "@psico/types";
import { useAuth } from "@/context/auth";
import { coverColor } from "@/components/dashboard/cover-colors";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Home (Inicio) — Sprint S5-front-mobile.
 *
 * Mirrors docs/design/inicio/mobile.jsx: greeting, continue book, eco moment,
 * recos, stats, shortcuts, optional upgrade banner for free users. Calls
 * /api/home which aggregates everything server-side (Sprint S5).
 *
 * Pull-to-refresh re-runs the aggregator.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await homeApi.get();
      setHome(data);
    } catch {
      setError("No pudimos cargar tu inicio.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.lavender[500]} />
      </View>
    );
  }

  if (error || !home) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Sin datos."}</Text>
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
    );
  }

  const firstName = home.user.firstName || user.name.split(" ")[0];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
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
      {/* Greeting */}
      <View style={styles.greeting}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.greetEyebrow}>
            {home.user.city ?? "Tu camino"} · racha {home.user.streakDays}
          </Text>
          <Text style={styles.greetTitle}>
            {home.greeting.text}, {firstName}.
          </Text>
          {home.greeting.subtitle ? (
            <Text style={styles.greetSub}>{home.greeting.subtitle}</Text>
          ) : null}
        </View>
        <View
          style={[
            styles.planChip,
            {
              backgroundColor:
                home.user.tier === "pro"
                  ? Colors.lavender[100]
                  : Colors.warm[100],
            },
          ]}
        >
          <View
            style={[
              styles.planDot,
              {
                backgroundColor:
                  home.user.tier === "pro"
                    ? Colors.lavender[500]
                    : Colors.warm[400],
              },
            ]}
          />
          <Text
            style={[
              styles.planChipText,
              {
                color:
                  home.user.tier === "pro"
                    ? Colors.lavender[700]
                    : Colors.warm[600],
              },
            ]}
          >
            {home.user.tier === "pro" ? "Pro" : "Gratuito"}
          </Text>
        </View>
      </View>

      {/* Continue book */}
      {home.continueBook ? (
        <Pressable
          style={styles.card}
          onPress={() =>
            router.push(`/(tabs)/books/${home.continueBook!.bookId}`)
          }
        >
          <View style={styles.continueRow}>
            <View
              style={[
                styles.continueCover,
                { backgroundColor: coverColor(home.continueBook.cover) },
              ]}
            >
              <Text style={styles.continueCoverGlyph}>📖</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.eyebrow}>Continúa</Text>
              <Text style={styles.continueTitle} numberOfLines={2}>
                {home.continueBook.title}
              </Text>
              <Text style={styles.continueMeta} numberOfLines={1}>
                Cap. {home.continueBook.chapterN} —{" "}
                {home.continueBook.chapterTitle}
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(0, Math.min(100, home.continueBook.progressPct))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.continueCta}>
                ▶ Seguir leyendo · {home.continueBook.progressPct}%
              </Text>
            </View>
          </View>
        </Pressable>
      ) : null}

      {/* Eco moment */}
      {home.ecoMoment ? (
        <View style={[styles.card, styles.marinaCard]}>
          <View style={styles.marinaHead}>
            <View style={styles.marinaAvatar}>
              <Text style={styles.marinaAvatarGlyph}>✦</Text>
            </View>
            <View>
              <Text style={styles.marinaId}>Eco</Text>
              <Text style={styles.marinaBadge}>✦ Hoy contigo</Text>
            </View>
          </View>
          <Text style={styles.marinaBody}>{home.ecoMoment.prompt}</Text>
          {home.ecoMoment.pendingMessages > 0 ? (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>
                {home.ecoMoment.pendingMessages} sin leer
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Recos */}
      {home.recos.length > 0 ? (
        <>
          <View style={styles.sectionH}>
            <Text style={styles.sectionTitle}>Para ti</Text>
          </View>
          {home.recos.map((r) => (
            <Pressable
              key={r.id}
              style={styles.recoCard}
              onPress={() =>
                r.lockedByTier
                  ? router.push("/(tabs)/plan")
                  : router.push(`/(tabs)/books/${r.id}`)
              }
            >
              <View style={styles.recoRow}>
                <View
                  style={[
                    styles.recoCover,
                    { backgroundColor: coverColor(r.cover) },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.recoKind}>
                    {r.kind === "book"
                      ? "Libro"
                      : r.kind === "audio"
                        ? "Audio"
                        : r.kind === "exercise"
                          ? "Ejercicio"
                          : "Carta"}
                  </Text>
                  <Text style={styles.recoTitle} numberOfLines={2}>
                    {r.title}
                  </Text>
                  <Text style={styles.recoAuthor} numberOfLines={1}>
                    {r.byline}
                  </Text>
                </View>
                {r.lockedByTier ? (
                  <Ionicons
                    name="lock-closed"
                    size={14}
                    color={Colors.warm[400]}
                  />
                ) : null}
              </View>
              <View style={styles.recoReason}>
                <Text style={styles.recoReasonText}>{r.reason}</Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}

      {/* Stats */}
      <View style={styles.sectionH}>
        <Text style={styles.sectionTitle}>Tu camino</Text>
      </View>
      <View style={styles.statsRow}>
        <StatCard
          label="Racha"
          value={home.stats.streakDays}
          unit="días"
          sub="Tu seguimiento diario"
        />
        <StatCard
          label="Esta semana"
          value={home.stats.minutesThisWeek}
          unit="min"
          sub={`${home.stats.weeklyGoalPct}% meta`}
          progressPct={home.stats.weeklyGoalPct}
        />
      </View>
      <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
        <StatCard
          label="Diario"
          value={home.stats.entriesThisWeek}
          unit={home.stats.entriesThisWeek === 1 ? "entrada" : "entradas"}
          sub="Esta semana"
        />
      </View>

      {/* Reflection prompt */}
      {home.reflectionPrompt ? (
        <View style={[styles.card, styles.reflexCard]}>
          <Text style={styles.eyebrow}>✎ Reflexión · 30s</Text>
          <Text style={styles.reflexQuestion}>
            {home.reflectionPrompt.text}
          </Text>
          <Text style={styles.reflexHelper}>
            Una sola palabra está bien — solo tú la lees.
          </Text>
          <Pressable
            style={styles.reflexCta}
            onPress={() => router.push("/(tabs)/diario")}
          >
            <Text style={styles.reflexCtaText}>Abrir diario →</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Upgrade (free) */}
      {home.user.tier === "free" ? (
        <Pressable
          style={styles.upgradeCard}
          onPress={() => router.push("/(tabs)/plan")}
        >
          <Ionicons name="star" size={20} color={Colors.lavender[500]} />
          <View style={{ flex: 1, minWidth: 0, marginLeft: Spacing.sm }}>
            <Text style={styles.upgradeTitle}>
              Desbloquea todo · Pro $7/mes
            </Text>
            <Text style={styles.upgradeSub} numberOfLines={1}>
              Libros, audios y Eco dentro del capítulo
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={Colors.warm[500]} />
        </Pressable>
      ) : null}

      {/* Shortcuts */}
      <View style={styles.sectionH}>
        <Text style={styles.sectionTitle}>Atajos</Text>
      </View>
      <View style={styles.shortcutsCard}>
        {home.shortcuts.map((s, idx) => {
          const isLast = idx === home.shortcuts.length - 1;
          const cfg = SHORTCUT_CONFIG[s.id];
          return (
            <Pressable
              key={s.id}
              style={[styles.shortcutRow, !isLast && styles.shortcutDivider]}
              onPress={() => router.push(cfg.href as never)}
            >
              <View style={styles.shortcutIcon}>
                <Ionicons name={cfg.icon} size={16} color={Colors.warm[700]} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.shortcutLabel}>{s.label}</Text>
                <Text style={styles.shortcutSub} numberOfLines={1}>
                  {cfg.sub}
                  {s.badge ? ` · ${s.badge}` : ""}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={Colors.warm[400]}
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Shortcuts mapping ───────────────────────────────────────────────────────

type ShortcutId = "diario" | "eco" | "biblioteca" | "terapia";
const SHORTCUT_CONFIG: Record<
  ShortcutId,
  { icon: keyof typeof Ionicons.glyphMap; sub: string; href: string }
> = {
  diario: {
    icon: "create",
    sub: "Anota cómo te sientes",
    href: "/(tabs)/diario",
  },
  eco: {
    icon: "sparkles",
    sub: "Pregúntale lo que sea",
    href: "/(tabs)",
  },
  biblioteca: {
    icon: "library",
    sub: "Tus libros",
    href: "/(tabs)/books",
  },
  terapia: {
    icon: "headset",
    sub: "Sesiones de terapia",
    href: "/(tabs)/plan",
  },
};

// ─── StatCard reusable ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  sub,
  progressPct,
}: {
  label: string;
  value: number;
  unit: string;
  sub: string;
  progressPct?: number;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
      {progressPct !== undefined ? (
        <View style={styles.statProgressBar}>
          <View
            style={[
              styles.statProgressFill,
              {
                width: `${Math.max(0, Math.min(100, progressPct))}%`,
              },
            ]}
          />
        </View>
      ) : null}
      <Text style={styles.statSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
    gap: Spacing.md,
  },
  errorText: {
    fontSize: 14,
    color: Colors.warm[600],
    textAlign: "center",
    padding: Spacing.lg,
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

  greeting: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  greetEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.lavender[700],
    marginBottom: 6,
  },
  greetTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  greetSub: {
    fontSize: 14,
    color: Colors.warm[500],
    marginTop: 6,
    lineHeight: 20,
  },
  planChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  planDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  planChipText: {
    fontSize: 11,
    fontWeight: "700",
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.lavender[700],
  },

  continueRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  continueCover: {
    width: 84,
    height: 112,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  continueCoverGlyph: {
    fontSize: 28,
    color: "rgba(255,255,255,0.85)",
  },
  continueTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[900],
    marginTop: 6,
    lineHeight: 20,
  },
  continueMeta: {
    fontSize: 12,
    color: Colors.warm[600],
    marginTop: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.warm[200],
    borderRadius: 2,
    marginTop: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.lavender[500],
  },
  continueCta: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: Colors.sage[500],
  },

  marinaCard: {
    backgroundColor: Colors.lavender[50],
    borderColor: Colors.lavender[100],
  },
  marinaHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  marinaAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.lavender[500],
    alignItems: "center",
    justifyContent: "center",
  },
  marinaAvatarGlyph: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  marinaId: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  marinaBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.lavender[700],
    marginTop: 2,
  },
  marinaBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.warm[800],
    marginTop: Spacing.sm,
  },
  pendingBadge: {
    alignSelf: "flex-start",
    marginTop: Spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.lavender[100],
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.lavender[700],
  },

  sectionH: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.warm[500],
  },

  recoCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  recoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recoCover: {
    width: 44,
    height: 58,
    borderRadius: 6,
  },
  recoKind: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.lavender[700],
  },
  recoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
    marginTop: 3,
    lineHeight: 16,
  },
  recoAuthor: {
    fontSize: 11,
    color: Colors.warm[500],
    marginTop: 2,
  },
  recoReason: {
    marginTop: 8,
    padding: Spacing.sm,
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.sm,
  },
  recoReasonText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.warm[700],
  },

  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.sm + 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[500],
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.warm[900],
    letterSpacing: -0.5,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.warm[500],
  },
  statProgressBar: {
    height: 4,
    backgroundColor: Colors.warm[100],
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  statProgressFill: {
    height: "100%",
    backgroundColor: Colors.sage[400],
  },
  statSub: {
    fontSize: 11,
    color: Colors.warm[500],
    marginTop: 6,
  },

  reflexCard: {
    marginTop: Spacing.md,
  },
  reflexQuestion: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
    marginTop: 6,
    lineHeight: 22,
  },
  reflexHelper: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: 6,
  },
  reflexCta: {
    marginTop: Spacing.sm + 2,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.warm[900],
  },
  reflexCtaText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: "700",
  },

  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.lavender[50],
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  upgradeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  upgradeSub: {
    fontSize: 11.5,
    color: Colors.warm[600],
    marginTop: 2,
  },

  shortcutsCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    overflow: "hidden",
  },
  shortcutRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 10,
  },
  shortcutDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.warm[100],
  },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.warm[100],
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  shortcutSub: {
    fontSize: 11.5,
    color: Colors.warm[500],
    marginTop: 2,
  },
});
