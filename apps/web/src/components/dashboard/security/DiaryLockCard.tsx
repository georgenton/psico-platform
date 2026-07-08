"use client";

import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import { PrivacyInfoButton } from "@/components/privacy/PrivacyInfoButton";

/**
 * DiaryLockCard — Ajustes → Seguridad control for the E2E diary/Eco lock.
 *
 * Surfaces the "recordar en este dispositivo / pedir cada vez" choice that
 * otherwise only appears on the unlock gate (which a "remembered" user rarely
 * sees). Also offers an instant "Bloquear ahora" so the user can lock the
 * diary before lending their device.
 *
 * Reads/writes the DiaryKeyContext hoisted at the dashboard layout, so the
 * toggle reflects live session state. Legacy accounts (no cryptoSalt) get a
 * short inactive note instead.
 */
export function DiaryLockCard() {
  const { remember, setRemember, lock, key, isLegacyAccount } = useDiaryKey();
  const unlocked = key !== null;

  if (isLegacyAccount) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          className="text-[15px] font-bold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Bloqueo del diario y Eco
        </h2>
        <PrivacyInfoButton variant="diario" label="¿Por qué?" />
      </div>
      <p
        className="mt-1 text-[13px] leading-relaxed"
        style={{ color: "var(--color-warm-500)" }}
      >
        Tu diario y tus conversaciones con Eco se abren con{" "}
        <b style={{ color: "var(--color-warm-700)" }}>
          la misma contraseña de tu cuenta
        </b>
        . Solo tú puedes leerlos — ni nuestro equipo. Tú decides si recordamos
        la clave en este dispositivo o te la pedimos cada vez.
      </p>

      {/* Remember toggle — mirrors the unlock gate control. */}
      <label
        className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5"
        style={{ background: "var(--color-warm-50)" }}
      >
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-sage-500,#5B8A72)]"
        />
        <span className="text-[12.5px] leading-snug">
          <span
            className="font-semibold"
            style={{ color: "var(--color-warm-800)" }}
          >
            Recordar en este dispositivo
          </span>
          <span
            className="mt-0.5 block"
            style={{ color: "var(--color-warm-500)" }}
          >
            {remember
              ? "Activado: no te pediremos la contraseña la próxima vez en este equipo."
              : "Desactivado: te pediremos la contraseña cada vez que entres. Recomendado en equipos compartidos."}
          </span>
        </span>
      </label>

      {/* Lock-now — only meaningful while the session is unlocked. */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={lock}
          disabled={!unlocked}
          className="rounded-xl border-[1.5px] bg-white px-4 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-50"
          style={{
            borderColor: "var(--color-warm-300)",
            color: "var(--color-warm-700)",
          }}
        >
          🔒 Bloquear ahora
        </button>
        <span
          className="text-[12px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {unlocked
            ? "Tu diario está desbloqueado en esta sesión."
            : "Tu diario está bloqueado."}
        </span>
      </div>
    </div>
  );
}
