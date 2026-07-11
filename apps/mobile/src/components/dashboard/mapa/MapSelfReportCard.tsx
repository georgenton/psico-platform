import { Pressable, StyleSheet, Text, View } from "react-native";
import type { EmotionalMapDimension } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * MapSelfReportCard — Fase F (decision L2): "Cómo me describí".
 *
 * Mobile twin of the web MapSelfReport: the only axes the V2 map shows as a
 * summary are the three check-in ones (CHK-S1) — homogeneous, self-reported,
 * labeled "Autoinformado", with no global percentage. Axes without answers
 * show the honest gathering state.
 */

const SELF_AXES: ReadonlyArray<{
  key: EmotionalMapDimension["key"];
  label: string;
}> = [
  { key: "claridad", label: "Claridad" },
  { key: "compasion", label: "Compasión" },
  { key: "consciencia", label: "Consciencia" },
];

/** Must match `CONFIDENCE_FLOOR` in the backend scoring. */
const CONFIDENCE_FLOOR = 0.15;

function isAnswered(dim: EmotionalMapDimension | undefined) {
  return (
    dim !== undefined &&
    dim.confidence >= CONFIDENCE_FLOOR &&
    dim.evidence?.modelId === "CHK-S1"
  );
}

export function MapSelfReportCard({
  dimensions,
  onInfo,
}: {
  dimensions: EmotionalMapDimension[];
  /** Opens the shared transparency modal (ⓘ). */
  onInfo?: () => void;
}) {
  const rows = SELF_AXES.map(({ key, label }) => ({
    key,
    label,
    dim: dimensions.find((d) => d.key === key),
  }));
  const answered = rows.filter((r) => isAnswered(r.dim));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tag}>Cómo me describí</Text>
          <Text style={styles.subtitle}>
            Resumen de tus respuestas — solo lo que tú contestaste, sin
            porcentaje global.
          </Text>
        </View>
        {onInfo ? (
          <Pressable
            onPress={onInfo}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cómo se llena tu Mapa Emocional"
            style={styles.infoBtn}
          >
            <Text style={styles.infoBtnText}>i</Text>
          </Pressable>
        ) : null}
      </View>

      {answered.length === 0 ? (
        <Text style={styles.empty}>
          Responde el check-in de 5 segundos al marcar tu ánimo y este resumen
          se irá dibujando con tus propias respuestas.
        </Text>
      ) : (
        rows.map(({ key, label, dim }) => {
          const ok = isAnswered(dim);
          const pct = ok ? Math.round((dim?.value ?? 0) * 100) : 0;
          return (
            <View key={key} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.rowLabel}>{label}</Text>
                {ok ? (
                  <View style={styles.rowValueWrap}>
                    <Text style={styles.selfChip}>Autoinformado</Text>
                    <Text style={styles.rowPct}>{pct}%</Text>
                  </View>
                ) : (
                  <Text style={styles.gatheringChip}>Reuniendo datos</Text>
                )}
              </View>
              <View
                style={styles.bar}
                accessibilityRole="progressbar"
                accessibilityLabel={`${label} ${
                  ok ? `${pct}%` : "reuniendo datos"
                }`}
              >
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct}%`, opacity: ok ? 1 : 0.35 },
                  ]}
                />
              </View>
              <Text style={styles.rowCaption}>
                {ok && dim?.evidence
                  ? `Basado en ${dim.evidence.n} ${
                      dim.evidence.n === 1 ? "respuesta" : "respuestas"
                    } tuyas al check-in`
                  : (dim?.sources ??
                    "Se llenará con tus respuestas al check-in diario")}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  tag: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.sage[600],
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.warm[500],
  },
  infoBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.warm[300],
    alignItems: "center",
    justifyContent: "center",
  },
  infoBtnText: {
    color: Colors.warm[500],
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },
  empty: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.warm[500],
  },
  row: {
    marginTop: 10,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.warm[800],
  },
  rowValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selfChip: {
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
  gatheringChip: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.warm[500],
    backgroundColor: Colors.warm[100],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    overflow: "hidden",
  },
  rowPct: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.warm[600],
  },
  bar: {
    height: 6,
    borderRadius: 9999,
    backgroundColor: Colors.warm[100],
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: Colors.lavender[500],
    borderRadius: 9999,
  },
  rowCaption: {
    marginTop: 5,
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.warm[500],
  },
});
