import type { Metadata } from "next";
import Link from "next/link";
import type { TherapyNotificationsListResponse } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { MarkAllReadButton } from "@/components/dashboard/terapia/MarkAllReadButton";

export const metadata: Metadata = { title: "Notificaciones · Terapia" };
export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  let data: TherapyNotificationsListResponse | null = null;
  let loadError: string | null = null;
  try {
    data = await serverFetch<TherapyNotificationsListResponse>(
      "/terapia/notifications?limit=50",
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError = err instanceof Error ? err.message : "Error desconocido";
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/terapia"
            className="text-[13px]"
            style={{ color: "var(--color-lavender-700)" }}
          >
            ← Volver al hub
          </Link>
          <h1
            className="mt-2 text-[26px] font-bold tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Notificaciones
          </h1>
          {data ? (
            <p
              className="mt-1 text-[13px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {data.unreadCount > 0
                ? `${data.unreadCount} sin leer`
                : "Todas al día"}
            </p>
          ) : null}
        </div>
        {data && data.unreadCount > 0 ? (
          <MarkAllReadButton disabled={false} />
        ) : null}
      </header>

      {loadError ? (
        <p
          className="rounded-2xl border-[1.5px] bg-white p-5 text-[13px]"
          style={{
            borderColor: "var(--color-rose-200)",
            color: "var(--color-rose-700)",
          }}
        >
          {loadError}
        </p>
      ) : null}

      {data && data.items.length === 0 ? (
        <p
          className="rounded-2xl border-[1.5px] bg-white p-8 text-center text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          Cuando reservés tu próxima sesión, te avisamos por acá.
        </p>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="space-y-2">
          {data.items.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border-[1.5px] bg-white p-4"
              style={{
                borderColor: n.readAt
                  ? "var(--color-warm-200)"
                  : "var(--color-lavender-300)",
                background: n.readAt ? "white" : "var(--color-lavender-50)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {n.title}
                  </p>
                  <p
                    className="mt-1 text-[12px]"
                    style={{ color: "var(--color-warm-700)" }}
                  >
                    {n.body}
                  </p>
                  <p
                    className="mt-2 text-[11px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {new Date(n.createdAt).toLocaleString("es-419", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                {!n.readAt ? (
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: "var(--color-lavender-600)" }}
                    aria-label="Sin leer"
                  />
                ) : null}
              </div>
              {n.actionUrl ? (
                <div className="mt-3">
                  <Link
                    href={n.actionUrl}
                    className="text-[12px] font-medium"
                    style={{ color: "var(--color-lavender-700)" }}
                  >
                    Abrir →
                  </Link>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
