import type { EmotionalMapDimension } from "@psico/types";
import { Radar } from "@/components/dashboard/shell/Radar";

/**
 * MapSelfReport — Fase F (decision L2): "Cómo me describí".
 *
 * The radar survives the V2 transformation ONLY as a summary of the user's
 * own answers: the three check-in axes (CHK-S1), homogeneous and
 * self-reported, with no global percentage. Axes without answers show the
 * honest gathering state; the triangle only draws when all three have data.
 *
 * `compact` renders the rows without the radar/frame — used by the Inicio
 * mini-map card.
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

export function MapSelfReport({
  dimensions,
  compact = false,
  info,
}: {
  dimensions: EmotionalMapDimension[];
  compact?: boolean;
  /** Optional slot for the transparency ⓘ button (full layout only). */
  info?: React.ReactNode;
}) {
  const rows = SELF_AXES.map(({ key, label }) => ({
    key,
    label,
    dim: dimensions.find((d) => d.key === key),
  }));
  const answered = rows.filter((r) => isAnswered(r.dim));
  const allAnswered = answered.length === SELF_AXES.length;

  const body = (
    <>
      {answered.length === 0 ? (
        <p
          style={{
            margin: compact ? 0 : "12px 0 0",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--color-warm-500)",
          }}
        >
          Responde el check-in de 5 segundos al marcar tu ánimo y este resumen
          se irá dibujando con tus propias respuestas.
        </p>
      ) : (
        <>
          {allAnswered && !compact ? (
            <div style={{ display: "grid", placeItems: "center" }}>
              <Radar
                size={260}
                values={rows.map((r) => r.dim?.value ?? 0)}
                axes={SELF_AXES.map((a) => a.label)}
                showLabels
              />
            </div>
          ) : null}
          <div style={{ marginTop: compact ? 0 : 8, display: "grid", gap: 12 }}>
            {rows.map(({ key, label, dim }) => {
              const ok = isAnswered(dim);
              const pct = ok ? Math.round((dim?.value ?? 0) * 100) : 0;
              return (
                <div key={key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <b style={{ fontSize: compact ? 12.5 : 13.5 }}>{label}</b>
                    {ok ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            textTransform: "uppercase",
                            padding: "2px 7px",
                            borderRadius: 999,
                            background: "var(--color-lavender-50)",
                            color: "var(--color-lavender-700)",
                          }}
                        >
                          Autoinformado
                        </span>
                        <b style={{ fontSize: compact ? 12 : 13 }}>{pct}%</b>
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "var(--color-warm-100)",
                          color: "var(--color-warm-500)",
                        }}
                      >
                        Reuniendo datos
                      </span>
                    )}
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={label}
                    style={{
                      marginTop: 5,
                      height: 6,
                      borderRadius: 999,
                      background: "var(--color-warm-100)",
                      overflow: "hidden",
                    }}
                  >
                    <i
                      style={{
                        display: "block",
                        height: "100%",
                        borderRadius: 999,
                        background: "var(--color-lavender-500)",
                        width: `${pct}%`,
                        opacity: ok ? 1 : 0.35,
                      }}
                    />
                  </div>
                  {!compact ? (
                    <p
                      style={{
                        margin: "5px 0 0",
                        fontSize: 11.5,
                        lineHeight: 1.4,
                        color: "var(--color-warm-500)",
                      }}
                    >
                      {ok && dim?.evidence
                        ? `Basado en ${dim.evidence.n} ${
                            dim.evidence.n === 1 ? "respuesta" : "respuestas"
                          } tuyas al check-in`
                        : (dim?.sources ??
                          "Se llenará con tus respuestas al check-in diario")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  if (compact) return <div style={{ display: "grid", gap: 4 }}>{body}</div>;

  return (
    <section
      className="card"
      style={{ marginTop: 24, padding: "22px 26px 20px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <span className="card-tag">Cómo me describí</span>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12.5,
              color: "var(--color-warm-500)",
            }}
          >
            Resumen de tus respuestas — solo lo que tú contestaste, sin
            porcentaje global.
          </p>
        </div>
        {info ?? null}
      </div>
      {body}
    </section>
  );
}
