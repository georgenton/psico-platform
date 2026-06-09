"use client";

import { useState } from "react";
import type { UserMeResponse } from "@psico/types";

import { updateProfileAction } from "@/actions/profile";

export function EditProfileCard({ me }: { me: UserMeResponse }) {
  const [firstName, setFirstName] = useState(me.user.firstName ?? "");
  const [city, setCity] = useState(me.user.city ?? "");
  const [country, setCountry] = useState(me.user.country ?? "");
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    firstName !== (me.user.firstName ?? "") ||
    city !== (me.user.city ?? "") ||
    country !== (me.user.country ?? "");

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updateProfileAction({
        firstName: firstName.trim() || undefined,
        city: city.trim() || null,
        country: country.trim() || null,
      });
      setFlash("Datos guardados");
      setTimeout(() => setFlash(null), 3000);
    } catch {
      setError("No pudimos guardar. Reintenta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
      data-testid="edit-profile-card"
    >
      <h2
        className="text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Tus datos
      </h2>
      <p
        className="mt-0.5 text-[12px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Solo el nombre se muestra a Eco; ciudad y país nos ayudan a recomendar
        contenido relevante.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label="Nombre"
          value={firstName}
          onChange={setFirstName}
          placeholder="Tu nombre"
          disabled={pending}
        />
        <Field
          label="Ciudad"
          value={city}
          onChange={setCity}
          placeholder="Quito"
          disabled={pending}
        />
        <Field
          label="País (ISO 2)"
          value={country}
          onChange={(v) => setCountry(v.toUpperCase().slice(0, 2))}
          placeholder="EC"
          disabled={pending}
        />
      </div>

      {flash ? (
        <p
          className="mt-3 text-[12px]"
          style={{ color: "var(--color-sage-700)" }}
          role="status"
        >
          {flash}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-3 text-[12px]"
          style={{ color: "var(--color-rose-600)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-xl px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          style={{ background: "var(--color-lavender-600)" }}
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[12px] font-medium"
        style={{ color: "var(--color-warm-700)" }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13px] focus:outline-none disabled:opacity-60"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-900)",
        }}
      />
    </label>
  );
}
