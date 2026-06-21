import Link from "next/link";
import type { JourneyListItem } from "@psico/types";
import { IconExplore } from "@/components/dashboard/shell/icons";

/**
 * ExFeaturedCard — Sprint F1.
 *
 * Renders the `.card.ex-feature` block from the design's `s-exploraciones`
 * screen. The design shows it as a "Continúa tu exploración" card with a
 * progress bar, but until we track per-journey progress we surface it as
 * an entry-point CTA — "Empezar esta exploración" — and link the user to
 * the first bundled book.
 */
interface Props {
  journey: JourneyListItem;
}

function durationLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hora" : `${hours} horas`;
}

export function ExFeaturedCard({ journey }: Props) {
  const firstBook = journey.books[0];
  const continueHref = firstBook
    ? `/dashboard/biblioteca/${firstBook.slug}`
    : "/dashboard/biblioteca";

  return (
    <div className="card ex-feature">
      <div className="exf-cover">
        <IconExplore size={56} />
      </div>
      <div className="exf-body">
        <span className="exf-tag">Recorrido sugerido</span>
        <h3>{journey.title}</h3>
        <p>{journey.description ?? journey.subtitle}</p>
        <div className="exf-foot">
          <div className="exf-prog">
            <div className="bar">
              {/* No per-journey progress yet — render the bar empty so the
                  visual rhythm of the design is preserved without faking
                  data. The label tells the user what the bar will mean. */}
              <i style={{ width: "0%" }} />
            </div>
            <div className="lbl">
              {journey.books.length === 1
                ? "1 libro"
                : `${journey.books.length} libros`}{" "}
              · {durationLabel(journey.durationMinutes)}
            </div>
          </div>
          <Link
            href={continueHref}
            className="btn primary"
            style={{ textDecoration: "none" }}
          >
            Empezar →
          </Link>
        </div>
      </div>
    </div>
  );
}
