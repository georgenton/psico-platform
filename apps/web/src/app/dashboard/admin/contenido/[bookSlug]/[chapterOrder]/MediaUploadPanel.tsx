"use client";

import { useRef, useState } from "react";

import { AUDIO_ACCEPT, AUDIO_MAX_BYTES } from "../../contracts";
import type { ActionOutcome } from "../../actions";
import type { MediaUploadResult } from "../../contracts";

/**
 * Choosing an audio master and sending it.
 *
 * The upload STAGES; it never publishes. That is the one thing an editor could
 * reasonably get wrong here — a file finishing its upload looks like it went
 * live — so the panel says what actually happened rather than just "listo".
 *
 * Client-side size and type checks exist only to spare the editor a 50 MB
 * round-trip that was always going to be refused. The server is the authority,
 * and its errors are what get shown when the two disagree.
 */

/** Domain codes → copy an editor can act on. Anything else stays generic. */
const ERROR_COPY: Record<string, string> = {
  FILE_TOO_LARGE: "El archivo supera los 50 MB.",
  INVALID_AUDIO_TYPE: "Ese formato no se admite. Usa MP3 o M4A.",
  FILE_EMPTY: "El archivo está vacío.",
  FILE_REQUIRED: "Elige un archivo antes de subir.",
  AUDIO_DURATION_REQUIRED: "Indica la duración real del audio, en segundos.",
  EPISODE_METADATA_REQUIRED: "Un episodio nuevo necesita título y descripción.",
  AUDIOBOOK_LEGACY_MASTER_REQUIRES_MIGRATION:
    "Esta versión antigua necesita migrarse antes de poder reemplazar su archivo desde Contenido.",
  MEDIA_VERSION_ALREADY_EXISTS:
    "Ya existe una versión con esa identidad. Recarga y vuelve a intentarlo.",
};

export function mediaErrorCopy(outcome: {
  code?: string;
  error?: string;
}): string {
  if (outcome.code && ERROR_COPY[outcome.code])
    return ERROR_COPY[outcome.code]!;
  // Never the raw provider message: it can carry storage vocabulary the editor
  // cannot act on and should not see.
  return outcome.error && !/r2|s3|bucket|objectKey|signed/i.test(outcome.error)
    ? outcome.error
    : "No pudimos completar la operación. Inténtalo de nuevo.";
}

interface Props {
  /** Distinguishes this control from every other upload on the page. */
  label: string;
  submitLabel: string;
  /** Extra fields the route needs — title/description for a new episode. */
  extraFields?: React.ReactNode;
  onUpload: (form: FormData) => Promise<ActionOutcome<MediaUploadResult>>;
  onUploaded: () => Promise<void>;
  onCancel?: () => void;
}

export function MediaUploadPanel({
  label,
  submitLabel,
  extraFields,
  onUpload,
  onUploaded,
  onCancel,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooBig = file !== null && file.size > AUDIO_MAX_BYTES;

  async function submit() {
    if (!file) return;
    if (tooBig) {
      setError(ERROR_COPY.FILE_TOO_LARGE!);
      return;
    }
    setBusy(true);
    setError(null);

    const form = new FormData(formRef.current ?? undefined);
    form.set("file", file);
    form.set("durationSec", durationSec.trim());

    const result = await onUpload(form);
    setBusy(false);
    if (!result.ok) {
      setError(mediaErrorCopy(result));
      return;
    }
    setFile(null);
    setDurationSec("");
    await onUploaded();
  }

  const ready = file !== null && !tooBig && durationSec.trim() !== "";

  return (
    <form
      ref={formRef}
      className="mt-3 space-y-2 border-t pt-3"
      style={{ borderColor: "var(--color-warm-200)" }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {extraFields}

      <label className="block">
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          Archivo de audio
        </span>
        <input
          type="file"
          accept={AUDIO_ACCEPT}
          aria-label={label}
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
          className="mt-1 block w-full text-[13px]"
        />
        <span
          className="mt-1 block text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          MP3 o M4A · máximo 50 MB
        </span>
      </label>

      {tooBig && (
        <p role="alert" className="text-[13px] text-red-700">
          {ERROR_COPY.FILE_TOO_LARGE}
        </p>
      )}

      <label className="block max-w-[240px]">
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          Duración (segundos)
        </span>
        <input
          value={durationSec}
          onChange={(e) => setDurationSec(e.target.value)}
          inputMode="numeric"
          aria-label={`Duración de ${label}`}
          disabled={busy}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </label>

      <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
        {/* The thing most worth saying: finishing an upload is not going live. */}
        El archivo queda como borrador. Los lectores seguirán escuchando la
        versión publicada hasta que publiques esta.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !ready}
          className="rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-lavender-600)" }}
        >
          {busy ? "Subiendo…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-warm-600)" }}
          >
            Cancelar
          </button>
        )}
        {error && (
          <span role="alert" className="text-[13px] text-red-700">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
