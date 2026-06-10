"use client";

import { useEffect, useState, useTransition } from "react";
import { terapiaApi } from "@psico/api-client";
import type {
  TherapistAvailabilityResponse,
  TherapistDetail,
  TherapyModality,
} from "@psico/types";
import { createBookingAction } from "@/actions/terapia";

type Step = 1 | 2 | 3;

const MODALITY_LABEL: Record<TherapyModality, string> = {
  INDIVIDUAL: "Individual",
  COUPLE: "Pareja",
  FAMILY: "Familia",
};

// Curated reasons. v1 hardcoded; backend admite cualquier id de 1-64 chars.
const FIRST_REASONS = [
  { id: "ansiedad", label: "Ansiedad" },
  { id: "duelo", label: "Duelo" },
  { id: "pareja", label: "Pareja" },
  { id: "trabajo", label: "Estrés laboral" },
  { id: "identidad", label: "Identidad" },
  { id: "otro", label: "Otro" },
];

export function BookingFlow({ therapist }: { therapist: TherapistDetail }) {
  const [step, setStep] = useState<Step>(1);
  const [modality, setModality] = useState<TherapyModality | null>(null);
  const [firstReasonId, setFirstReasonId] = useState<string | null>(null);
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [availability, setAvailability] =
    useState<TherapistAvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Load availability when entering step 2.
  useEffect(() => {
    if (step !== 2 || availability) return;
    let cancelled = false;
    terapiaApi
      .getAvailability(therapist.id, 14)
      .then((data) => {
        if (!cancelled) setAvailability(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "No pudimos cargar horarios.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [step, availability, therapist.id]);

  function handleSubmit() {
    if (!modality || !slotIso) return;
    setError(null);
    startTransition(async () => {
      const res = await createBookingAction(
        therapist.id,
        slotIso,
        modality,
        firstReasonId ?? undefined,
      );
      // createBookingAction redirects on success (NEXT_REDIRECT bubbles up).
      if (res?.error) setError(res.error);
    });
  }

  // Group slots by day for the grid.
  const slotsByDay = availability
    ? groupSlotsByDay(availability.slots)
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <StepIndicator current={step} />

      {step === 1 ? (
        <section
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <h2
            className="text-[18px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Modalidad
          </h2>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            ¿Cómo será la sesión?
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {therapist.modalities.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModality(m)}
                className="rounded-xl border-[1.5px] px-4 py-3 text-[13px] font-medium"
                style={{
                  borderColor:
                    modality === m
                      ? "var(--color-lavender-500)"
                      : "var(--color-warm-200)",
                  background:
                    modality === m
                      ? "var(--color-lavender-50)"
                      : "white",
                  color:
                    modality === m
                      ? "var(--color-lavender-700)"
                      : "var(--color-warm-700)",
                }}
              >
                {MODALITY_LABEL[m]}
              </button>
            ))}
          </div>
          <h2
            className="mt-6 text-[18px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Razón principal
          </h2>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Opcional. Solo el terapeuta lo ve antes de la sesión.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {FIRST_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  setFirstReasonId(firstReasonId === r.id ? null : r.id)
                }
                className="rounded-full px-3 py-1.5 text-[12px] font-medium"
                style={{
                  background:
                    firstReasonId === r.id
                      ? "var(--color-lavender-100)"
                      : "var(--color-warm-50)",
                  color:
                    firstReasonId === r.id
                      ? "var(--color-lavender-700)"
                      : "var(--color-warm-700)",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={!modality}
              onClick={() => setStep(2)}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--color-lavender-600)" }}
            >
              Continuar →
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <h2
            className="text-[18px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Elegí horario
          </h2>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Próximos 14 días · {availability?.timezone ?? "Cargando…"}
          </p>
          {error ? (
            <p
              className="mt-3 text-[12px]"
              style={{ color: "var(--color-rose-600)" }}
            >
              {error}
            </p>
          ) : null}
          {!availability ? (
            <p
              className="mt-4 text-[13px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              Cargando horarios…
            </p>
          ) : slotsByDay && slotsByDay.length === 0 ? (
            <p
              className="mt-4 text-[13px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              Sin horarios disponibles próximamente. Reintenta más tarde.
            </p>
          ) : (
            <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
              {slotsByDay?.map((day) => (
                <div key={day.key}>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {day.label}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {day.slots.map((s) => (
                      <button
                        key={s.iso}
                        type="button"
                        disabled={!s.available}
                        onClick={() => setSlotIso(s.iso)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-mono disabled:opacity-30"
                        style={{
                          background:
                            slotIso === s.iso
                              ? "var(--color-lavender-600)"
                              : "var(--color-warm-50)",
                          color:
                            slotIso === s.iso
                              ? "white"
                              : "var(--color-warm-700)",
                        }}
                      >
                        {new Date(s.iso).toLocaleTimeString("es-419", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-[13px]"
              style={{ color: "var(--color-warm-700)" }}
            >
              ← Volver
            </button>
            <button
              type="button"
              disabled={!slotIso}
              onClick={() => setStep(3)}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--color-lavender-600)" }}
            >
              Continuar →
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <h2
            className="text-[18px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Confirmar
          </h2>
          <dl
            className="mt-4 space-y-2 text-[13px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            <Row label="Terapeuta">
              {therapist.name} ({therapist.title})
            </Row>
            <Row label="Modalidad">
              {modality ? MODALITY_LABEL[modality] : "—"}
            </Row>
            <Row label="Cuándo">
              {slotIso
                ? new Date(slotIso).toLocaleString("es-419", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })
                : "—"}
            </Row>
            <Row label="Duración">50 minutos</Row>
            <Row label="Total">
              ${therapist.priceUsd.toFixed(2)} {therapist.currency}
            </Row>
          </dl>
          {error ? (
            <p
              className="mt-4 rounded-xl px-3 py-2 text-[12px]"
              style={{
                background: "var(--color-rose-50)",
                color: "var(--color-rose-700)",
              }}
            >
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={pending}
              className="text-[13px]"
              style={{ color: "var(--color-warm-700)" }}
            >
              ← Volver
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="rounded-xl px-5 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--color-sage-600)" }}
            >
              {pending ? "Procesando…" : "Pagar y reservar"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 text-[12px]">
      {[1, 2, 3].map((s) => (
        <span
          key={s}
          className="rounded-full px-2.5 py-0.5 font-medium"
          style={{
            background:
              s === current ? "var(--color-lavender-600)" : "var(--color-warm-100)",
            color: s === current ? "white" : "var(--color-warm-700)",
          }}
        >
          Paso {s}
        </span>
      ))}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between border-b pb-1.5">
      <dt
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-warm-500)" }}
      >
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

interface DayBucket {
  key: string;
  label: string;
  slots: { iso: string; available: boolean }[];
}

function groupSlotsByDay(
  slots: { iso: string; available: boolean }[],
): DayBucket[] {
  const groups = new Map<string, DayBucket>();
  for (const s of slots) {
    const date = new Date(s.iso);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("es-419", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
    if (!groups.has(key)) {
      groups.set(key, { key, label, slots: [] });
    }
    groups.get(key)!.slots.push({ iso: s.iso, available: s.available });
  }
  return Array.from(groups.values()).filter((d) =>
    d.slots.some((s) => s.available),
  );
}
