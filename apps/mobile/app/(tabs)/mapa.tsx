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
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { evolucionApi, homeApi } from "@psico/api-client";
import type {
  EmotionalMapAffectDynamics,
  EmotionalMapDimension,
  EmotionalMapResult,
  EvolucionStats,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";
import {
  buildAffectStory,
  formatInertia,
} from "@/components/dashboard/mapa/affect-copy";

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

type AxisIcon = React.ComponentProps<typeof Ionicons>["name"];

/** Must match `CONFIDENCE_FLOOR` in the backend service. */
const CONFIDENCE_FLOOR = 0.15;

const LABELS: Record<EmotionalMapDimension["key"], string> = {
  calma: "Calma",
  claridad: "Claridad",
  conexion: "Conexión",
  proposito: "Propósito",
  compasion: "Compasión",
  consciencia: "Consciencia",
};

const AXIS_ICONS: Record<EmotionalMapDimension["key"], AxisIcon> = {
  calma: "leaf-outline",
  claridad: "book-outline",
  conexion: "people-outline",
  proposito: "flame-outline",
  compasion: "heart-outline",
  consciencia: "bulb-outline",
};

export default function MapaScreen() {
  const router = useRouter();
  const [map, setMap] = useState<EmotionalMapResult | null>(null);
  const [stats, setStats] = useState<EvolucionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

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
                <Pressable
                  onPress={() => setInfoOpen(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Cómo se mide tu Mapa Emocional"
                  style={styles.infoBtn}
                >
                  <Text style={styles.infoBtnText}>i</Text>
                </Pressable>
              </View>
              <Text style={styles.stageMeta}>
                Actualizado · {formatDate(map.computedAt)}
              </Text>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreValue}>{map.pct}%</Text>
                <Text style={styles.scoreLabel}>
                  {map.coverage < 0.4
                    ? "Tu mapa se está formando"
                    : "Comprensión emocional"}
                </Text>
              </View>
              <View style={styles.providerChip}>
                <Ionicons name="trending-up" size={12} color={Colors.white} />
                <Text style={styles.providerText}>
                  {map.provider === "anthropic"
                    ? "Análisis con IA"
                    : "Análisis inicial"}
                </Text>
              </View>
              {map.coverage < 0.4 ? (
                <Text style={styles.stageGathering}>
                  Todavía estamos reuniendo señales. Escribe una reflexión,
                  conversa con Eco o avanza en una lectura y verás cómo cada
                  dimensión se enciende.
                </Text>
              ) : null}
            </View>

            {/* map-dims — 6 stacked bars with honest "gathering" state */}
            <View style={styles.dims}>
              {map.dimensions.map((dim) => {
                const covered = dim.confidence >= CONFIDENCE_FLOOR;
                const pct = Math.round(dim.value * 100);
                const icon = AXIS_ICONS[dim.key] ?? "ellipse-outline";
                const measured =
                  dim.key === "calma" &&
                  map.affectDynamics?.status === "active";
                return (
                  <View key={dim.key} style={styles.dim}>
                    <View style={styles.dimTop}>
                      <View style={styles.dimName}>
                        <View style={styles.dimIconWrap}>
                          <Ionicons
                            name={icon}
                            size={15}
                            color={Colors.lavender[600]}
                          />
                        </View>
                        <Text style={styles.dimLabel}>{LABELS[dim.key]}</Text>
                      </View>
                      {covered ? (
                        <View style={styles.dimValueWrap}>
                          <Text
                            style={
                              measured
                                ? styles.dimBasisMeasured
                                : styles.dimBasisActivity
                            }
                          >
                            {measured ? "Medido" : "Tu actividad"}
                          </Text>
                          <Text style={styles.dimPct}>{pct}%</Text>
                        </View>
                      ) : (
                        <Text style={styles.dimGathering}>Reuniendo datos</Text>
                      )}
                    </View>
                    <View
                      style={styles.dimBar}
                      accessibilityRole="progressbar"
                      accessibilityLabel={`${LABELS[dim.key]} ${
                        covered ? `${pct}%` : "reuniendo datos"
                      }`}
                    >
                      <View
                        style={[
                          styles.dimFill,
                          {
                            width: covered ? `${pct}%` : "0%",
                            opacity: covered ? 1 : 0.35,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.dimSources}>{dim.sources}</Text>
                  </View>
                );
              })}
            </View>

            {/* Tier 2 — affect dynamics (Ornstein–Uhlenbeck) */}
            {map.affectDynamics ? (
              <View style={styles.affect}>
                <View style={styles.affectHead}>
                  <Text style={styles.affectTitle}>Dinámica afectiva</Text>
                  <View style={styles.affectBadge}>
                    <Text style={styles.affectBadgeText}>Experimental</Text>
                  </View>
                </View>
                <Text style={styles.affectIntro}>
                  Un modelo matemático estima cómo se mueve tu ánimo en el
                  tiempo. Es apoyo para el autoconocimiento, no un diagnóstico.
                </Text>

                {map.affectDynamics.status === "gathering" ? (
                  <Text style={styles.affectGathering}>
                    Reuniendo datos — {map.affectDynamics.nObs} de ~
                    {map.affectDynamics.needed} registros de ánimo. Registra tu
                    ánimo unos días más y te contaremos cómo se mueve.
                  </Text>
                ) : (
                  <AffectStoryView data={map.affectDynamics} />
                )}
              </View>
            ) : null}

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

      {/* Transparency modal — how the map is measured + privacy guarantee */}
      <Modal
        visible={infoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setInfoOpen(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Cómo se mide tu Mapa</Text>
              <Pressable
                onPress={() => setInfoOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={22} color={Colors.warm[500]} />
              </Pressable>
            </View>
            <Text style={styles.modalIntro}>
              Tu mapa no mide cuánto haces, sino cuánto te vas comprendiendo. Se
              arma con seis dimensiones. Cada una se enciende cuando reúne
              señales suficientes — hasta entonces la verás como “Reuniendo
              datos” en lugar de un número inventado.
            </Text>
            <ScrollView style={styles.modalList}>
              {(map?.dimensions ?? []).map((dim) => (
                <View key={dim.key} style={styles.modalRow}>
                  <View style={styles.modalRowTop}>
                    <Text style={styles.modalRowName}>{LABELS[dim.key]}</Text>
                    <Text style={styles.modalRowStatus}>
                      {dim.confidence >= CONFIDENCE_FLOOR
                        ? `${Math.round(dim.value * 100)}%`
                        : "Reuniendo datos"}
                    </Text>
                  </View>
                  <Text style={styles.modalRowSources}>{dim.sources}</Text>
                </View>
              ))}
              <View style={styles.modalPrivacy}>
                <Text style={styles.modalPrivacyText}>
                  🔒 Privacidad primero. El análisis nunca lee el texto de tu
                  diario ni de tus conversaciones con Eco — están cifrados de
                  extremo a extremo. Solo usamos señales sin contenido: tu
                  ánimo, tus etiquetas, con qué frecuencia y a qué horas
                  escribes, lees o conversas.
                </Text>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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

/** Human story for the ACTIVE affect-dynamics block (hybrid: phrase + % chip). */
function AffectStoryView({ data }: { data: EmotionalMapAffectDynamics }) {
  const story = buildAffectStory(data);
  const conf = Math.round(data.confidence * 100);
  return (
    <View style={styles.affectStory}>
      <Text style={styles.affectHeadline}>{story.headline}</Text>
      {story.rows.map((row) => (
        <View key={row.key} style={styles.affectRow}>
          <View style={styles.affectRowIcon}>
            <Ionicons
              name={row.icon as AxisIcon}
              size={17}
              color={Colors.lavender[600]}
            />
          </View>
          {row.phrase ? (
            <View style={styles.affectRowBody}>
              <View style={styles.affectRowTitleLine}>
                <Text style={styles.affectRowTitle}>{row.phrase.title}</Text>
                {row.pct != null ? (
                  <Text style={styles.affectRowPct}>{row.pct}%</Text>
                ) : null}
              </View>
              <Text style={styles.affectRowText}>{row.phrase.body}</Text>
            </View>
          ) : (
            <View style={styles.affectRowBody}>
              <Text style={styles.affectRowTitleMuted}>
                Cómo te recuperas — reuniendo datos
                {row.missing ? ` · ~${row.missing} más` : ""}
              </Text>
              <Text style={styles.affectRowText}>
                Con unos registros más podremos contarte qué tan rápido vuelves
                a tu base después de un bajón.
              </Text>
            </View>
          )}
        </View>
      ))}
      <Text style={styles.affectConf}>
        Confianza {conf}% · {data.nObs} registros
        {data.inertiaDays != null
          ? ` · tus estados suelen durar ~${formatInertia(data.inertiaDays)}`
          : ""}
        . Mientras más registres, más precisa la estimación.
      </Text>
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
  infoBtn: {
    marginLeft: "auto",
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoBtnText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },
  stageGathering: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.72)",
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
  dimValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dimBasisMeasured: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.lavender[700],
    backgroundColor: Colors.lavender[50],
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
    overflow: "hidden",
  },
  dimBasisActivity: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.warm[500],
    backgroundColor: Colors.warm[100],
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
    overflow: "hidden",
  },
  dimGathering: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.warm[500],
    backgroundColor: Colors.warm[100],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    overflow: "hidden",
  },
  dimSources: {
    marginTop: 7,
    fontSize: 11.5,
    lineHeight: 16,
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

  // affect dynamics (Tier 2)
  affect: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
  },
  affectHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  affectTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  affectBadge: {
    backgroundColor: Colors.lavender[50],
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  affectBadgeText: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Colors.lavender[700],
  },
  affectIntro: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16.5,
    color: Colors.warm[500],
  },
  affectGathering: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.warm[700],
  },
  affectStory: {
    marginTop: 12,
  },
  affectHeadline: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    color: Colors.warm[900],
    marginBottom: 6,
  },
  affectRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.warm[100],
  },
  affectRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.lavender[50],
    alignItems: "center",
    justifyContent: "center",
  },
  affectRowBody: {
    flex: 1,
  },
  affectRowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  affectRowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  affectRowTitleMuted: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[500],
  },
  affectRowPct: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.lavender[700],
    backgroundColor: Colors.lavender[50],
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
  affectRowText: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17.5,
    color: Colors.warm[500],
  },
  affectConf: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.warm[100],
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.warm[500],
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

  // transparency modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,13,20,0.55)",
    justifyContent: "center",
    padding: Spacing.md,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    maxHeight: "85%",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  modalIntro: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.warm[600],
    marginBottom: 12,
  },
  modalList: {
    flexGrow: 0,
  },
  modalRow: {
    marginBottom: 12,
  },
  modalRowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  modalRowName: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  modalRowStatus: {
    fontSize: 11.5,
    color: Colors.warm[500],
  },
  modalRowSources: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 17,
    color: Colors.warm[600],
  },
  modalPrivacy: {
    marginTop: 4,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[100],
  },
  modalPrivacyText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.warm[700],
  },
});
