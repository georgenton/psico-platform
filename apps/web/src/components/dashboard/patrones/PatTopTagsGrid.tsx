import type { PatronesPeriod, PatronesTheme } from "@psico/types";
import {
  IconBook,
  IconEco,
  IconFlame,
  IconPatterns,
  IconPencil,
  IconWind,
} from "@/components/dashboard/shell/icons";

/**
 * PatTopTagsGrid — Sprint F1.
 *
 * Renders the `.card.pat` grid from the design's `s-patrones` screen.
 * Backed by `PatronesResponse.themes` (top tags + count). Each card
 * shows a `card-tag` label, an icon, the tag name, a count subtitle, a
 * short description, and the progress bar from the design.
 *
 * When the backend later returns LLM-detected patterns we add a richer
 * pattern shape without changing this card layout.
 */

interface Props {
  themes: PatronesTheme[];
  entryCount: number;
  period: PatronesPeriod;
}

const PAT_ICONS = [
  IconPatterns,
  IconFlame,
  IconWind,
  IconPencil,
  IconBook,
  IconEco,
];

export function PatTopTagsGrid({ themes, entryCount, period }: Props) {
  const top = [...themes].sort((a, b) => b.count - a.count).slice(0, 5);

  if (top.length === 0) {
    return (
      <div className="card pat" style={{ gridColumn: "span 2" }}>
        <span className="card-tag">Patrones por descubrir</span>
        <p style={{ margin: "12px 0 0", color: "var(--color-warm-500)" }}>
          Cuando uses tags en tus reflexiones (trabajo, familia, sueño, …), aquí
          verás cuáles temas se repiten más y cómo evolucionan.
        </p>
      </div>
    );
  }

  return (
    <>
      {top.map((theme, i) => {
        const pct = entryCount
          ? Math.min(100, Math.round((theme.count / entryCount) * 100))
          : 0;
        const Icon = PAT_ICONS[i % PAT_ICONS.length] ?? IconPatterns;
        const tagLabel = i === 0 ? "Patrón predominante" : "Patrón recurrente";
        const periodLabel =
          period === "30d" ? "mes" : period === "90d" ? "trimestre" : "año";
        return (
          <div key={theme.id} className="card pat">
            <span className="card-tag">{tagLabel}</span>
            <div className="p-head">
              <span className="pg">
                <Icon size={22} />
              </span>
              <div>
                <h3 style={{ margin: 0, textTransform: "capitalize" }}>
                  {theme.label}
                </h3>
                <div className="sub">
                  {theme.count} de {entryCount} reflexiones
                </div>
              </div>
            </div>
            <p className="p-desc">
              Aparece en el {pct}% de tus entradas del último {periodLabel}.
            </p>
            <div className="p-meter">
              <div className="bar">
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="pct">{pct}%</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
