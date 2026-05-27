"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSubscriptionAction,
  reactivateSubscriptionAction,
} from "@/actions/subscription";

/**
 * SubscriptionActions — Sprint front-fase1 (Mi Plan web).
 *
 * Client component because the cancel flow opens a confirmation modal with
 * a free-text reason. Reactivate is a single button; we still need
 * `useTransition` to disable it while the server action runs.
 *
 * The actions call the server-action wrappers in `actions/subscription.ts`
 * which delegate to `POST /api/subscriptions/cancel` and
 * `POST /api/subscriptions/reactivate` and then `revalidatePath`. The
 * router.refresh() is belt-and-suspenders so the page rerenders even if
 * Next caches the route segment.
 */
export function SubscriptionActions({
  cancelAtPeriodEnd,
  effectiveAt,
}: {
  cancelAtPeriodEnd: boolean;
  effectiveAt: Date | string;
}) {
  if (cancelAtPeriodEnd) {
    return <ReactivateButton effectiveAt={effectiveAt} />;
  }
  return <CancelButton />;
}

// ─── Cancel ────────────────────────────────────────────────────────────────

function CancelButton() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        if (reason.trim()) formData.set("reason", reason.trim());
        await cancelSubscriptionAction(formData);
        // revalidatePath already runs server-side; this keeps the UI in
        // sync if route segment was rendered from the cache.
        router.refresh();
        setOpen(false);
        setReason("");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No pudimos cancelar tu suscripción. Reintenta.",
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium underline hover:opacity-70"
        style={{ color: "var(--color-warm-500)" }}
      >
        Cancelar suscripción
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6"
            style={{ border: "1.5px solid var(--color-warm-200)" }}
          >
            <h3
              id="cancel-title"
              className="text-lg font-bold"
              style={{ color: "var(--color-warm-900)" }}
            >
              ¿Cancelar tu suscripción?
            </h3>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: "var(--color-warm-600)" }}
            >
              Tu plan Pro se mantendrá activo hasta el fin del período actual.
              Después tu cuenta volverá al plan gratuito. Puedes reactivar en
              cualquier momento antes de esa fecha.
            </p>

            <label
              className="mt-4 block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-warm-500)" }}
            >
              ¿Algo que podamos mejorar? (opcional)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={480}
                placeholder="Tu respuesta nos ayuda a hacer el producto mejor."
                className="mt-2 w-full rounded-xl border-[1.5px] bg-[var(--color-warm-50)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-lavender-400)]"
                style={{
                  borderColor: "var(--color-warm-200)",
                  color: "var(--color-warm-800)",
                  resize: "vertical",
                }}
              />
            </label>

            {error ? (
              <p
                className="mt-3 text-[12px]"
                style={{ color: "var(--color-error-text, #B91C1C)" }}
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setReason("");
                  setError(null);
                }}
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-sm font-medium"
                style={{ color: "var(--color-warm-600)" }}
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "#B91C1C" }}
              >
                {submitting ? "Cancelando…" : "Confirmar cancelación"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─── Reactivate ────────────────────────────────────────────────────────────

function ReactivateButton({ effectiveAt }: { effectiveAt: Date | string }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await reactivateSubscriptionAction();
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No pudimos reactivar tu suscripción.",
        );
      }
    });
  }

  return (
    <div>
      <p
        className="mb-3 text-sm leading-relaxed"
        style={{ color: "var(--color-warm-700)" }}
      >
        Tu Pro termina el <strong>{formatDate(effectiveAt)}</strong>. Reactiva
        ahora para no perder acceso.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-sage-400)" }}
      >
        {submitting ? "Reactivando…" : "Reactivar suscripción"}
      </button>
      {error ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-error-text, #B91C1C)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
