"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replayTourAction } from "@/app/dashboard/security/actions";

/**
 * ReplayTourCard — Sprint G-polish.
 *
 * Opt-in re-trigger of the dashboard tour. Closes deuda S37: users who
 * dismissed the tour or finished it accidentally had no way to see it
 * again. Cards down here in Seguridad because it's an account-level
 * action (not a setting users would expect in Notificaciones).
 */
export function ReplayTourCard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleClick() {
    startTransition(async () => {
      setError(null);
      const result = await replayTourAction();
      if (result.ok) {
        setDone(true);
        // After the redirect → router.refresh hits the dashboard layout, which
        // re-reads `tourCompletedAt` (now null) and re-mounts the overlay.
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <h2
        className="text-[15px] font-bold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Volver a ver el tour
      </h2>
      <p
        className="mt-1 text-[13px] leading-relaxed"
        style={{ color: "var(--color-warm-500)" }}
      >
        Te llevamos otra vez por las pantallas principales del dashboard — útil
        si lo cerraste antes de tiempo o si quieres redescubrir algo que te
        perdiste.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || done}
        className="mt-3 rounded-xl border-[1.5px] bg-white px-4 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-50"
        style={{
          borderColor: "var(--color-lavender-400)",
          color: "var(--color-lavender-700)",
        }}
      >
        {pending
          ? "Reiniciando…"
          : done
            ? "Te llevamos al dashboard"
            : "Volver a ver el tour"}
      </button>
      {error ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-rose-600)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
