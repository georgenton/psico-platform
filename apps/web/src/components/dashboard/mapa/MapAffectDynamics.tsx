import type { EmotionalMapAffectDynamics } from "@psico/types";
import { buildAffectStory } from "./affect-copy";

/**
 * MapAffectDynamics — surfaces the Tier 2 (Ornstein–Uhlenbeck) block on the
 * Mapa page. When "gathering" it shows honest progress toward the observation
 * floor; when "active" it leads with a HUMAN story (warm sentences built from
 * the model's estimates via affect-copy) and keeps the numbers as small
 * secondary chips — the hybrid the user asked for. Non-diagnostic always.
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
  const story = buildAffectStory(data);
  const conf = Math.round(data.confidence * 100);
  return (
    <div style={{ marginTop: 14 }}>
      <p
        style={{
          margin: "0 0 4px",
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1.45,
          color: "var(--color-warm-900)",
          maxWidth: "38ch",
        }}
      >
        {story.headline}
      </p>

      <div style={{ marginTop: 8 }}>
        {story.rows.map((row) => (
          <div
            key={row.key}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "12px 0",
              borderTop: "1px solid var(--color-warm-100)",
            }}
          >
            <span
              aria-hidden
              style={{
                flex: "none",
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "var(--color-lavender-50)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              {row.emoji}
            </span>
            {row.phrase ? (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 14.5,
                      fontWeight: 700,
                      color: "var(--color-warm-900)",
                    }}
                  >
                    {row.phrase.title}
                  </span>
                  {row.pct != null ? (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "var(--color-lavender-700)",
                        background: "var(--color-lavender-50)",
                        padding: "1px 7px",
                        borderRadius: 999,
                      }}
                    >
                      {row.pct}%
                    </span>
                  ) : null}
                </div>
                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--color-warm-500)",
                  }}
                >
                  {row.phrase.body}
                </p>
              </div>
            ) : (
              <div>
                <span
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: "var(--color-warm-500)",
                  }}
                >
                  Cómo te recuperas — reuniendo datos
                  {row.missing ? ` · ~${row.missing} registros más` : ""}
                </span>
                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--color-warm-500)",
                  }}
                >
                  Con unos registros más podremos contarte qué tan rápido
                  vuelves a tu base después de un bajón.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <p
        style={{
          margin: "10px 0 0",
          paddingTop: 10,
          borderTop: "1px solid var(--color-warm-100)",
          fontSize: 11.5,
          color: "var(--color-warm-500)",
        }}
      >
        Confianza {conf}% · basado en {data.nObs} registros de ánimo
        {data.inertiaDays != null
          ? ` · tus estados suelen durar ~${formatInertia(data.inertiaDays)}`
          : ""}
        . Mientras más registres, más precisa será la estimación.
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
