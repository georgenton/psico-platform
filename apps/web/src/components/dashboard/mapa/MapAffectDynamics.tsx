import type { EmotionalMapAffectDynamics } from "@psico/types";
import {
  IconMoodFace,
  IconTrendUp,
  IconWind,
} from "@/components/dashboard/shell/icons";
import { baselineLevel, buildAffectStory } from "./affect-copy";

/**
 * MapAffectDynamics — surfaces the Tier 2 (Ornstein–Uhlenbeck) block on the
 * Mapa page. When "gathering" it shows honest progress toward the observation
 * floor; when "active" it leads with a HUMAN story (warm headline + one card
 * per signal, styled like the rest of the dashboard cards) and keeps the
 * numbers as small chips — the hybrid the user asked for. Non-diagnostic.
 *
 * Null (kill-switch off) → renders nothing.
 */
export function MapAffectDynamics({
  data,
}: {
  data: EmotionalMapAffectDynamics | null | undefined;
}) {
  if (!data) return null;

  return (
    <section
      className="card"
      style={{
        marginTop: 24,
        padding: "22px 26px 20px",
        border: "1.5px solid var(--color-lavender-200)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <h3
          style={{
            margin: 0,
            font: "700 16px/1.2 var(--font-sans)",
            letterSpacing: "-0.01em",
            color: "var(--color-warm-900)",
          }}
        >
          Dinámica afectiva
        </h3>
        <span
          style={{
            font: "700 10.5px/1 var(--font-mono)",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--color-lavender-700)",
            background: "var(--color-lavender-50)",
            padding: "4px 9px",
            borderRadius: 999,
          }}
        >
          Experimental
        </span>
      </div>
      <p
        style={{
          margin: "6px 0 0",
          font: "400 12.5px/1.5 var(--font-sans)",
          color: "var(--color-warm-500)",
        }}
      >
        Un modelo matemático (Ornstein–Uhlenbeck) estima cómo se mueve tu ánimo
        en el tiempo, a partir de tus registros. Es un apoyo para el
        autoconocimiento, <b>no</b> un diagnóstico.
      </p>

      {data.status === "gathering" ? (
        <Gathering nObs={data.nObs} needed={data.needed} />
      ) : (
        <Active data={data} />
      )}
    </section>
  );
}

function Gathering({ nObs, needed }: { nObs: number; needed: number }) {
  const pct = Math.min(100, Math.round((nObs / Math.max(needed, 1)) * 100));
  return (
    <div style={{ marginTop: 16 }}>
      <p
        style={{
          margin: 0,
          font: "400 13.5px/1.55 var(--font-sans)",
          color: "var(--color-warm-700)",
        }}
      >
        Reuniendo datos —{" "}
        <b>
          {nObs} de ~{needed}
        </b>{" "}
        registros de ánimo. Registra tu ánimo unos días más y verás aquí tu tono
        base, tu velocidad de recuperación, tu estabilidad y tu inercia
        emocional.
      </p>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          marginTop: 12,
          height: 7,
          borderRadius: 9999,
          background: "var(--color-warm-100)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 9999,
            background:
              "linear-gradient(90deg, var(--color-lavender-400), var(--color-lavender-600))",
          }}
        />
      </div>
    </div>
  );
}

function Active({ data }: { data: EmotionalMapAffectDynamics }) {
  const story = buildAffectStory(data);
  const conf = Math.round(data.confidence * 100);
  const faceVariant =
    baselineLevel(data.baseline ?? 0.5) === "high"
      ? ("good" as const)
      : baselineLevel(data.baseline ?? 0.5) === "medium"
        ? ("ok" as const)
        : ("low" as const);

  return (
    <div style={{ marginTop: 18 }}>
      <p
        style={{
          margin: "0 0 16px",
          font: "700 19px/1.35 var(--font-sans)",
          letterSpacing: "-0.015em",
          color: "var(--color-warm-900)",
        }}
      >
        {story.headline}
      </p>

      {story.ewsNote ? (
        <p
          style={{
            margin: "-6px 0 16px",
            padding: "10px 14px",
            borderRadius: 12,
            font: "400 12.5px/1.55 var(--font-sans)",
            background: "var(--color-lavender-50)",
            border: "1px solid var(--color-lavender-200)",
            color: "var(--color-lavender-700)",
          }}
        >
          {story.ewsNote}
        </p>
      ) : null}

      {story.trendNote ? (
        <p
          style={{
            margin: "-6px 0 16px",
            padding: "10px 14px",
            borderRadius: 12,
            font: "400 12.5px/1.55 var(--font-sans)",
            background:
              story.trend === "up"
                ? "var(--color-sage-50)"
                : "var(--color-warm-50)",
            border: `1px solid ${
              story.trend === "up"
                ? "var(--color-sage-200)"
                : "var(--color-warm-200)"
            }`,
            color:
              story.trend === "up"
                ? "var(--color-sage-700)"
                : "var(--color-warm-600)",
          }}
        >
          {story.trendNote}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 14,
        }}
      >
        {story.rows.map((row) => {
          const gated = !row.phrase;
          return (
            <div
              key={row.key}
              style={{
                background: "#fff",
                border: "1px solid var(--color-warm-200)",
                borderRadius: 16,
                padding: "16px 18px",
                boxShadow: "var(--shadow-card-sm)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: gated
                      ? "var(--color-warm-100)"
                      : "var(--color-lavender-100)",
                    color: gated
                      ? "var(--color-warm-400)"
                      : "var(--color-lavender-600)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {row.key === "baseline" ? (
                    <IconMoodFace variant={faceVariant} size={19} />
                  ) : row.key === "recovery" ? (
                    <IconTrendUp size={19} />
                  ) : (
                    <IconWind size={19} />
                  )}
                </span>
                {row.pct != null ? (
                  <span
                    style={{
                      marginLeft: "auto",
                      font: "700 11px/1 var(--font-mono)",
                      color: "var(--color-lavender-700)",
                      background: "var(--color-lavender-100)",
                      padding: "4px 9px",
                      borderRadius: 9999,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.pct}%{row.margin != null ? ` ±${row.margin}` : ""}
                  </span>
                ) : null}
              </div>
              {row.phrase ? (
                <>
                  <div
                    style={{
                      margin: "12px 0 0",
                      font: "700 14.5px/1.25 var(--font-sans)",
                      letterSpacing: "-0.01em",
                      color: "var(--color-warm-900)",
                    }}
                  >
                    {row.phrase.title}
                  </div>
                  <p
                    style={{
                      margin: "5px 0 0",
                      font: "400 13px/1.55 var(--font-sans)",
                      color: "var(--color-warm-500)",
                    }}
                  >
                    {row.phrase.body}
                  </p>
                </>
              ) : (
                <>
                  <div
                    style={{
                      margin: "12px 0 0",
                      font: "700 14.5px/1.25 var(--font-sans)",
                      letterSpacing: "-0.01em",
                      color: "var(--color-warm-500)",
                    }}
                  >
                    Cómo te recuperas
                  </div>
                  <p
                    style={{
                      margin: "5px 0 0",
                      font: "400 13px/1.55 var(--font-sans)",
                      color: "var(--color-warm-500)",
                    }}
                  >
                    Reuniendo datos
                    {row.missing ? ` · ~${row.missing} registros más` : ""}. Con
                    unos registros más te contaremos qué tan rápido vuelves a tu
                    base después de un bajón.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p
        style={{
          margin: "16px 0 0",
          paddingTop: 14,
          borderTop: "1px solid var(--color-warm-100)",
          font: "400 12px/1.5 var(--font-sans)",
          color: "var(--color-warm-400)",
        }}
      >
        Confianza {conf}% · basado en {data.nObs} registros de ánimo
        {data.inertiaDays != null
          ? ` · tus estados suelen durar ~${formatInertia(data.inertiaDays)}`
          : ""}
        .{" "}
        {story.rows.some((r) => r.margin != null)
          ? "El ± marca el rango probable de cada valor. "
          : ""}
        Mientras más registres, más precisa será la estimación.
      </p>
    </div>
  );
}

/** Inertia (days) → a human duration: "unas horas", "un día", "3 días". */
function formatInertia(days: number): string {
  if (days < 0.75) return "unas horas";
  if (days < 1.5) return "un día";
  return `${Math.round(days)} días`;
}
