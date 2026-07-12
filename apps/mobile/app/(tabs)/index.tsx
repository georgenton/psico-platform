import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { homeApi, moodApi } from "@psico/api-client";
import type { CheckinItem, HomeResponse, LogMoodRequest } from "@psico/types";
import { CHECKIN_SCALE } from "@psico/types";
import { useAuth } from "@/context/auth";
import { setEcoReaderHandoff } from "@/lib/eco/reader-handoff";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Home (Inicio) — Sprint H1a · Mobile parity with design v2.
 *
 * Mirrors `docs/design/redesign-v2/dashboard/index.html` phone-scroll
 * preview (data-screen-label="Inicio (móvil)"):
 *
 *   1. m-head    · eyebrow date · greeting · sub
 *   2. m-mood    · "¿Cómo llegas hoy?" + 5 face buttons + done state
 *   3. m-insight · "Insight del día" quote (insightToday from /home)
 *   4. m-metrics · 4 mini cards (Reflexiones · Insights · Patrones · Días)
 *   5. m-continue-wrap · book cover + chapter + progress
 *   6. m-eco     · "Eco te sugiere" card with prompt + CTA
 *
 * Data wires from `homeApi.get()` — same aggregator that the web Inicio
 * uses. Mood log uses `moodApi.log()` (POST /api/mood, Sprint B1).
 */

type MoodId = "great" | "good" | "ok" | "low" | "hard";

interface MoodOption {
  id: MoodId;
  label: string;
  shortLabel: string;
}

const MOOD_OPTIONS: readonly MoodOption[] = [
  { id: "great", label: "Muy bien", shortLabel: "Muy bien" },
  { id: "good", label: "Bien", shortLabel: "Bien" },
  { id: "ok", label: "Neutral", shortLabel: "Neutral" },
  { id: "low", label: "Bajo", shortLabel: "Bajo" },
  { id: "hard", label: "Difícil", shortLabel: "Difícil" },
];

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

const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

function todayEyebrow(): string {
  const now = new Date();
  return `${WEEKDAY_LABELS[now.getDay()]} · ${now.getDate()} ${MONTH_LABELS[now.getMonth()]}`;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [moodSubmitting, setMoodSubmitting] = useState(false);
  const [checkinItem, setCheckinItem] = useState<CheckinItem | null>(null);
  const [checkinThanks, setCheckinThanks] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await homeApi.get();
      setHome(data);
      // Hydrate mood selection from the latest mood the backend knows about.
      // The /home aggregator doesn't expose today's mood directly, so we
      // start clean each load and let the user pick.
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

  async function handleMoodPick(id: MoodId) {
    if (moodSubmitting) return;
    setSelectedMood(id);
    setMoodSubmitting(true);
    try {
      await moodApi.log({ mood: id } as LogMoodRequest);
      // Etapa 2 — best-effort daily question; any failure just skips it.
      try {
        const { item } = await moodApi.nextCheckin();
        if (item) setCheckinItem(item);
      } catch {
        // no checkin today — fine
      }
    } catch {
      // Roll back optimistic state on transient failures so the user can
      // retry without confusion. Keeping the chip selected when the POST
      // failed would lie about the persisted state.
      setSelectedMood(null);
    } finally {
      setMoodSubmitting(false);
    }
  }

  async function answerCheckin(score: number) {
    if (!checkinItem) return;
    const item = checkinItem;
    try {
      await moodApi.logCheckin({ itemKey: item.key, score });
      setCheckinThanks(true);
      setTimeout(() => {
        setCheckinItem(null);
        setCheckinThanks(false);
      }, 1200);
    } catch {
      setCheckinItem(null);
    }
  }

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
      {/* m-head — eyebrow + greet + sub (design v2 phone-scroll) */}
      <View style={styles.mHead}>
        <Text style={styles.mEyebrow}>{todayEyebrow()}</Text>
        <Text style={styles.mGreet}>
          {home.greeting.text}, {firstName}.
        </Text>
        {home.greeting.subtitle ? (
          <Text style={styles.mSub}>{home.greeting.subtitle}</Text>
        ) : null}
      </View>

      {/* m-mood — ¿Cómo llegas hoy? + 5 faces */}
      <View style={[styles.mCard, styles.mMood]}>
        {selectedMood ? (
          <View style={styles.mMoodDone}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={Colors.sage[500]}
            />
            <Text style={styles.mMoodDoneText}>
              Hoy te sientes{" "}
              <Text style={styles.mMoodDoneBold}>
                {MOOD_OPTIONS.find((m) => m.id === selectedMood)?.label}
              </Text>
            </Text>
            <Pressable onPress={() => setSelectedMood(null)}>
              <Text style={styles.mMoodChange}>Cambiar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.mMoodQ}>¿Cómo llegas hoy?</Text>
            <View style={styles.mMoodRow}>
              {MOOD_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.id}
                  style={styles.mMoodOpt}
                  onPress={() => handleMoodPick(opt.id)}
                  disabled={moodSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                >
                  <View style={styles.mMoodFace}>
                    <MoodFaceIcon id={opt.id} />
                  </View>
                  <Text style={styles.mMoodOptLabel}>{opt.shortLabel}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      {/* m-insight — Insight del día */}
      {home.insightToday ? (
        <View style={[styles.mCard, styles.mInsight]}>
          <Text style={styles.mCardTag}>Insight del día</Text>
          <Text style={styles.mInsightBody}>“{home.insightToday.body}”</Text>
          <View style={styles.miFoot}>
            <View style={styles.miFootAv}>
              <Ionicons name="leaf" size={12} color={Colors.lavender[600]} />
            </View>
            <Text style={styles.miFootText}>Generado por Eco · privado</Text>
          </View>
        </View>
      ) : null}

      {/* m-metrics — 4 cards. Mirrors the 5-grid web Inicio but drops one
          since mobile width can't comfortably host all five. */}
      <View style={styles.mMetrics}>
        <Metric
          icon="pencil"
          value={home.stats.entriesThisWeek}
          label="Reflexiones"
        />
        <Metric
          icon="star-outline"
          value={home.stats.insightsCount}
          label="Insights"
        />
        <Metric
          icon="ellipse-outline"
          value={home.stats.patternsCount}
          label="Patrones"
        />
        <Metric
          icon="flame-outline"
          value={home.user.streakDays}
          label="Días seguidos"
        />
      </View>

      {/* m-continue-wrap — book cover + chapter + progress */}
      {home.continueBook ? (
        <Pressable
          style={[styles.mCard, styles.mContinueWrap]}
          onPress={() =>
            router.push(
              `/(tabs)/books/${home.continueBook!.bookId}/lector/${home.continueBook!.chapterN}`,
            )
          }
          accessibilityRole="button"
          accessibilityLabel={`Continuar ${home.continueBook.title}`}
        >
          <Text style={styles.mCardTag}>Continúa tu recorrido</Text>
          <View style={styles.mContinue}>
            <View style={styles.mContinueCover}>
              <Ionicons name="book" size={20} color={Colors.white} />
            </View>
            <View style={styles.mContinueMeta}>
              <Text style={styles.mContinueEyebrow}>
                Cap. {home.continueBook.chapterN}
              </Text>
              <Text style={styles.mContinueTitle} numberOfLines={2}>
                {home.continueBook.chapterTitle}
              </Text>
              <View style={styles.mContinueBar}>
                <View
                  style={[
                    styles.mContinueBarFill,
                    {
                      width: `${Math.max(0, Math.min(100, home.continueBook.progressPct))}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </Pressable>
      ) : null}

      {/* m-eco — Eco te sugiere */}
      {home.ecoMoment ? (
        <Pressable
          style={[styles.mCard, styles.mEco]}
          onPress={() => router.push("/(tabs)/eco")}
          accessibilityRole="button"
          accessibilityLabel="Abrir Eco"
        >
          <View style={styles.meH}>
            <View style={styles.meG}>
              <Ionicons name="leaf" size={17} color={Colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.meN}>Eco te sugiere</Text>
              <View style={styles.meSWrap}>
                <View style={styles.meSDot} />
                <Text style={styles.meS}>Disponible ahora</Text>
              </View>
            </View>
          </View>
          <Text style={styles.meBody}>{home.ecoMoment.prompt}</Text>
          {home.ecoMoment.suggestions.length > 0 ? (
            <View style={styles.meSuggestions}>
              {home.ecoMoment.suggestions.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.meSuggestion}
                  onPress={() => {
                    setEcoReaderHandoff(
                      s.prompt,
                      s.scope
                        ? {
                            bookSlug: s.scope.bookSlug,
                            chapterOrder: s.scope.chapterOrder,
                            kind: "topic",
                          }
                        : undefined,
                      s.scope ?? undefined,
                    );
                    router.push("/(tabs)/eco");
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.meSuggestionTitle}>{s.title}</Text>
                  <Text style={styles.meSuggestionReason}>{s.reason}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.meBtn}>
            <Text style={styles.meBtnText}>Ver la conexión →</Text>
          </View>
        </Pressable>
      ) : null}

      {/* Etapa 2 — daily micro-checkin after the mood pick */}
      <Modal
        visible={checkinItem != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCheckinItem(null)}
      >
        <View style={styles.ckBackdrop}>
          <View style={styles.ckCard}>
            {checkinThanks ? (
              <Text style={styles.ckThanks}>
                ¡Gracias! Esto alimenta tu Mapa Emocional.
              </Text>
            ) : (
              <>
                <Text style={styles.ckTag}>Pregunta del día</Text>
                <Text style={styles.ckQuestion}>{checkinItem?.text}</Text>
                <View style={styles.ckScale}>
                  {CHECKIN_SCALE.map((label, score) => (
                    <Pressable
                      key={label}
                      style={styles.ckOption}
                      onPress={() => answerCheckin(score)}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                    >
                      <Text style={styles.ckOptionText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={() => setCheckinItem(null)}
                  accessibilityRole="button"
                >
                  <Text style={styles.ckSkip}>Omitir por hoy</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── MoodFaceIcon ──────────────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const MOOD_FACE_ICON: Record<MoodId, IconName> = {
  great: "happy-outline",
  good: "happy-outline",
  ok: "remove-circle-outline",
  low: "sad-outline",
  hard: "sad-outline",
};

function MoodFaceIcon({ id }: { id: MoodId }) {
  return (
    <Ionicons name={MOOD_FACE_ICON[id]} size={28} color={Colors.warm[700]} />
  );
}

// ─── Metric ────────────────────────────────────────────────────────────────

interface MetricProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  value: number;
  label: string;
}

function Metric({ icon, value, label }: MetricProps) {
  return (
    <View style={styles.mMetric}>
      <View style={styles.mMetricG}>
        <Ionicons name={icon} size={17} color={Colors.lavender[600]} />
      </View>
      <Text style={styles.mMetricValue}>{value}</Text>
      <Text style={styles.mMetricLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  ckBackdrop: {
    flex: 1,
    backgroundColor: "rgba(30,25,60,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  ckCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 20,
  },
  ckTag: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.lavender[600],
    marginBottom: 6,
  },
  ckQuestion: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    color: Colors.warm[900],
    marginBottom: 14,
  },
  ckScale: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  ckOption: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: Colors.warm[200],
    backgroundColor: Colors.white,
  },
  ckOptionText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: Colors.warm[700],
  },
  ckSkip: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.warm[400],
  },
  ckThanks: {
    fontSize: 14.5,
    fontWeight: "600",
    color: Colors.sage[600],
    textAlign: "center",
    paddingVertical: 8,
  },

  root: {
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  errorText: {
    color: Colors.warm[600],
    marginBottom: Spacing.md,
    fontSize: 14,
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

  // m-head
  mHead: {
    marginBottom: Spacing.md,
  },
  mEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.lavender[500],
  },
  mGreet: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "700",
    color: Colors.warm[900],
    letterSpacing: -0.5,
  },
  mSub: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.warm[600],
    lineHeight: 20,
  },

  // Shared card chrome
  mCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
  },
  mCardTag: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.lavender[600],
  },

  // m-mood
  mMood: {
    paddingVertical: Spacing.md,
  },
  mMoodQ: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[900],
    marginBottom: Spacing.md,
  },
  mMoodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  mMoodOpt: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.warm[50],
  },
  mMoodFace: {
    marginBottom: 4,
  },
  mMoodOptLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.warm[600],
    textAlign: "center",
  },
  mMoodDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mMoodDoneText: {
    flex: 1,
    fontSize: 13,
    color: Colors.warm[700],
  },
  mMoodDoneBold: {
    fontWeight: "700",
    color: Colors.warm[900],
  },
  mMoodChange: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.lavender[600],
  },

  // m-insight
  mInsight: {},
  mInsightBody: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.warm[800],
    lineHeight: 21,
    fontStyle: "italic",
  },
  miFoot: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.warm[100],
  },
  miFootAv: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
  },
  miFootText: {
    fontSize: 11,
    color: Colors.warm[500],
  },

  // m-metrics
  mMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  mMetric: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
  },
  mMetricG: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  mMetricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.warm[900],
    letterSpacing: -0.5,
  },
  mMetricLabel: {
    marginTop: 4,
    fontSize: 11,
    color: Colors.warm[600],
    fontWeight: "500",
  },

  // m-continue
  mContinueWrap: {},
  mContinue: {
    marginTop: 12,
    flexDirection: "row",
    gap: Spacing.md,
  },
  mContinueCover: {
    width: 54,
    height: 72,
    borderRadius: 10,
    backgroundColor: Colors.lavender[500],
    alignItems: "center",
    justifyContent: "center",
  },
  mContinueMeta: {
    flex: 1,
    minWidth: 0,
  },
  mContinueEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[400],
  },
  mContinueTitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[900],
    lineHeight: 19,
  },
  mContinueBar: {
    marginTop: 10,
    height: 6,
    borderRadius: 9999,
    backgroundColor: Colors.warm[200],
    overflow: "hidden",
  },
  mContinueBarFill: {
    height: "100%",
    backgroundColor: Colors.lavender[500],
  },

  // m-eco
  mEco: {
    backgroundColor: Colors.lavender[700],
    borderColor: Colors.lavender[700],
  },
  meH: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  meG: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  meN: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.white,
  },
  meSWrap: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  meSDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.sage[300],
  },
  meS: {
    fontSize: 10.5,
    color: "rgba(255,255,255,0.75)",
  },
  meBody: {
    fontSize: 13.5,
    lineHeight: 19,
    color: "rgba(255,255,255,0.92)",
  },
  meSuggestions: { marginTop: 12, gap: 8 },
  meSuggestion: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  meSuggestionTitle: { fontSize: 13, fontWeight: "700", color: Colors.white },
  meSuggestionReason: {
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  meBtn: {
    marginTop: 14,
    backgroundColor: Colors.white,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  meBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: Colors.lavender[700],
  },
});
