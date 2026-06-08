"use client";

import { useMemo, useState } from "react";
import { setTimezoneActionStrict } from "@/actions/timezone";

/**
 * TimezoneCard — Sprint S54 (web).
 *
 * Settings UI complement to S53's invisible auto-detect probe. The user
 * can:
 *   1. See the timezone currently stored on their account.
 *   2. See the timezone their browser reports right now (useful when
 *      traveling — these might disagree).
 *   3. Manually pick a new timezone from a dropdown.
 *   4. Reset to "use my device's current timezone".
 *
 * The dropdown sources `Intl.supportedValuesOf("timeZone")` when the
 * browser supports it (Chrome 99+, Firefox 93+, Safari 15.4+). Older
 * engines fall back to a hardcoded list of common LATAM/EU/Asia tzs —
 * still enough coverage for v1.
 *
 * The component is intentionally narrow: no save button, no flash of
 * "saved" toast — toggling the dropdown submits immediately (consistent
 * with the rest of NotificationsForm), and the page revalidates on the
 * way back from the server action.
 */

const FALLBACK_TIMEZONES = [
  "UTC",
  "America/Guayaquil",
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/Buenos_Aires",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Caracas",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

function listAllTimezones(): string[] {
  try {
    const intlExt = Intl as unknown as {
      supportedValuesOf?: (key: "timeZone") => string[];
    };
    if (typeof intlExt.supportedValuesOf === "function") {
      return intlExt.supportedValuesOf("timeZone");
    }
  } catch {
    // fall through
  }
  return FALLBACK_TIMEZONES;
}

function detectBrowserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

export function TimezoneCard({
  currentTimezone,
}: {
  currentTimezone: string | null;
}) {
  const [storedTz, setStoredTz] = useState<string | null>(currentTimezone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const browserTz = useMemo(detectBrowserTimezone, []);
  const options = useMemo(() => {
    const all = listAllTimezones();
    return Array.from(new Set(all)).sort();
  }, []);

  async function commit(next: string) {
    setError(null);
    setPending(true);
    try {
      await setTimezoneActionStrict(next);
      setStoredTz(next);
      setSavedFlash("Zona horaria guardada");
      setTimeout(() => setSavedFlash(null), 3000);
    } catch {
      setError("No pudimos guardar el cambio. Reintenta.");
    } finally {
      setPending(false);
    }
  }

  const browserMismatch =
    storedTz !== null && browserTz !== null && storedTz !== browserTz;

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
      data-testid="timezone-card"
    >
      <header className="mb-3">
        <h2
          className="text-[15px] font-semibold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Zona horaria
        </h2>
        <p
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Usamos esta zona para enviarte el digest semanal y los recordatorios a
          tu hora local.
        </p>
      </header>

      <dl className="mb-3 grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt style={{ color: "var(--color-warm-500)" }}>En tu cuenta</dt>
          <dd
            className="font-medium"
            style={{ color: "var(--color-warm-900)" }}
            data-testid="stored-tz"
          >
            {storedTz ?? "No configurada (UTC)"}
          </dd>
        </div>
        <div>
          <dt style={{ color: "var(--color-warm-500)" }}>Tu dispositivo</dt>
          <dd
            className="font-medium"
            style={{ color: "var(--color-warm-900)" }}
            data-testid="browser-tz"
          >
            {browserTz ?? "Desconocida"}
          </dd>
        </div>
      </dl>

      {browserMismatch ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => browserTz && commit(browserTz)}
          className="mb-3 inline-flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-50"
          style={{
            borderColor: "var(--color-sage-400)",
            color: "var(--color-sage-700)",
          }}
          data-testid="use-device-tz"
        >
          Usar la de mi dispositivo ({browserTz})
        </button>
      ) : null}

      <label
        className="block text-[12px] font-medium"
        style={{ color: "var(--color-warm-700)" }}
      >
        Elegir manualmente
      </label>
      <select
        value={storedTz ?? "UTC"}
        disabled={pending}
        onChange={(e) => commit(e.currentTarget.value)}
        className="mt-1 w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13px] focus:outline-none"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-900)",
        }}
        data-testid="tz-select"
      >
        {options.includes(storedTz ?? "UTC") ? null : (
          <option value={storedTz ?? "UTC"}>{storedTz ?? "UTC"}</option>
        )}
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>

      {savedFlash ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-sage-700)" }}
          role="status"
        >
          {savedFlash}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-rose-600)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
