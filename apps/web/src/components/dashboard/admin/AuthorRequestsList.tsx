import type {
  AuthorRequestStatus,
  PulsoAuthorRequestListResponse,
} from "@psico/types";
import { AuthorRequestActions } from "./AuthorRequestActions";

/**
 * AuthorRequestsList — Sprint S71.B-front.
 *
 * Server Component that renders the inbox. Each row has the editorial info
 * (book + author + chapters count + submitted date) and the action chip
 * (which is a Client Component for the approve/reject flow).
 */
function formatDate(iso: Date | string | null): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeColor(state: string): { bg: string; fg: string } {
  if (state === "APPROVED") {
    return { bg: "var(--color-sage-100)", fg: "var(--color-sage-700)" };
  }
  if (state === "REJECTED") {
    return { bg: "var(--color-rose-100)", fg: "var(--color-rose-700)" };
  }
  return { bg: "var(--color-lavender-100)", fg: "var(--color-lavender-700)" };
}

export function AuthorRequestsList({
  data,
  status,
}: {
  data: PulsoAuthorRequestListResponse;
  status: AuthorRequestStatus;
}) {
  if (data.items.length === 0) {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-8 text-center text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        {status === "PENDING"
          ? "No hay pedidos pendientes. Pulso al día."
          : "Aún no hay pedidos de revisión."}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {data.items.map((req) => {
        const c = badgeColor(req.reviewState);
        return (
          <li
            key={req.id}
            className="rounded-2xl border-[1.5px] bg-white p-5"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {req.reviewState}
                  </span>
                  <span
                    className="text-[11.5px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {formatDate(req.submittedAt)}
                  </span>
                </div>
                <h2
                  className="mt-2 text-[18px] font-bold tracking-tight"
                  style={{ color: "var(--color-warm-900)" }}
                >
                  {req.book.title}
                </h2>
                {req.book.subtitle ? (
                  <p
                    className="mt-0.5 text-[13px]"
                    style={{ color: "var(--color-warm-600)" }}
                  >
                    {req.book.subtitle}
                  </p>
                ) : null}

                <dl
                  className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]"
                  style={{ color: "var(--color-warm-700)" }}
                >
                  <div className="flex gap-1">
                    <dt className="font-medium">Autor:</dt>
                    <dd>{req.book.author.name}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-medium">Email:</dt>
                    <dd>{req.book.author.email}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-medium">Capítulos:</dt>
                    <dd>{req.book.chapters}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-medium">Idioma:</dt>
                    <dd>{req.book.language}</dd>
                  </div>
                </dl>

                {req.book.summary ? (
                  <p
                    className="mt-3 line-clamp-4 text-[13px] leading-relaxed"
                    style={{ color: "var(--color-warm-700)" }}
                  >
                    {req.book.summary}
                  </p>
                ) : (
                  <p
                    className="mt-3 italic text-[12.5px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    Sin resumen.
                  </p>
                )}

                {req.feedback ? (
                  <div
                    className="mt-3 rounded-xl border-[1.5px] p-3 text-[12.5px]"
                    style={{
                      borderColor: "var(--color-rose-200)",
                      background: "var(--color-rose-50)",
                      color: "var(--color-rose-700)",
                    }}
                  >
                    <p className="font-medium">Feedback enviado al autor:</p>
                    <p className="mt-1 whitespace-pre-wrap">{req.feedback}</p>
                  </div>
                ) : null}
              </div>

              {req.reviewState === "PENDING" ? (
                <AuthorRequestActions requestId={req.id} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
