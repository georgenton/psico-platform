import type { Metadata } from "next";
import Link from "next/link";
import type { TherapyPrescriptionItem } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { PrescriptionToggle } from "@/components/dashboard/terapia/PrescriptionToggle";

export const metadata: Metadata = { title: "Recetas · Terapia" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  BOOK: "📖 Libro",
  AUDIO: "🎧 Audio",
  EXERCISE: "🧘 Ejercicio",
  CARTA: "✉️ Carta",
};

export default async function RecetasPage() {
  let items: TherapyPrescriptionItem[] | null = null;
  let loadError: string | null = null;
  try {
    items = await serverFetch<TherapyPrescriptionItem[]>(
      "/terapia/prescriptions",
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError = err instanceof Error ? err.message : "Error desconocido";
  }

  const open = items?.filter((p) => !p.completedAt) ?? [];
  const done = items?.filter((p) => p.completedAt) ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
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
          Lo que tu terapeuta sugirió
        </h1>
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

      {items && items.length === 0 ? (
        <p
          className="rounded-2xl border-[1.5px] bg-white p-8 text-center text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          Cuando tengas tu primera sesión, las sugerencias que te dé tu
          terapeuta aparecerán acá.
        </p>
      ) : null}

      {open.length > 0 ? (
        <section>
          <h2
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-warm-500)" }}
          >
            Pendientes
          </h2>
          <ul className="space-y-2">
            {open.map((p) => (
              <PrescriptionCard key={p.id} item={p} />
            ))}
          </ul>
        </section>
      ) : null}

      {done.length > 0 ? (
        <section>
          <h2
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-warm-500)" }}
          >
            Completadas
          </h2>
          <ul className="space-y-2">
            {done.map((p) => (
              <PrescriptionCard key={p.id} item={p} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PrescriptionCard({ item }: { item: TherapyPrescriptionItem }) {
  return (
    <li
      className="rounded-2xl border-[1.5px] bg-white p-4"
      style={{
        borderColor: item.completedAt
          ? "var(--color-sage-200)"
          : "var(--color-warm-200)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {KIND_LABEL[item.kind] ?? item.kind} · {item.dosage ?? "Sin dosis"}
          </p>
          {item.note ? (
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: "var(--color-warm-700)" }}
            >
              {item.note}
            </p>
          ) : null}
          {item.dueBy && !item.completedAt ? (
            <p
              className="mt-1 text-[11px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              Sugerido para antes del{" "}
              {new Date(item.dueBy).toLocaleDateString("es-419", {
                dateStyle: "long",
              })}
            </p>
          ) : null}
        </div>
        <PrescriptionToggle
          prescriptionId={item.id}
          initialCompleted={!!item.completedAt}
        />
      </div>
    </li>
  );
}
