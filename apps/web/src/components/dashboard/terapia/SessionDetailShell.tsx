"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decryptString, encryptString } from "@psico/crypto";
import type { SessionPrepResponse } from "@psico/types";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import {
  cancelSessionAction,
  joinSessionAction,
  retryCheckoutAction,
  updateSessionPrepAction,
} from "@/actions/terapia";
import { FeedbackModal } from "@/components/dashboard/terapia/FeedbackModal";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Programada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No-show",
  MISSED: "Perdida",
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Pago pendiente",
  PAID: "Pagado",
  FAILED: "Pago fallido",
  REFUNDED: "Reembolsado",
};

const MOODS = [
  { id: "calmo", label: "🙂 Calmo" },
  { id: "ansioso", label: "😰 Ansioso" },
  { id: "triste", label: "😔 Triste" },
  { id: "energico", label: "✨ Enérgico" },
  { id: "cansado", label: "🥱 Cansado" },
];

export function SessionDetailShell({
  initial,
}: {
  initial: SessionPrepResponse;
}) {
  const router = useRouter();
  const { key } = useDiaryKey();
  const [data, setData] = useState(initial);
  const [intention, setIntention] = useState("");
  const [intentionLoaded, setIntentionLoaded] = useState(false);
  const [mood, setMood] = useState<string | null>(initial.prep.checkInMood);
  const [savedFlash, setSavedFlash] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastSavedIntention = useRef("");

  // Decrypt the existing intention once the key is available.
  useEffect(() => {
    if (!key || intentionLoaded) return;
    if (!data.prep.intentionCiphertext || !data.prep.intentionNonce) {
      setIntentionLoaded(true);
      return;
    }
    try {
      const plain = decryptString(
        {
          ciphertext: data.prep.intentionCiphertext,
          nonce: data.prep.intentionNonce,
        },
        key,
      );
      setIntention(plain);
      lastSavedIntention.current = plain;
      setIntentionLoaded(true);
    } catch {
      setError("No pudimos leer la intención cifrada. Vuelve a escribirla.");
      setIntentionLoaded(true);
    }
  }, [key, intentionLoaded, data.prep]);

  function handleSaveIntention() {
    if (!key || pending) return;
    if (intention === lastSavedIntention.current) return;
    startTransition(async () => {
      try {
        const trimmed = intention.trim();
        if (trimmed) {
          const env = encryptString(trimmed, key);
          const updated = await updateSessionPrepAction(data.session.id, {
            intentionCiphertext: env.ciphertext,
            intentionNonce: env.nonce,
          });
          setData(updated);
        } else {
          const updated = await updateSessionPrepAction(data.session.id, {
            intentionCiphertext: "",
            intentionNonce: "",
          });
          setData(updated);
        }
        lastSavedIntention.current = intention;
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No pudimos guardar la intención.",
        );
      }
    });
  }

  function handleMood(m: string) {
    setMood(m);
    startTransition(async () => {
      try {
        const updated = await updateSessionPrepAction(data.session.id, {
          checkInMood: m,
        });
        setData(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error guardando mood.");
      }
    });
  }

  function handleJoin() {
    startTransition(async () => {
      const res = await joinSessionAction(data.session.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.joinUrl) {
        window.open(res.joinUrl, "_blank", "noopener,noreferrer");
      }
    });
  }

  function handleCancel() {
    const reason = window.prompt(
      "¿Por qué cancelas? (mínimo 1 caracter)",
      "",
    );
    if (!reason) return;
    startTransition(async () => {
      try {
        await cancelSessionAction(data.session.id, reason, false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cancelar.");
      }
    });
  }

  function handleRetry() {
    startTransition(async () => {
      const res = await retryCheckoutAction(data.session.id);
      if (res?.error) setError(res.error);
    });
  }

  const start = new Date(data.session.scheduledAt);
  const end = new Date(start.getTime() + data.session.durationMin * 60 * 1000);
  const nowMs = Date.now();
  const inJoinWindow =
    nowMs >= start.getTime() - 5 * 60 * 1000 && nowMs <= end.getTime() + 15 * 60 * 1000;
  // Feedback button shown once we're past the session end (regardless of join)
  // and status is still SCHEDULED or IN_PROGRESS.
  const canCloseSession =
    nowMs > end.getTime() &&
    (data.session.status === "SCHEDULED" ||
      data.session.status === "IN_PROGRESS") &&
    data.session.paymentStatus === "PAID";
  const canEditPrep = data.session.paymentStatus === "PAID" && key !== null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Session card */}
      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p
              className="text-[12px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-lavender-700)" }}
            >
              {STATUS_LABEL[data.session.paymentStatus === "PENDING"
                ? "PENDING_PAYMENT"
                : data.session.status === "SCHEDULED" && data.session.paymentStatus === "PAID"
                  ? "SCHEDULED"
                  : ""] ?? STATUS_LABEL[data.session.status]}
            </p>
            <p
              className="mt-1 text-[18px] font-semibold"
              style={{ color: "var(--color-warm-900)" }}
            >
              {data.session.therapist.name}
            </p>
            <p
              className="mt-0.5 text-[13px]"
              style={{ color: "var(--color-warm-700)" }}
            >
              {start.toLocaleString("es-419", {
                dateStyle: "full",
                timeStyle: "short",
              })}{" "}
              · {data.session.durationMin} min
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{
              background:
                data.session.paymentStatus === "PAID"
                  ? "var(--color-sage-100)"
                  : "var(--color-rose-100)",
              color:
                data.session.paymentStatus === "PAID"
                  ? "var(--color-sage-700)"
                  : "var(--color-rose-700)",
            }}
          >
            {PAYMENT_LABEL[data.session.paymentStatus]}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {data.session.paymentStatus === "PENDING" ? (
            <button
              type="button"
              onClick={handleRetry}
              disabled={pending}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-white"
              style={{ background: "var(--color-lavender-600)" }}
            >
              Pagar ahora
            </button>
          ) : inJoinWindow && data.session.status === "SCHEDULED" ? (
            <button
              type="button"
              onClick={handleJoin}
              disabled={pending}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-white"
              style={{ background: "var(--color-sage-600)" }}
            >
              Unirse a la sala →
            </button>
          ) : data.session.status === "SCHEDULED" ? (
            <p
              className="text-[12px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              La sala se abre 5 min antes de tu sesión.
            </p>
          ) : null}

          {data.session.status === "SCHEDULED" && !canCloseSession ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              className="rounded-xl border-[1.5px] bg-white px-4 py-2 text-[13px] font-medium"
              style={{
                borderColor: "var(--color-rose-300)",
                color: "var(--color-rose-700)",
              }}
            >
              Cancelar
            </button>
          ) : null}

          {canCloseSession ? (
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              disabled={pending}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-white"
              style={{ background: "var(--color-lavender-600)" }}
            >
              Cerrar y dejar feedback →
            </button>
          ) : null}
        </div>

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
      </section>

      {/* Pre-session prep */}
      {data.session.status === "SCHEDULED" ? (
        <section
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <h2
            className="text-[15px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Pre-sesión
          </h2>
          <p
            className="mt-1 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Lo que escribas se cifra en tu navegador con tu clave del Diario. Tu
            terapeuta solo podrá verlo si decides compartirlo dentro de la sala.
          </p>

          {!key ? (
            <div
              className="mt-3 rounded-xl px-3 py-2 text-[12px]"
              style={{
                background: "var(--color-warm-50)",
                color: "var(--color-warm-700)",
              }}
            >
              🔐 Desbloqueá tu Diario para escribir tu intención.
            </div>
          ) : data.session.paymentStatus !== "PAID" ? (
            <div
              className="mt-3 rounded-xl px-3 py-2 text-[12px]"
              style={{
                background: "var(--color-rose-50)",
                color: "var(--color-rose-700)",
              }}
            >
              Confirmá el pago para empezar a preparar tu sesión.
            </div>
          ) : (
            <>
              <p
                className="mt-4 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-warm-500)" }}
              >
                Cómo te estás sintiendo
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleMood(m.id)}
                    disabled={pending}
                    className="rounded-full px-3 py-1 text-[12px] font-medium"
                    style={{
                      background:
                        mood === m.id
                          ? "var(--color-lavender-100)"
                          : "var(--color-warm-50)",
                      color:
                        mood === m.id
                          ? "var(--color-lavender-700)"
                          : "var(--color-warm-700)",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <p
                className="mt-5 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-warm-500)" }}
              >
                ¿Qué querés tratar?
              </p>
              <textarea
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                onBlur={handleSaveIntention}
                disabled={!canEditPrep || pending}
                rows={6}
                placeholder="Escribí lo que tengas en mente. Es para vos. Cifrado punta-a-punta."
                className="mt-2 w-full rounded-xl border-[1.5px] bg-white p-3 text-[13px] focus:outline-none disabled:bg-[var(--color-warm-50)]"
                style={{
                  borderColor: "var(--color-warm-200)",
                  color: "var(--color-warm-900)",
                }}
              />
              <div className="mt-2 flex items-center justify-between text-[11px]">
                {savedFlash ? (
                  <span style={{ color: "var(--color-sage-700)" }}>
                    ✓ Guardado
                  </span>
                ) : (
                  <span style={{ color: "var(--color-warm-500)" }}>
                    Se guarda al salir del campo.
                  </span>
                )}
                <span style={{ color: "var(--color-warm-500)" }}>
                  {intention.length} caracteres
                </span>
              </div>
            </>
          )}
        </section>
      ) : null}

      {feedbackOpen ? (
        <FeedbackModal
          sessionId={data.session.id}
          onClose={() => setFeedbackOpen(false)}
        />
      ) : null}
    </div>
  );
}
