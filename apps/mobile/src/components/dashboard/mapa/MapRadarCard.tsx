import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import type {
  EmotionalMapDimension,
  EmotionalMapDimensionKey,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * MapRadarCard — the honest hexagonal radar (mobile twin of web MapRadar).
 *
 * The 6-axis radar returns, but under the V2 contract: each punta reaches its
 * value ONLY with a real signal (`confidence >= CONFIDENCE_FLOOR`). Gathering
 * axes render with a dashed spoke + hollow node instead of a fabricated
 * midpoint. The filled polygon connects only the ready axes, so the shape
 * grows as the user feeds it — check-ins (Claridad/Compasión/Consciencia),
 * mood dynamics (Calma) and confirmed resonances (Conexión/Propósito). No
 * global percentage; each axis shows its provenance.
 */

const AXES: ReadonlyArray<{ key: EmotionalMapDimensionKey; label: string }> = [
  { key: "calma", label: "Calma" },
  { key: "claridad", label: "Claridad" },
  { key: "conexion", label: "Conexión" },
  { key: "proposito", label: "Propósito" },
  { key: "compasion", label: "Compasión" },
  { key: "consciencia", label: "Consciencia" },
];

/** Must match `CONFIDENCE_FLOOR` in the backend scoring. */
const CONFIDENCE_FLOOR = 0.15;

function isReady(dim: EmotionalMapDimension | undefined) {
  return dim !== undefined && dim.confidence >= CONFIDENCE_FLOOR;
}

/**
 * Short, honest provenance label from the Model Registry id. Names the source
 * (your check-in, your mood, your resonances) — never a "measured" claim.
 */
function sourceLabel(dim: EmotionalMapDimension): string {
  const id = dim.evidence?.modelId ?? "";
  if (id === "CHK-S1") return "Tu check-in";
  if (id.startsWith("OU")) return "Tu ánimo";
  if (id === "ARC-C1" || id === "ARC-P1") return "Tus resonancias";
  if (id === "TXT-L1") return "Tu lenguaje";
  return "Tus registros";
}

// ── Hexagon geometry (viewBox 360×300) ──────────────────────────────────────
const VB_W = 360;
const VB_H = 300;
const CX = 180;
const CY = 150;
const R = 92;
const N = AXES.length;
const RINGS = 4;

function angleRad(i: number) {
  return ((-90 + (i * 360) / N) * Math.PI) / 180;
}
function point(i: number, r: number): [number, number] {
  const a = angleRad(i);
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
}
function ringPoints(r: number) {
  return AXES.map((_, i) => {
    const [x, y] = point(i, r);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

type Row = {
  key: EmotionalMapDimensionKey;
  label: string;
  ready: boolean;
  value: number;
  pct: number;
  dim: EmotionalMapDimension | undefined;
};

function Hexagon({ rows }: { rows: Row[] }) {
  const readyIdx = rows
    .map((row, i) => ({ row, i }))
    .filter((x) => x.row.ready);
  const dataPoly =
    readyIdx.length >= 3
      ? readyIdx
          .map(({ row, i }) => {
            const [x, y] = point(i, R * row.value);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  return (
    <View style={styles.svgWrap}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        accessibilityRole="image"
        accessibilityLabel="Radar de tu mapa emocional"
      >
        {/* rings */}
        {Array.from({ length: RINGS }, (_, k) => (
          <Polygon
            key={`ring-${k}`}
            points={ringPoints((R * (k + 1)) / RINGS)}
            fill="none"
            stroke={Colors.warm[300]}
            strokeWidth={1}
            opacity={0.55}
          />
        ))}
        {/* spokes */}
        {rows.map((_, i) => {
          const [ex, ey] = point(i, R);
          return (
            <Line
              key={`axis-${i}`}
              x1={CX}
              y1={CY}
              x2={ex}
              y2={ey}
              stroke={Colors.warm[300]}
              strokeWidth={1}
              opacity={0.55}
            />
          );
        })}
        {/* gathering axes — dashed muted overlay */}
        {rows.map((row, i) => {
          if (row.ready) return null;
          const [ex, ey] = point(i, R);
          return (
            <Line
              key={`gap-${i}`}
              x1={CX}
              y1={CY}
              x2={ex}
              y2={ey}
              stroke={Colors.warm[400]}
              strokeWidth={1.4}
              strokeDasharray="4 4"
              opacity={0.85}
            />
          );
        })}
        {/* filled polygon */}
        {dataPoly ? (
          <Polygon
            points={dataPoly}
            fill={Colors.lavender[500]}
            fillOpacity={0.22}
            stroke={Colors.lavender[500]}
            strokeWidth={1.8}
          />
        ) : null}
        {/* nodes */}
        {rows.map((row, i) => {
          if (row.ready) {
            const [x, y] = point(i, R * row.value);
            return (
              <Circle
                key={`node-${i}`}
                cx={x}
                cy={y}
                r={4}
                fill={Colors.lavender[500]}
                stroke={Colors.white}
                strokeWidth={1.4}
              />
            );
          }
          const [x, y] = point(i, R * 0.16);
          return (
            <Circle
              key={`node-${i}`}
              cx={x}
              cy={y}
              r={4.5}
              fill={Colors.white}
              stroke={Colors.warm[400]}
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          );
        })}
        {/* labels */}
        {rows.map((row, i) => {
          const [lx, ly] = point(i, R + 18);
          const a = angleRad(i);
          const anchor =
            Math.abs(Math.cos(a)) < 0.3
              ? "middle"
              : Math.cos(a) > 0
                ? "start"
                : "end";
          return (
            <SvgText
              key={`label-${i}`}
              x={lx}
              y={ly}
              fill={row.ready ? Colors.warm[700] : Colors.warm[500]}
              fontSize={12}
              fontWeight="600"
              textAnchor={anchor as "start" | "middle" | "end"}
              alignmentBaseline="middle"
            >
              {row.label}
            </SvgText>
          );
        })}
        {/* core */}
        <Circle
          cx={CX}
          cy={CY}
          r={4.5}
          fill="none"
          stroke={Colors.lavender[400]}
          strokeWidth={1.4}
          opacity={0.7}
        />
        <Circle cx={CX} cy={CY} r={3} fill={Colors.lavender[600]} />
      </Svg>
    </View>
  );
}

export function MapRadarCard({
  dimensions,
  onInfo,
}: {
  dimensions: EmotionalMapDimension[];
  /** Opens the shared transparency modal (ⓘ). */
  onInfo?: () => void;
}) {
  const rows: Row[] = AXES.map(({ key, label }) => {
    const dim = dimensions.find((d) => d.key === key);
    const ready = isReady(dim);
    return {
      key,
      label,
      ready,
      value: ready ? Math.max(0, Math.min(1, dim!.value)) : 0,
      pct: ready ? Math.round(dim!.value * 100) : 0,
      dim,
    };
  });
  const readyCount = rows.filter((r) => r.ready).length;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tag}>Tu mapa de hoy</Text>
          <Text style={styles.subtitle}>
            Cada punta se enciende solo con lo que tú registras — tu ánimo, tus
            respuestas y tus resonancias. Sin porcentaje global, sin nada
            inventado.
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

      {readyCount === 0 ? (
        <Text style={styles.empty}>
          Aún no hay señal para dibujar tu mapa. Marca tu ánimo, responde el
          check-in de 5 segundos o confirma una resonancia y las puntas se irán
          encendiendo.
        </Text>
      ) : (
        <>
          <Hexagon rows={rows} />

          {/* legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={styles.legendSwatchFilled} />
              <Text style={styles.legendText}>Con lo que ya registraste</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendSwatchDashed} />
              <Text style={styles.legendText}>
                Reuniendo datos — aún sin señal (no se inventa un valor)
              </Text>
            </View>
          </View>

          {/* per-axis rows */}
          {rows.map(({ key, label, ready, pct, dim }) => (
            <View key={key} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.rowLabel}>{label}</Text>
                {ready && dim ? (
                  <View style={styles.rowValueWrap}>
                    <Text style={styles.selfChip}>{sourceLabel(dim)}</Text>
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
                  ready ? `${pct}%` : "reuniendo datos"
                }`}
              >
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct}%`, opacity: ready ? 1 : 0.35 },
                  ]}
                />
              </View>
              <Text style={styles.rowCaption}>
                {ready && dim?.evidence
                  ? `Basado en ${dim.evidence.n} ${
                      dim.evidence.n === 1 ? "registro" : "registros"
                    } tuyos`
                  : (dim?.sources ??
                    "Se llenará conforme registres tu experiencia")}
              </Text>
            </View>
          ))}
        </>
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
  svgWrap: {
    width: "100%",
    aspectRatio: VB_W / VB_H,
    marginTop: 4,
    marginBottom: 4,
  },
  legend: {
    marginBottom: 6,
    gap: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendSwatchFilled: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: Colors.lavender[500],
    opacity: 0.55,
  },
  legendSwatchDashed: {
    width: 12,
    height: 12,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.warm[400],
  },
  legendText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
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
