import type { EmotionalMapAffectDynamics } from "@psico/types";

/**
 * MapAffectDynamics — surfaces the Tier 2 (Ornstein–Uhlenbeck) block on the
 * Mapa page. When "gathering" it shows honest progress toward the observation
 * floor; when "active" it renders the four estimated parameters with a
 * confidence bar and a clear non-diagnostic disclaimer.
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
            fontSize: 16,
            fontWeight: 700,
            color: "var(--color-warm-900)",
          }}
        >
          Dinámica afectiva
        </h3>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "var(--color-lavender-700)",
            background: "var(--color-lavender-50)",
            padding: "3px 8px",
            borderRadius: 999,
          }}
        >
          Experimental
        </span>
      </div>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 12.5,
          lineHeight: 1.5,
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
    <div style={{ marginTop: 14 }}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
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
          marginTop: 10,
          height: 8,
          borderRadius: 999,
          background: "var(--color-warm-100)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--color-lavender-400)",
          }}
        />
      </div>
    </div>
  );
}

function Active({ data }: { data: EmotionalMapAffectDynamics }) {
  // Recovery + inertia unlock later than baseline/stability (θ needs more data).
  const missing = Math.max(0, data.recoveryNeeded - data.nObs);
  const gatheringNote =
    missing > 0 ? `Reuniendo datos · ~${missing} más` : "Reuniendo datos";
  const metrics: Array<{ label: string; value: string; help: string }> = [
    {
      label: "Tono base",
      value: pct(data.baseline),
      help: "Tu punto de retorno emocional promedio",
    },
    {
      label: "Recuperación",
      value: data.recovery != null ? pct(data.recovery) : gatheringNote,
      help: "Qué tan rápido vuelves a tu base tras un bajón",
    },
    {
      label: "Estabilidad",
      value: pct(data.stability),
      help: "Qué tan parejo se mantiene tu ánimo (los cambios pequeños del día a día no cuentan como inestabilidad)",
    },
    {
      label: "Inercia",
      value:
        data.inertiaDays != null
          ? `${data.inertiaDays.toFixed(1)} d`
          : gatheringNote,
      help: "Cuánto tienden a persistir tus estados de ánimo",
    },
  ];
  const conf = Math.round(data.confidence * 100);
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 12,
        }}
      >
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid var(--color-warm-200)",
              background: "var(--bg-surface, #fff)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--color-warm-500)",
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                fontSize: m.value.startsWith("Reuniendo") ? 13 : 22,
                fontWeight: m.value.startsWith("Reuniendo") ? 600 : 800,
                color: m.value.startsWith("Reuniendo")
                  ? "var(--color-warm-500)"
                  : "var(--color-warm-900)",
                marginTop: m.value.startsWith("Reuniendo") ? 6 : 2,
              }}
            >
              {m.value}
            </div>
            <div
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                color: "var(--color-warm-500)",
                marginTop: 4,
              }}
            >
              {m.help}
            </div>
          </div>
        ))}
      </div>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: 11.5,
          color: "var(--color-warm-500)",
        }}
      >
        Confianza {conf}% · basado en {data.nObs} registros de ánimo. Mientras
        más registres, más precisa será la estimación.
      </p>
    </div>
  );
}

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
