import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { homeApi, resonancesApi } from "@psico/api-client";
import type {
  EmotionalMapAffectDynamics,
  EmotionalMapDimension,
  EmotionalMapResult,
  ResonanceSummary,
} from "@psico/types";
import { DIARY_MOODS } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";
import {
  buildAffectStory,
  evidenceBaseLabel,
  formatInertia,
} from "@/components/dashboard/mapa/affect-copy";
import { MapSelfReportCard } from "@/components/dashboard/mapa/MapSelfReportCard";

/**
 * Mapa Emocional — V2 layout (Fase F; legacy retired in Fase G).
 *
 * No global percentage, no 6-axis list: independent sections, each with its
 * own provenance — Mi momento · Cómo me describí (self-report, L2) ·
 * Dinámica · Mis resonancias · Patrones de lenguaje · narrative (L3) · a
 * pointer to Mi Evolución for the activity counters. Every V2 section is
 * null-tolerant so the screen degrades gracefully if the server is rolled
 * back to the legacy data contract (EMOTIONAL_MAP_V2=off).
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

export default function MapaScreen() {
  const router = useRouter();
  const [map, setMap] = useState<EmotionalMapResult | null>(null);
  const [resonances, setResonances] = useState<ResonanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [homeResult, resonancesResult] = await Promise.allSettled([
      homeApi.get(),
      resonancesApi.list(),
    ]);
    if (homeResult.status !== "fulfilled") {
      setError("No pudimos cargar tu mapa emocional.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setMap(homeResult.value.emotionalMap);
    setResonances(
      resonancesResult.status === "fulfilled"
        ? resonancesResult.value.resonances
        : [],
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  function removeResonance(id: string, label: string) {
    Alert.alert(
      "¿Quitar esta resonancia?",
      `«${label}» dejará de formar parte de tu mapa.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Quitar",
          style: "destructive",
          onPress: () => {
            const prev = resonances;
            setResonances((list) => list.filter((r) => r.id !== id));
            void resonancesApi.remove(id).catch(() => setResonances(prev));
          },
        },
      ],
    );
  }

  // Fase H (ARC-P1) — toggle "important to me": feeds the Propósito axis.
  function toggleImportant(id: string, next: boolean) {
    const prev = resonances;
    setResonances((list) =>
      list.map((r) => (r.id === id ? { ...r, important: next } : r)),
    );
    void resonancesApi
      .setImportant(id, { important: next })
      .catch(() => setResonances(prev));
  }

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
                Lo que tú registras y confirmas: tu ánimo, tus respuestas, tus
                resonancias. Nada entra a este mapa sin ti.
              </Text>
            </View>

            {/* Fase F/G — V2 sections; the legacy stage/dims layout was
                retired with the legacy data contract. */}
            <>
              <View style={styles.feed}>
                <Text style={styles.feedTag}>Mi momento</Text>
                {map.momento ? (
                  <View style={styles.momentoRow}>
                    <Text style={styles.momentoEmoji}>
                      {DIARY_MOODS.find((m) => m.id === map.momento?.mood)
                        ?.emoji ?? "•"}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.momentoLabel}>
                        {DIARY_MOODS.find((m) => m.id === map.momento?.mood)
                          ?.label ?? map.momento.mood}
                      </Text>
                      <Text style={styles.momentoMeta}>
                        Tu último registro · {formatDate(map.momento.at)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.feedPointerText}>
                    Marca tu ánimo cuando quieras — ese registro es el punto de
                    partida de tu mapa.
                  </Text>
                )}
              </View>

              <MapSelfReportCard
                dimensions={map.dimensions}
                onInfo={() => setInfoOpen(true)}
              />
            </>

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

            {/* Fase E (ARC) — confirmed resonances: the first V2 section.
                Every row is an explicit user tap, with provenance + delete. */}
            <View style={styles.feed}>
              <Text style={styles.feedTag}>Mis resonancias</Text>
              {resonances.length === 0 ? (
                <Text style={styles.feedPointerText}>
                  Aún no confirmaste ninguna. Cuando algo de una lectura te
                  resuene, el lector te ofrecerá añadirla aquí.
                </Text>
              ) : (
                resonances.map((r) => (
                  <View key={r.id} style={styles.resonanceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resonanceLabel}>
                        🌱 {r.conceptLabel}
                      </Text>
                      <Text style={styles.resonanceMeta}>
                        Confirmado por ti · Cap. {r.chapterOrder} ·{" "}
                        {new Date(r.confirmedAt).toLocaleDateString("es-EC", {
                          day: "numeric",
                          month: "short",
                        })}
                        {r.important ? " · Importante para ti" : ""}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => toggleImportant(r.id, !r.important)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: r.important }}
                      accessibilityLabel={
                        r.important
                          ? `Quitar ${r.conceptLabel} de temas importantes`
                          : `Marcar ${r.conceptLabel} como importante`
                      }
                      style={{ marginRight: 12 }}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          opacity: r.important ? 1 : 0.4,
                        }}
                      >
                        {r.important ? "⭐" : "☆"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeResonance(r.id, r.conceptLabel)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar resonancia ${r.conceptLabel}`}
                    >
                      <Text style={styles.resonanceRemove}>Quitar</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            {/* Fase F — V2 descriptive sections: on-device language patterns
                (opt-in, never scores axes) + the optional NAR-L1 narrative. */}
            {map.lenguaje && map.lenguaje.n > 0 ? (
              <View style={styles.feed}>
                <Text style={styles.feedTag}>Patrones de lenguaje</Text>
                <Text style={styles.feedPointerText}>
                  El analizador local procesó {map.lenguaje.n}{" "}
                  {map.lenguaje.n === 1 ? "reflexión" : "reflexiones"} en los
                  últimos 30 días. Es descriptivo: acompaña cómo escribes sobre
                  ti, pero no puntúa ninguna dimensión de tu mapa.
                </Text>
                <Text style={styles.lenguajeNote}>
                  Solo números derivados salen de tu dispositivo — el texto
                  nunca. Puedes desactivarlo (y borrar lo derivado) en
                  Seguridad.
                </Text>
              </View>
            ) : null}

            {map.narrative ? (
              <View style={styles.narrativeCard}>
                <View style={styles.narrativeHead}>
                  <Text style={styles.feedTag}>Una lectura en palabras</Text>
                  <View style={styles.affectBadge}>
                    <Text style={styles.affectBadgeText}>Experimental</Text>
                  </View>
                </View>
                <Text style={styles.narrativeHeadline}>
                  {map.narrative.headline}
                </Text>
                <Text style={styles.narrativeBody}>{map.narrative.body}</Text>
                <Text style={styles.lenguajeNote}>
                  Generada a partir de tus datos ya calculados — no crea números
                  nuevos y apagarla no cambia tu mapa.
                </Text>
              </View>
            ) : null}

            {/* Fase C — engagement counters moved to Mi Evolución; the map
                keeps only a quiet pointer there (copy contract). */}
            <View style={styles.feed}>
              <Text style={styles.feedTag}>Tu actividad</Text>
              <Text style={styles.feedPointerText}>
                Los conteos de lectura, escritura y de tus charlas con Eco viven
                ahora en Mi Evolución — son parte de tu recorrido, no una medida
                de tu mundo interior.
              </Text>
            </View>

            <Pressable
              style={styles.evoCta}
              onPress={() => router.push("/(tabs)/evolucion")}
              accessibilityRole="button"
            >
              <Text style={styles.evoCtaText}>
                Ver mi actividad en Evolución →
              </Text>
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
              Tu mapa se arma solo con lo que tú registras y confirmas. Cada
              dimensión se enciende cuando reúne señales suficientes — hasta
              entonces la verás como “Reuniendo datos” en lugar de un número
              inventado.
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
                  {dim.evidence ? (
                    <Text style={styles.modalRowEvidence}>
                      Método {dim.evidence.modelId} · basado en {dim.evidence.n}{" "}
                      {dim.evidence.n === 1 ? "registro" : "registros"}
                    </Text>
                  ) : null}
                </View>
              ))}
              <View style={styles.modalPrivacy}>
                <Text style={styles.modalPrivacyText}>
                  🔒 Privacidad primero. El análisis nunca lee el texto de tu
                  diario ni de tus charlas con Eco — están cifrados de extremo a
                  extremo. Solo usamos señales sin contenido: tu ánimo, tus
                  etiquetas, tus respuestas al check-in y los temas que tú
                  confirmas — nunca el texto.
                </Text>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Human story for the ACTIVE affect-dynamics block (hybrid: phrase + % chip). */
function AffectStoryView({ data }: { data: EmotionalMapAffectDynamics }) {
  const story = buildAffectStory(data);
  return (
    <View style={styles.affectStory}>
      <Text style={styles.affectHeadline}>{story.headline}</Text>
      {story.trendNote ? (
        <Text
          style={[
            styles.affectTrendNote,
            story.trend === "up"
              ? styles.affectTrendNoteUp
              : styles.affectTrendNoteDown,
          ]}
        >
          {story.trendNote}
        </Text>
      ) : null}
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
                  <Text style={styles.affectRowPct}>
                    {row.pct}%{row.margin != null ? ` ±${row.margin}` : ""}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.affectRowText}>{row.phrase.body}</Text>
            </View>
          ) : (
            <View style={styles.affectRowBody}>
              <Text style={styles.affectRowTitleMuted}>
                Ritmo de retorno — reuniendo más información
                {row.missing ? ` · ~${row.missing} más` : ""}
              </Text>
              <Text style={styles.affectRowText}>
                Esta estimación necesita bastante historia para ser fiable, así
                que preferimos esperar antes de mostrar un número.
              </Text>
            </View>
          )}
        </View>
      ))}
      <Text style={styles.affectConf}>
        Basado en {data.nObs} registros · {evidenceBaseLabel(data.nObs)}
        {data.inertiaDays != null
          ? ` · los cambios persisten ~${formatInertia(data.inertiaDays)} (estimación)`
          : ""}
        .{" "}
        {story.rows.some((r) => r.margin != null)
          ? "El ± marca el rango probable de cada valor. "
          : ""}
        Describe patrones en tus registros — no es un diagnóstico.
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
  affectTrendNote: {
    fontSize: 12,
    lineHeight: 18,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  affectTrendNoteUp: {
    backgroundColor: Colors.sage[50],
    borderColor: Colors.sage[200],
    color: Colors.sage[700],
  },
  affectTrendNoteDown: {
    backgroundColor: Colors.warm[50],
    borderColor: Colors.warm[200],
    color: Colors.warm[600],
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
  feedPointerText: {
    fontSize: 13.5,
    lineHeight: 20,
    color: Colors.warm[600],
  },
  resonanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warm[100],
  },
  resonanceLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[900],
  },
  resonanceMeta: {
    marginTop: 2,
    fontSize: 11.5,
    color: Colors.warm[500],
  },
  resonanceRemove: {
    fontSize: 12,
    color: Colors.warm[500],
    textDecorationLine: "underline",
  },

  // Fase F — V2 sections
  momentoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  momentoEmoji: {
    fontSize: 32,
    lineHeight: 38,
  },
  momentoLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  momentoMeta: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.warm[500],
  },
  lenguajeNote: {
    marginTop: 6,
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.warm[500],
  },
  narrativeCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
  },
  narrativeHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  narrativeHeadline: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    color: Colors.warm[900],
  },
  narrativeBody: {
    marginTop: 4,
    fontSize: 13.5,
    lineHeight: 19.5,
    color: Colors.warm[700],
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
  modalRowEvidence: {
    marginTop: 3,
    fontSize: 11.5,
    color: Colors.warm[500],
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
