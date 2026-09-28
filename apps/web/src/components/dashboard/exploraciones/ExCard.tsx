import type { ReactNode } from "react";
import Link from "next/link";
import type { JourneyListItem, JourneyCoverToken } from "@psico/types";
import {
  IconBook,
  IconExplore,
  IconPatterns,
} from "@/components/dashboard/shell/icons";

/**
 * ExCard — Sprint F1.
 *
 * Single `.card.ex-card` from the design's `.explore-grid`. Maps the
 * journey's `coverToken` to the design's `.c1` / `.c2` / `.c3` cover
 * gradient classes. The grid card omits per-step progress — the featured
 * card is the only one that exposes that — and instead surfaces the book
 * count + duration in the footer.
 */
interface Props {
  /** #732 — el nivel del título lo decide quien monta la tarjeta. */
  tituloComo?: "h2" | "h3" | "h4";
  journey: JourneyListItem;
  index: number;
}

function durationLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hora" : `${hours} horas`;
}

// Cover class mapping — mixed → c3 (highest contrast in the design),
// cool → c1 (lavender), warm → c2 (sage). The design uses c1/c2/c3 so
// we rotate by index when the JourneyCoverToken doesn't differentiate.
const COVER_CLASS: Record<JourneyCoverToken, string> = {
  cool: "c1",
  warm: "c2",
  mixed: "c3",
};

// Cycle through three icons so a row of three cards doesn't all look
// identical, while keeping the visual language consistent with the rest
// of the dashboard.
const ICONS = [IconPatterns, IconExplore, IconBook];

export function ExCard({ journey, index, tituloComo = "h4" }: Props) {
  const coverClass = COVER_CLASS[journey.coverToken];
  const Icon = ICONS[index % ICONS.length] ?? IconExplore;
  const firstBook = journey.books[0];
  const href = firstBook
    ? `/dashboard/biblioteca/${firstBook.slug}`
    : "/dashboard/biblioteca";

  return (
    <div className="card ex-card">
      <div className={`ex-cover ${coverClass}`}>
        <Icon size={34} />
      </div>
      <div className="ex-cbody">
        {/* The design pins each ex-card to a pattern label. We don't have
            an ML "connect with" mapping yet, so we surface the journey's
            subtitle instead — same visual chip, honest copy. */}
        <span className="ex-link-pat">
          <IconPatterns size={13} />
          {journey.subtitle}
        </span>
        <Titulo como={tituloComo}>{journey.title}</Titulo>
        <p className="ex-desc">{journey.description ?? journey.subtitle}</p>
        <div className="ex-steps">
          <span className="ex-step">
            <IconBook size={14} />
            {journey.books.length === 1
              ? "1 lectura"
              : `${journey.books.length} lecturas`}
          </span>
          <span className="ex-step">
            <IconExplore size={14} />
            {durationLabel(journey.durationMinutes)}
          </span>
        </div>
        <div className="ex-cfoot">
          <span
            style={{
              font: "500 11.5px/1 var(--font-sans)",
              color: "var(--color-warm-500)",
            }}
          >
            {journey.books.length === 1
              ? "1 paso"
              : `${journey.books.length} pasos`}
          </span>
          <Link
            href={href}
            className="ex-go"
            style={{ textDecoration: "none" }}
          >
            Empezar →
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * El título de la tarjeta, con el nivel que le pasa quien la monta (#732).
 *
 * Fijar un nivel absoluto en un componente reutilizable es decidir por el
 * llamador: la misma tarjeta puede colgar de un `<h1>` de pantalla o de una
 * sección más honda. La clase es la que da el estilo, así que cambiar de nivel
 * no mueve un píxel.
 */
function Titulo({
  como,
  children,
}: {
  como: "h2" | "h3" | "h4";
  children: ReactNode;
}) {
  const Tag = como;
  return <Tag className="ex-card-title">{children}</Tag>;
}
