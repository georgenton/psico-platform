import { StyleSheet, Text, View } from "react-native";
import type { UsageEco, UsageResponse } from "@psico/types";
import { ecoResetParts, effectiveTimezone } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * UsageCards (mobile) — Sprint front-fase1.
 *
 * Mirrors the web component. 4 mini-cards in a 2×2 grid. Progress bar
 * appears only when there's a numeric quota > 0. `quota === null` means
 * unlimited (B2B; diary on all plans). `quota === 0` means "not included"
 * (FREE voice).
 */
export function UsageCards({ usage }: { usage: UsageResponse | null }) {
  if (!usage) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          No pudimos cargar tu uso. Reintenta en unos minutos.
        </Text>
      </View>
    );
  }

  const items: CardItem[] = [
    {
      icon: "📚",
      label: "Libros",
      current: usage.books.completedThisPeriod,
      quota: null,
      unit: "",
    },
    {
      icon: "💬",
      label: "Eco",
      // La ventana que de VERDAD limita, igual que en web. Antes mostraba el
      // consumo del mes junto a un cupo de 20 que Eco no aplica.
      current: usage.eco.used,
      quota: usage.eco.quota,
      unit: "",
      windowNote: ecoWindowNote(usage.eco, usage.timezone),
    },
    {
      icon: "🎙️",
      label: "Voz",
      current: usage.voice.minutesThisPeriod,
      quota: usage.voice.quota,
      unit: "min",
    },
    {
      icon: "✎",
      label: "Diario",
      current: usage.diary.entriesThisPeriod,
      quota: usage.diary.quota,
      unit: "",
    },
  ];

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Tu uso este período</Text>
        <Text style={styles.period}>
          {formatPeriod(usage.period.start, usage.period.end, usage.timezone)}
        </Text>
      </View>

      <View style={styles.grid}>
        {items.map((it) => (
          <UsageCard key={it.label} {...it} />
        ))}
      </View>

      {/* La estadística del periodo, dicha como tal y no como cupo. */}
      <Text style={styles.footnote}>
        Eco · en todo el período:{" "}
        {usage.eco.messagesThisPeriod.toLocaleString("es-EC")} mensaje
        {usage.eco.messagesThisPeriod === 1 ? "" : "s"}. Es una estadística, no
        un cupo.
      </Text>
    </View>
  );
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface CardItem {
  icon: string;
  label: string;
  current: number;
  quota: number | null;
  unit: string;
  /** Sólo Eco: su ventana no es la del encabezado. Ver la gemela en web. */
  windowNote?: string;
}

function UsageCard({
  icon,
  label,
  current,
  quota,
  unit,
  windowNote,
}: CardItem) {
  const ratio = quota && quota > 0 ? Math.min(1, current / quota) : 0;
  const atCap = quota !== null && quota > 0 && current >= quota;
  const notIncluded = quota === 0;
  const counterColor = atCap ? Colors.error : Colors.warm[800];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={[styles.counter, { color: counterColor }]}>
        {current.toLocaleString("es-EC")}
        {unit ? ` ${unit}` : ""}
      </Text>
      <Text style={styles.sub}>
        {quota === null
          ? "ilimitado"
          : notIncluded
            ? "no incluido"
            : `de ${quota.toLocaleString("es-EC")}${unit ? ` ${unit}` : ""}`}
      </Text>
      {windowNote ? <Text style={styles.sub}>{windowNote}</Text> : null}
      {quota !== null && quota > 0 ? (
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${ratio * 100}%`,
                backgroundColor: atCap ? Colors.error : Colors.lavender[500],
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Gemela de la de web, palabra por palabra. */
/**
 * Las mismas piezas que usa el mensaje de Eco, por `ecoResetParts`.
 *
 * Aquí el formateador corre en el dispositivo, así que sin `timeZone` usaría la
 * zona del teléfono — que normalmente coincide con la declarada, y por eso este
 * defecto se vio primero en la Web. Pero no es lo mismo: si alguien viaja, o
 * declaró su zona desde otro aparato, el teléfono contaría una hora y el
 * mensaje de Eco otra. Se cuenta con la **declarada**, igual que el servidor.
 */
function ecoWindowNote(
  eco: UsageEco,
  timezone: string | null | undefined,
): string {
  if (eco.quota === null) return "sin límite";
  const resets = eco.resetsAt === null ? null : new Date(eco.resetsAt);
  if (resets === null) {
    return eco.window.kind === "utc-day" ? "hoy" : "este periodo";
  }

  const p = ecoResetParts(resets, timezone, new Date());
  const zona = p.zoneDeclared ? "" : " UTC";

  if (eco.window.kind === "utc-day") {
    if (p.relative === "today") return `hoy · vuelve a las ${p.time}${zona}`;
    if (p.relative === "tomorrow") {
      return `hoy · vuelve mañana a las ${p.time}${zona}`;
    }
    return `hoy · vuelve el ${p.dayLabel} a las ${p.time}${zona}`;
  }
  return `este periodo · hasta el ${p.dayLabel}`;
}

function formatPeriod(
  start: Date | string,
  end: Date | string,
  timezone: string | null | undefined,
): string {
  const tz = effectiveTimezone(timezone);
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-EC", {
      day: "numeric",
      month: "short",
      timeZone: tz,
    });
  return `${fmt(new Date(start))} – ${fmt(new Date(end))}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  period: {
    fontSize: 11,
    color: Colors.warm[400],
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[500],
  },
  counter: {
    fontSize: 20,
    fontWeight: "700",
  },
  sub: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.warm[400],
  },
  footnote: {
    marginTop: 8,
    fontSize: 11,
    color: Colors.warm[400],
  },
  barTrack: {
    marginTop: 8,
    height: 6,
    backgroundColor: Colors.warm[100],
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  fallback: {
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
  },
  fallbackText: {
    fontSize: 12,
    color: Colors.warm[500],
  },
});
