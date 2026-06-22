import type { EvolucionMilestone } from "@psico/types";
import {
  IconBook,
  IconEco,
  IconFlame,
  IconPatterns,
  IconReflections,
} from "@/components/dashboard/shell/icons";

/**
 * MilestonesTimeline — Sprint F2.
 *
 * The `.tl` timeline from the design's `s-evolucion` screen. Renders
 * each milestone as a `.tl-item` with a dot, month/date tag, headline,
 * description, and a `.tl-tag` chip. Unlocked items show their unlock
 * month; in-progress ones get the `.next` modifier with a dashed dot
 * and a "Próximo paso" label.
 *
 * Reuses the EvolucionMilestone shape from Sprint E1/E2 — no new
 * backend needed.
 */
export function MilestonesTimeline({
  milestones,
}: {
  milestones: EvolucionMilestone[];
}) {
  if (milestones.length === 0) {
    return (
      <div className="card" style={{ padding: "26px 28px" }}>
        <span
          className="card-tag"
          style={{ marginBottom: 22, display: "inline-flex" }}
        >
          Hitos de tu transformación
        </span>
        <p style={{ margin: 0, color: "var(--color-warm-500)", fontSize: 14 }}>
          Cuando completes acciones (primera reflexión, primer capítulo, 7 días
          seguidos…) verás cada hito que vas desbloqueando aquí, como un
          recorrido en el tiempo.
        </p>
      </div>
    );
  }

  // Sort: unlocked first (oldest unlock first → newest), then in-progress
  // at the end as "next steps". This matches the design's narrative arc.
  const unlocked = milestones
    .filter((m) => m.unlockedAt !== null)
    .sort((a, b) => (a.unlockedAt ?? "").localeCompare(b.unlockedAt ?? ""));
  const inProgress = milestones.filter((m) => m.unlockedAt === null);

  return (
    <div className="card" style={{ padding: "26px 28px" }}>
      <span
        className="card-tag"
        style={{ marginBottom: 22, display: "inline-flex" }}
      >
        Hitos de tu transformación
      </span>
      <div className="tl">
        {unlocked.map((m, i) => (
          <TLItem
            key={m.id}
            milestone={m}
            // Alternate sage accent on every other unlocked row to match
            // the design's visual rhythm.
            variant={i % 2 === 1 ? "sage" : "default"}
          />
        ))}
        {inProgress.slice(0, 2).map((m) => (
          <TLItem key={m.id} milestone={m} variant="next" />
        ))}
      </div>
    </div>
  );
}

const ICON_BY_TOKEN: Record<
  string,
  (p: { size?: number }) => React.JSX.Element
> = {
  "book-open": IconBook,
  flame: IconFlame,
  star: IconPatterns,
  patterns: IconPatterns,
  eco: IconEco,
  reflections: IconReflections,
};

function TLItem({
  milestone,
  variant,
}: {
  milestone: EvolucionMilestone;
  variant: "default" | "sage" | "next";
}) {
  const Icon = ICON_BY_TOKEN[milestone.icon] ?? IconPatterns;
  const cls =
    variant === "default"
      ? "tl-item"
      : variant === "sage"
        ? "tl-item sage"
        : "tl-item next";

  const monthLabel = formatMonth(milestone.unlockedAt) ?? "Próximo paso";

  return (
    <div className={cls}>
      <span className="tl-dot">
        <Icon size={22} />
      </span>
      <div className="tl-body">
        <div className="tl-month">{monthLabel}</div>
        <h4>{milestone.label}</h4>
        <p>{milestone.description}</p>
        <span className="tl-tag">
          {variant === "next"
            ? `Falta: ${Math.max(
                0,
                milestone.progressTarget - milestone.progressCurrent,
              )}`
            : milestone.category
              ? `+ ${milestone.category}`
              : "+ hito desbloqueado"}
        </span>
      </div>
    </div>
  );
}

function formatMonth(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const month = d.toLocaleDateString("es-EC", { month: "long" });
  return month.charAt(0).toUpperCase() + month.slice(1);
}
