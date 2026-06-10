import type { Metadata } from "next";
import Link from "next/link";
import type { TherapyHubResponse } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { TherapistCard } from "@/components/dashboard/terapia/TherapistCard";

export const metadata: Metadata = { title: "Terapia" };
export const dynamic = "force-dynamic";

export default async function TerapiaHubPage() {
  let hub: TherapyHubResponse | null = null;
  let loadError: string | null = null;
  try {
    hub = await serverFetch<TherapyHubResponse>("/terapia/hub");
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError =
      err instanceof Error ? err.message : "Error desconocido";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1
          className="text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Terapia
        </h1>
        <p
          className="mt-1 text-[14px] leading-relaxed"
          style={{ color: "var(--color-warm-700)" }}
        >
          {hub?.intro ??
            "Aquí encuentras espacios para hablar con un terapeuta cuando lo necesites."}
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
          No pudimos cargar el hub: <span className="font-mono">{loadError}</span>
        </div>
      ) : null}

      {/* Next session card */}
      {hub?.nextSession ? (
        <section
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <p
            className="text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-lavender-700)" }}
          >
            Próxima sesión
          </p>
          <p
            className="mt-1 text-[18px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {new Date(hub.nextSession.scheduledAt).toLocaleString("es-419", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </p>
          <p
            className="mt-0.5 text-[13px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            con {hub.nextSession.therapist.name} · {hub.nextSession.durationMin} min
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href={`/dashboard/terapia/sesiones/${hub.nextSession.id}`}
              className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium"
              style={{
                borderColor: "var(--color-warm-300)",
                color: "var(--color-warm-700)",
              }}
            >
              Ver detalle
            </Link>
            <Link
              href="/dashboard/terapia/sesiones"
              className="text-[12px] font-medium"
              style={{ color: "var(--color-lavender-700)" }}
            >
              Ver todas →
            </Link>
          </div>
        </section>
      ) : null}

      {/* CTAs */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/dashboard/terapia/terapeutas"
          className="rounded-2xl border-[1.5px] bg-white p-5 transition hover:border-[var(--color-lavender-400)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <div className="text-[24px]" aria-hidden>
            🔍
          </div>
          <p
            className="mt-2 text-[15px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Encontrar terapeuta
          </p>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Catálogo + filtros por enfoque, idioma, precio.
          </p>
        </Link>
        <Link
          href="/dashboard/terapia/crisis"
          className="rounded-2xl border-[1.5px] bg-white p-5 transition hover:border-[var(--color-rose-400)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <div className="text-[24px]" aria-hidden>
            🆘
          </div>
          <p
            className="mt-2 text-[15px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Apoyo inmediato
          </p>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Líneas de crisis y primeros pasos.
          </p>
        </Link>
        <Link
          href="/dashboard/terapia/recetas"
          className="rounded-2xl border-[1.5px] bg-white p-5 transition hover:border-[var(--color-sage-400)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <div className="text-[24px]" aria-hidden>
            📋
          </div>
          <p
            className="mt-2 text-[15px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Lo que tu terapeuta sugirió
          </p>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Libros, audios y ejercicios pendientes.
          </p>
        </Link>
        <Link
          href="/dashboard/terapia/notificaciones"
          className="rounded-2xl border-[1.5px] bg-white p-5 transition hover:border-[var(--color-lavender-400)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <div className="text-[24px]" aria-hidden>
            🔔
          </div>
          <p
            className="mt-2 text-[15px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Notificaciones
          </p>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Recordatorios y avisos de tus sesiones.
          </p>
        </Link>
      </section>

      {/* Active therapist */}
      {hub?.activeTherapist ? (
        <section>
          <p
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tu terapeuta
          </p>
          <TherapistCard
            therapist={hub.activeTherapist}
            href={`/dashboard/terapia/terapeutas/${hub.activeTherapist.id}`}
          />
        </section>
      ) : null}

      {/* Recent prescriptions */}
      {hub && hub.recentPrescriptions.length > 0 ? (
        <section>
          <p
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-warm-500)" }}
          >
            Lo que tu terapeuta sugirió
          </p>
          <ul
            className="divide-y rounded-2xl border-[1.5px] bg-white"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            {hub.recentPrescriptions.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 p-4"
              >
                <div>
                  <p
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {p.dosage ?? p.kind}
                  </p>
                  {p.note ? (
                    <p
                      className="mt-0.5 text-[12px]"
                      style={{ color: "var(--color-warm-700)" }}
                    >
                      {p.note}
                    </p>
                  ) : null}
                </div>
                {p.completedAt ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: "var(--color-sage-100)",
                      color: "var(--color-sage-700)",
                    }}
                  >
                    Hecho
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
