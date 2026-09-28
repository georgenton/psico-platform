import type { ReactNode } from "react";
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
  /** #732 — el nivel del título lo decide quien monta la tarjeta. */
  tituloComo?: "h2" | "h3" | "h4";
  journey: JourneyListItem;
}

function durationLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hora" : `${hours} horas`;
}

export function ExFeaturedCard({ journey, tituloComo = "h3" }: Props) {
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
        <Titulo como={tituloComo}>{journey.title}</Titulo>
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
  return <Tag className="exf-title">{children}</Tag>;
}
