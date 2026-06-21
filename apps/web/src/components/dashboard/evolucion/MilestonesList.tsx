import type { EvolucionMilestone } from "@psico/types";
import { IconCheck } from "@/components/dashboard/shell/icons";

/**
 * MilestonesList — Sprint E1.
 *
 * Renders the Achievement catalog grouped visually: unlocked items first
 * (with sage accent + check), in-progress next (with progress bar). Server
 * Component — no interactivity needed.
 */
export function MilestonesList({
  milestones,
}: {
  milestones: EvolucionMilestone[];
}) {
  if (milestones.length === 0) {
    return (
      <div className="card">
        <p style={{ margin: 0, color: "var(--color-warm-500)", fontSize: 14 }}>
          Cuando completes acciones (primera reflexión, primer capítulo, 7 días
          seguidos…) verás aquí cada hito que vas desbloqueando.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 12,
      }}
    >
      {milestones.map((m) => {
        const unlocked = m.unlockedAt !== null;
        const pct = m.progressTarget
          ? Math.min(
              100,
              Math.round((m.progressCurrent / m.progressTarget) * 100),
            )
          : 0;
        return (
          <div
            key={m.id}
            className="card"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              opacity: unlocked ? 1 : 0.7,
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: unlocked
                  ? "var(--color-sage-100)"
                  : "var(--color-warm-100)",
                color: unlocked
                  ? "var(--color-sage-700)"
                  : "var(--color-warm-500)",
                flexShrink: 0,
              }}
              aria-hidden
            >
              {unlocked ? <IconCheck size={20} /> : <span>·</span>}
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    font: "600 13.5px/1 var(--font-sans)",
                    color: "var(--color-warm-900)",
                  }}
                >
                  {m.label}
                </span>
                <span
                  style={{
                    font: "500 11px/1 var(--font-mono)",
                    color: "var(--color-warm-500)",
                    letterSpacing: ".04em",
                  }}
                >
                  {unlocked
                    ? "Desbloqueado"
                    : `${m.progressCurrent}/${m.progressTarget}`}
                </span>
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  color: "var(--color-warm-500)",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {m.description}
              </p>
              {!unlocked && m.progressTarget > 0 ? (
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{
                    width: "100%",
                    height: 4,
                    background: "var(--color-warm-100)",
                    borderRadius: 2,
                    overflow: "hidden",
                    marginTop: 10,
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: "var(--color-lavender-500)",
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
