"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { VoiceTranscribeResponse } from "@psico/types";
import {
  formatDuration,
  MAX_RECORDING_MS,
  useRecorder,
} from "@/lib/voice/use-recorder";
import { setVoiceHandoff } from "@/lib/voice/handoff";

/**
 * VozRecorder — Sprint front-voz (web).
 *
 * Modal-ish page that walks the user through:
 *   idle → recording → uploading → transcribing → ready
 *
 * When the user clicks "Usar este texto" we stash the transcript in
 * sessionStorage and navigate back to `?return=…` (defaults to
 * `/dashboard/diario`). The destination page reads + clears the key.
 *
 * Error states the server can return:
 *   - 403 VOICE_REQUIRES_PRO  → upgrade banner
 *   - 402 VOICE_QUOTA_EXCEEDED → "ya usaste tus minutos"
 *   - 413 / 415              → "no pudimos subir el audio"
 *   - 500 / network          → generic retry
 */
export function VozRecorder({
  apiBase,
  token,
}: {
  apiBase: string;
  token: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const returnPath = params.get("return") ?? "/dashboard/diario";

  const { state: recorderState, start, stop, reset } = useRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [transcribed, setTranscribed] =
    useState<VoiceTranscribeResponse | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<{
    code: "PRO_REQUIRED" | "QUOTA_EXCEEDED" | "TOO_LARGE" | "FORMAT" | "OTHER";
    message: string;
  } | null>(null);

  async function uploadAndTranscribe(blob: Blob, mimeType: string) {
    if (!token) {
      setError({
        code: "OTHER",
        message: "Sesión expirada. Vuelve a iniciar sesión.",
      });
      return;
    }
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, fileNameFor(mimeType));
      const res = await fetch(`${apiBase}/voz/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
        };
        if (res.status === 403) {
          setError({
            code: "PRO_REQUIRED",
            message: "Voz es una función Pro. Mejora tu plan para usarla.",
          });
        } else if (res.status === 402) {
          setError({
            code: "QUOTA_EXCEEDED",
            message:
              "Ya usaste tus minutos de voz para este período. Vuelve al inicio del próximo ciclo.",
          });
        } else if (res.status === 413) {
          setError({
            code: "TOO_LARGE",
            message: "El audio es demasiado grande. Graba menos de 20 minutos.",
          });
        } else if (res.status === 415) {
          setError({
            code: "FORMAT",
            message: "Tu navegador grabó en un formato que no soportamos.",
          });
        } else {
          setError({
            code: "OTHER",
            message:
              body.message ?? "No pudimos transcribir el audio. Reintenta.",
          });
        }
        return;
      }
      const result = (await res.json()) as VoiceTranscribeResponse;
      setTranscribed(result);
      setTranscript(result.transcript);
    } catch (err) {
      setError({
        code: "OTHER",
        message:
          err instanceof Error ? err.message : "Error de red. Reintenta.",
      });
    } finally {
      setTranscribing(false);
    }
  }

  function handleUseTranscript() {
    setVoiceHandoff(transcript);
    router.push(returnPath);
  }

  function handleRetake() {
    setTranscribed(null);
    setTranscript("");
    setError(null);
    reset();
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  // 1) Error states own the whole screen (skip the recorder UI).
  if (error?.code === "PRO_REQUIRED") {
    return (
      <Pane>
        <h2
          className="text-xl font-bold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Voz es Pro
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--color-warm-600)" }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/plan")}
          className="mt-5 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--color-sage-400)" }}
        >
          Ver planes
        </button>
      </Pane>
    );
  }

  if (error?.code === "QUOTA_EXCEEDED") {
    return (
      <Pane>
        <h2
          className="text-xl font-bold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Sin minutos disponibles
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--color-warm-600)" }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => router.push(returnPath)}
          className="mt-5 rounded-2xl px-5 py-2.5 text-sm font-semibold"
          style={{
            background: "var(--color-lavender-100)",
            color: "var(--color-lavender-700)",
          }}
        >
          Volver
        </button>
      </Pane>
    );
  }

  // 2) Transcribed result — show editable transcript + CTAs.
  if (transcribed) {
    return (
      <Pane>
        <h2
          className="text-lg font-bold"
          style={{ color: "var(--color-warm-900)" }}
        >
          ¿Está bien transcrito?
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--color-warm-500)" }}>
          Puedes editarlo antes de usarlo. {transcribed.durationSec.toFixed(1)}s
          procesados · {transcribed.provider}.
        </p>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={8}
          className="mt-3 w-full rounded-2xl border-[1.5px] bg-[var(--color-warm-50)] px-4 py-3 text-[14px] leading-relaxed outline-none focus:border-[var(--color-lavender-400)]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-800)",
            resize: "vertical",
          }}
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleRetake}
            className="rounded-2xl px-5 py-2.5 text-sm font-semibold"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            Volver a grabar
          </button>
          <button
            type="button"
            onClick={handleUseTranscript}
            disabled={!transcript.trim()}
            className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-sage-400)" }}
          >
            Usar este texto →
          </button>
        </div>
      </Pane>
    );
  }

  // 3) Recorder state machine.
  return (
    <Pane>
      {recorderState.phase === "permission-denied" ? (
        <PermissionDenied onRetry={() => reset()} />
      ) : recorderState.phase === "unsupported" ? (
        <Unsupported />
      ) : recorderState.phase === "idle" ? (
        <Idle onStart={() => void start()} />
      ) : recorderState.phase === "recording" ? (
        <Recording elapsedMs={recorderState.elapsedMs} onStop={stop} />
      ) : transcribing ? (
        <Transcribing />
      ) : (
        // phase === "stopped" but not yet sent
        <Stopped
          mimeType={recorderState.mimeType}
          durationMs={recorderState.durationMs}
          onTranscribe={() =>
            void uploadAndTranscribe(recorderState.blob, recorderState.mimeType)
          }
          onRetake={handleRetake}
        />
      )}

      {error ? (
        <p
          className="mt-3 text-[12px]"
          style={{ color: "var(--color-error-text, #B91C1C)" }}
          role="alert"
        >
          {error.message}
        </p>
      ) : null}
    </Pane>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Pane({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl bg-white p-7"
      style={{
        border: "1.5px solid var(--color-warm-200)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {children}
    </div>
  );
}

function Idle({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center">
      <p
        className="text-sm leading-relaxed"
        style={{ color: "var(--color-warm-600)" }}
      >
        Toca el botón para empezar a grabar. Cuando termines, lo transcribimos y
        puedes editar el texto antes de usarlo. Tu audio{" "}
        <strong>no se almacena</strong>.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mx-auto mt-7 flex h-24 w-24 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
        style={{
          background: "var(--color-sage-400)",
          boxShadow: "var(--shadow-card)",
        }}
        aria-label="Empezar a grabar"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <p
        className="mt-4 text-[11px]"
        style={{ color: "var(--color-warm-400)" }}
      >
        Máximo {Math.round(MAX_RECORDING_MS / 60000)} minutos.
      </p>
    </div>
  );
}

function Recording({
  elapsedMs,
  onStop,
}: {
  elapsedMs: number;
  onStop: () => void;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mt-2 flex items-center justify-center gap-2">
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-pulse rounded-full"
          style={{ background: "var(--color-error-text, #B91C1C)" }}
        />
        <p
          className="text-3xl font-mono font-bold tabular-nums"
          style={{ color: "var(--color-warm-900)" }}
          aria-live="polite"
        >
          {formatDuration(elapsedMs)}
        </p>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--color-warm-500)" }}>
        Grabando…
      </p>
      <button
        type="button"
        onClick={onStop}
        className="mx-auto mt-7 flex h-20 w-20 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
        style={{
          background: "var(--color-error-text, #B91C1C)",
          boxShadow: "var(--shadow-card)",
        }}
        aria-label="Detener grabación"
      >
        <span
          className="block h-6 w-6 rounded-sm"
          style={{ background: "white" }}
        />
      </button>
    </div>
  );
}

function Stopped({
  durationMs,
  onTranscribe,
  onRetake,
}: {
  mimeType: string;
  durationMs: number;
  onTranscribe: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="text-center">
      <p className="text-sm" style={{ color: "var(--color-warm-600)" }}>
        Grabaste <strong>{formatDuration(durationMs)}</strong>. ¿Lo
        transcribimos?
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onRetake}
          className="rounded-2xl px-5 py-2.5 text-sm font-semibold"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={onTranscribe}
          className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--color-sage-400)" }}
        >
          Transcribir
        </button>
      </div>
    </div>
  );
}

function Transcribing() {
  return (
    <div className="text-center">
      <div
        aria-hidden
        className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-transparent"
        style={{
          borderTopColor: "var(--color-lavender-500)",
          borderRightColor: "var(--color-lavender-500)",
        }}
      />
      <p className="mt-4 text-sm" style={{ color: "var(--color-warm-600)" }}>
        Transcribiendo… esto toma unos segundos.
      </p>
    </div>
  );
}

function PermissionDenied({ onRetry }: { onRetry: () => void }) {
  return (
    <div>
      <h2
        className="text-lg font-bold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Necesitamos acceso al micrófono
      </h2>
      <p
        className="mt-2 text-sm leading-relaxed"
        style={{ color: "var(--color-warm-600)" }}
      >
        Tu navegador bloqueó el permiso. Abre los ajustes del sitio (el ícono de
        candado junto a la URL) y permite el micrófono. Después vuelve y
        reintenta.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-2xl px-5 py-2.5 text-sm font-semibold"
        style={{
          background: "var(--color-warm-100)",
          color: "var(--color-warm-700)",
        }}
      >
        Reintentar
      </button>
    </div>
  );
}

function Unsupported() {
  return (
    <div>
      <h2
        className="text-lg font-bold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Tu navegador no soporta grabación
      </h2>
      <p
        className="mt-2 text-sm leading-relaxed"
        style={{ color: "var(--color-warm-600)" }}
      >
        Prueba con Chrome, Edge o Safari recientes. En móvil, usa la app nativa.
      </p>
    </div>
  );
}

function fileNameFor(mime: string): string {
  if (mime.includes("webm")) return "audio.webm";
  if (mime.includes("ogg")) return "audio.ogg";
  if (mime.includes("mp4")) return "audio.mp4";
  if (mime.includes("wav")) return "audio.wav";
  if (mime.includes("mp3") || mime.includes("mpeg")) return "audio.mp3";
  return "audio.bin";
}
