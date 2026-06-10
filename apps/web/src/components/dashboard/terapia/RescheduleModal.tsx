"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TherapistAvailabilityResponse } from "@psico/types";
import {
  getTherapistAvailabilityAction,
  rescheduleSessionAction,
} from "@/actions/terapia";

interface Props {
  sessionId: string;
  therapistId: string;
  currentSlotIso: string;
  onClose: () => void;
}

export function RescheduleModal({
  sessionId,
  therapistId,
  currentSlotIso,
  onClose,
}: Props) {
  const router = useRouter();
  const [availability, setAvailability] =
    useState<TherapistAvailabilityResponse | null>(null);
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getTherapistAvailabilityAction(therapistId, 14)
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
  }, [therapistId]);

  function handleSubmit() {
    if (!slotIso) return;
    setError(null);
    startTransition(async () => {
      try {
        await rescheduleSessionAction(sessionId, slotIso);
        router.refresh();
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No pudimos re-agendar.",
        );
      }
    });
  }

  const slotsByDay = availability
    ? groupSlotsByDay(availability.slots, currentSlotIso)
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h2
          className="text-[18px] font-semibold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Cambiar de horario
        </h2>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Elegí un nuevo slot libre del mismo terapeuta. Tu pago se mantiene.
        </p>

        {error ? (
          <p
            className="mt-3 rounded-xl px-3 py-2 text-[12px]"
            style={{
              background: "var(--color-rose-50)",
              color: "var(--color-rose-700)",
            }}
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
            Sin horarios libres en los próximos 14 días. Intentá cancelar y
            reservar más adelante.
          </p>
        ) : (
          <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
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

        <div className="mt-5 flex justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[13px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!slotIso || pending}
            className="rounded-xl px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
            style={{ background: "var(--color-lavender-600)" }}
          >
            {pending ? "Guardando…" : "Confirmar cambio"}
          </button>
        </div>
      </div>
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
  currentSlotIso: string,
): DayBucket[] {
  const groups = new Map<string, DayBucket>();
  for (const s of slots) {
    // Filter out the current slot (no-op reschedule).
    if (s.iso === currentSlotIso) continue;
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
