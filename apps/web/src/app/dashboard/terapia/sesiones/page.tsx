import type { Metadata } from "next";
import Link from "next/link";
import type {
  TherapySessionListItem,
  TherapySessionsListResponse,
} from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";

export const metadata: Metadata = { title: "Mis sesiones · Terapia" };
export const dynamic = "force-dynamic";

export default async function MisSesionesPage() {
  let data: TherapySessionsListResponse | null = null;
  let loadError: string | null = null;
  try {
    data = await serverFetch<TherapySessionsListResponse>(
      "/terapia/sessions?status=all",
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError = err instanceof Error ? err.message : "Error desconocido";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1
          className="text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Mis sesiones
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Próximas + historial.
        </p>
      </header>

      {loadError ? (
        <div
          className="rounded-2xl border-[1.5px] bg-white p-5 text-[13px]"
          style={{
            borderColor: "var(--color-rose-200)",
            color: "var(--color-rose-700)",
          }}
        >
          {loadError}
        </div>
      ) : null}

      <section>
        <h2
          className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-500)" }}
        >
          Próximas
        </h2>
        {data && data.upcoming.length > 0 ? (
          <ul className="space-y-2">
            {data.upcoming.map((s) => (
              <SessionRow key={s.id} session={s} kind="upcoming" />
            ))}
          </ul>
        ) : (
          <p
            className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-500)",
            }}
          >
            No tienes sesiones programadas.{" "}
            <Link
              href="/dashboard/terapia/terapeutas"
              style={{ color: "var(--color-lavender-700)" }}
            >
              Buscar terapeuta →
            </Link>
          </p>
        )}
      </section>

      <section>
        <h2
          className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-500)" }}
        >
          Historial
        </h2>
        {data && data.past.length > 0 ? (
          <ul className="space-y-2">
            {data.past.map((s) => (
              <SessionRow key={s.id} session={s} kind="past" />
            ))}
          </ul>
        ) : (
          <p
            className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-500)",
            }}
          >
            Sin historial todavía.
          </p>
        )}
      </section>
    </div>
  );
}

function SessionRow({
  session,
  kind,
}: {
  session: TherapySessionListItem;
  kind: "upcoming" | "past";
}) {
  const date = new Date(session.scheduledAt);
  return (
    <li
      className="rounded-2xl border-[1.5px] bg-white p-4"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-[14px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {session.therapist.name}
          </p>
          <p
            className="text-[12px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            {date.toLocaleString("es-419", {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · {session.durationMin} min
          </p>
        </div>
        <StatusBadge status={session.status} paymentStatus={session.paymentStatus} />
      </div>
      <div className="mt-3 flex gap-2">
        {kind === "upcoming" ? (
          <Link
            href={`/dashboard/terapia/sesiones/${session.id}`}
            className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium"
            style={{
              borderColor: "var(--color-warm-300)",
              color: "var(--color-warm-700)",
            }}
          >
            Detalle
          </Link>
        ) : session.feedbackRating !== null ? (
          <span
            className="text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tu rating: ⭐ {session.feedbackRating}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function StatusBadge({
  status,
  paymentStatus,
}: {
  status: string;
  paymentStatus: string;
}) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    SCHEDULED: {
      bg: "var(--color-lavender-100)",
      color: "var(--color-lavender-700)",
      label: "Programada",
    },
    IN_PROGRESS: {
      bg: "var(--color-sage-100)",
      color: "var(--color-sage-700)",
      label: "En curso",
    },
    COMPLETED: {
      bg: "var(--color-warm-100)",
      color: "var(--color-warm-700)",
      label: "Completada",
    },
    CANCELLED: {
      bg: "var(--color-rose-100)",
      color: "var(--color-rose-700)",
      label: "Cancelada",
    },
    NO_SHOW: {
      bg: "var(--color-warm-100)",
      color: "var(--color-warm-700)",
      label: "No-show",
    },
    MISSED: {
      bg: "var(--color-warm-100)",
      color: "var(--color-warm-700)",
      label: "Perdida",
    },
  };
  const c = config[status] ?? config.SCHEDULED;
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
        style={{ background: c.bg, color: c.color }}
      >
        {c.label}
      </span>
      {paymentStatus === "PENDING" ? (
        <span
          className="text-[10px] font-medium"
          style={{ color: "var(--color-rose-600)" }}
        >
          Pago pendiente
        </span>
      ) : null}
    </div>
  );
}
