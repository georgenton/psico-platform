"use client";

import { useState, useTransition } from "react";
import type {
  AuthorPayoutMethod,
  AuthorPayoutSettings,
} from "@psico/types";
import { updatePayoutSettingsAction } from "./actions";

const METHODS: Array<{
  key: AuthorPayoutMethod;
  label: string;
  hint: string;
}> = [
  {
    key: "bank_ec",
    label: "Banco (Ecuador)",
    hint: "Transferencia local. Pide tipo de cuenta, número e identificación.",
  },
  {
    key: "paypal",
    label: "PayPal",
    hint: "Necesitas el email asociado a tu cuenta PayPal.",
  },
  {
    key: "payphone",
    label: "Payphone",
    hint: "Solo Ecuador. Número celular ligado a Payphone.",
  },
  {
    key: "manual",
    label: "Manual / por confirmar",
    hint: "Coordinamos con finanzas caso por caso.",
  },
];

/**
 * PayoutSettingsForm — Sprint S71.C-revenue.
 *
 * Form upsert para los datos de cobro. Mantiene un JSON `details` libre
 * por método porque cada país/proveedor pide cosas distintas. Si finanzas
 * pide un schema estricto en el futuro, evoluciona aquí.
 */
type Phase = "idle" | "saving" | "done" | "error";

export function PayoutSettingsForm({
  settings,
}: {
  settings: AuthorPayoutSettings;
}) {
  const [method, setMethod] = useState<AuthorPayoutMethod>(settings.method);
  const [detailsText, setDetailsText] = useState(
    JSON.stringify(settings.details ?? {}, null, 2),
  );
  const [taxId, setTaxId] = useState(settings.taxId ?? "");
  const [legalName, setLegalName] = useState(settings.legalName ?? "");
  const [legalAddress, setLegalAddress] = useState(settings.legalAddress ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    setPhase("saving");
    let parsed: Record<string, unknown> = {};
    if (detailsText.trim()) {
      try {
        parsed = JSON.parse(detailsText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Detalles debe ser un objeto JSON.");
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? `JSON inválido: ${e.message}`
            : "Detalles inválidos.",
        );
        setPhase("error");
        return;
      }
    }
    startTransition(() => {
      updatePayoutSettingsAction({
        method,
        details: parsed,
        taxId: taxId.trim() || undefined,
        legalName: legalName.trim() || undefined,
        legalAddress: legalAddress.trim() || undefined,
      })
        .then(() => {
          setPhase("done");
          setTimeout(() => setPhase("idle"), 2500);
        })
        .catch((e: Error) => {
          setError(e.message || "No pudimos guardar los cambios.");
          setPhase("error");
        });
    });
  }

  const current = METHODS.find((m) => m.key === method) ?? METHODS[3];

  return (
    <article
      className="space-y-4 rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <header>
        <h2
          className="text-[16px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Datos de cobro
        </h2>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Estos datos los usa finanzas para procesar tus pagos. Si cambian,
          actualízalos antes del cierre de mes.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMethod(m.key)}
            className="rounded-xl border-[1.5px] p-3 text-left transition"
            style={{
              borderColor:
                method === m.key
                  ? "var(--color-lavender-500)"
                  : "var(--color-warm-200)",
              background:
                method === m.key ? "var(--color-lavender-50)" : "white",
            }}
          >
            <p
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--color-warm-900)" }}
            >
              {m.label}
            </p>
            <p
              className="mt-1 line-clamp-3 text-[11px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {m.hint}
            </p>
          </button>
        ))}
      </div>

      <label className="block">
        <span
          className="mb-1 block text-[12px] font-medium"
          style={{ color: "var(--color-warm-700)" }}
        >
          Detalles del método ({current.label}) — JSON libre
        </span>
        <textarea
          value={detailsText}
          onChange={(e) => setDetailsText(e.target.value.slice(0, 4000))}
          rows={6}
          maxLength={4000}
          placeholder='{"email":"autor@example.com"}'
          className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 font-mono text-[12px] outline-none"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="ID fiscal (RUC, NIT, SSN, etc.)">
          <input
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value.slice(0, 60))}
            maxLength={60}
            className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13.5px] outline-none"
            style={{ borderColor: "var(--color-warm-200)" }}
          />
        </Field>
        <Field label="Nombre legal">
          <input
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value.slice(0, 200))}
            maxLength={200}
            className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13.5px] outline-none"
            style={{ borderColor: "var(--color-warm-200)" }}
          />
        </Field>
      </div>
      <Field label="Dirección legal">
        <input
          type="text"
          value={legalAddress}
          onChange={(e) => setLegalAddress(e.target.value.slice(0, 500))}
          maxLength={500}
          className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13.5px] outline-none"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </Field>

      {error ? (
        <p
          className="text-[11.5px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {phase === "done" ? (
          <span
            className="text-[12px] font-medium"
            style={{ color: "var(--color-sage-700)" }}
          >
            ✓ Guardado
          </span>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-full px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
          style={{
            background: "var(--color-lavender-500)",
            color: "white",
          }}
        >
          {pending ? "Guardando…" : "Guardar datos"}
        </button>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[12px] font-medium"
        style={{ color: "var(--color-warm-700)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
