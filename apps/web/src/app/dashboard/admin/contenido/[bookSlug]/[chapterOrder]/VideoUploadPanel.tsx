"use client";

import { useEffect, useRef, useState } from "react";

import { VIDEO_ACCEPT, VIDEO_MAX_BYTES } from "../../contracts";
import type { VideoUploadState } from "../../contracts";
import {
  createVideoUploadIntentAction,
  videoUploadStatusAction,
} from "../../actions";
import { mediaErrorCopy } from "./MediaUploadPanel";

/**
 * Sending a chapter video, which is the one upload that does not go through our
 * server.
 *
 * The editor sees a single act — "pick a file, wait, it's ready" — but three
 * things happen: the API allocates a destination, the browser transfers the
 * bytes to the provider, and the API confirms the file arrived. The panel keeps
 * that one act on screen and only distinguishes the phases where the difference
 * changes what the editor should do:
 *
 *   - transferring   → a percentage, because it is long and they should not
 *                      close the tab;
 *   - processing     → indeterminate, because the provider gives no progress and
 *                      inventing one would be a lie;
 *   - ready          → it can be published, and the wording says only that.
 *
 * The transfer uses XMLHttpRequest rather than `fetch`. `fetch` has no upload
 * progress event, and for a file this size a control with no progress is
 * indistinguishable from one that has frozen.
 */

type Phase =
  | { name: "idle" }
  | { name: "preparing" }
  | { name: "transferring"; percent: number }
  | { name: "processing" }
  | { name: "ready" }
  | { name: "failed"; message: string };

const POLL_INTERVAL_MS = 3000;
/** Roughly five minutes. Encoding a chapter video takes a fraction of that. */
const MAX_POLLS = 100;

interface Props {
  bookSlug: string;
  chapterOrder: number;
  /** Present when replacing an existing video; absent when adding a new one. */
  mediaKey?: string;
  submitLabel: string;
  onUploaded: () => Promise<void>;
  onCancel?: () => void;
}

export function VideoUploadPanel({
  bookSlug,
  chapterOrder,
  mediaKey,
  submitLabel,
  onUploaded,
  onCancel,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  // Polling and the transfer both outlive a render, so they are cancelled on
  // unmount rather than left writing into a component that is gone.
  const cancelled = useRef(false);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const tooBig = file !== null && file.size > VIDEO_MAX_BYTES;
  const needsMetadata = mediaKey === undefined;
  const ready =
    file !== null &&
    !tooBig &&
    (!needsMetadata || (title.trim() !== "" && description.trim() !== ""));
  const busy =
    phase.name === "preparing" ||
    phase.name === "transferring" ||
    phase.name === "processing";

  async function submit() {
    if (!file || tooBig) return;
    setPhase({ name: "preparing" });

    const intent = await createVideoUploadIntentAction(bookSlug, chapterOrder, {
      mediaKey,
      title: needsMetadata ? title.trim() : undefined,
      description: needsMetadata ? description.trim() : undefined,
    });
    if (!intent.ok || !intent.data) {
      setPhase({ name: "failed", message: mediaErrorCopy(intent) });
      return;
    }
    const { uploadUrl, draftId } = intent.data;

    try {
      await transfer(uploadUrl, file, (percent) => {
        if (!cancelled.current) setPhase({ name: "transferring", percent });
      });
    } catch {
      // Deliberately generic: the provider's own error text is about their
      // transport, not about anything the editor can act on.
      setPhase({
        name: "failed",
        message:
          "No pudimos enviar el archivo. Revisa tu conexión y reinténtalo.",
      });
      return;
    }

    if (cancelled.current) return;
    setPhase({ name: "processing" });
    await poll(draftId);
  }

  async function poll(draftId: string) {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      if (cancelled.current) return;
      const status = await videoUploadStatusAction(
        draftId,
        bookSlug,
        chapterOrder,
      );
      if (cancelled.current) return;

      if (!status.ok || !status.data) {
        setPhase({ name: "failed", message: mediaErrorCopy(status) });
        return;
      }
      const state = status.data.state as VideoUploadState;

      if (state === "READY") {
        setPhase({ name: "ready" });
        await onUploaded();
        return;
      }
      if (state === "ERROR") {
        setPhase({
          name: "failed",
          message:
            "El proveedor no pudo procesar ese archivo. Prueba con otro formato o vuelve a exportarlo.",
        });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Not a failure of the upload — the file may still be encoding. Saying so is
    // more useful than a spinner that never stops.
    setPhase({
      name: "failed",
      message:
        "El video sigue procesándose. Vuelve a esta pantalla en unos minutos para publicarlo.",
    });
  }

  return (
    <form
      className="mt-3 space-y-2 border-t pt-3"
      style={{ borderColor: "var(--color-warm-200)" }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {needsMetadata && (
        <>
          <label className="block">
            <span
              className="text-[11.5px] font-semibold"
              style={{ color: "var(--color-warm-600)" }}
            >
              Título del video
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Título del video"
              disabled={busy}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px]"
              style={{ borderColor: "var(--color-warm-200)" }}
            />
          </label>
          <label className="block">
            <span
              className="text-[11.5px] font-semibold"
              style={{ color: "var(--color-warm-600)" }}
            >
              Descripción
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Descripción del video"
              disabled={busy}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px]"
              style={{ borderColor: "var(--color-warm-200)" }}
            />
          </label>
        </>
      )}

      <label className="block">
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          Archivo de video
        </span>
        <input
          type="file"
          accept={VIDEO_ACCEPT}
          aria-label="Archivo de video"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPhase({ name: "idle" });
          }}
          className="mt-1 block w-full text-[13px]"
        />
        <span
          className="mt-1 block text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          MP4, MOV o WebM · la duración la mide el proveedor
        </span>
      </label>

      {tooBig && (
        <p role="alert" className="text-[13px] text-red-700">
          El archivo supera los 2 GB.
        </p>
      )}

      <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
        {/* The thing most worth saying: finishing an upload is not going live. */}
        El video queda como borrador. Los lectores no lo verán hasta que lo
        publiques.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !ready}
          className="rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-lavender-600)" }}
        >
          {phase.name === "preparing"
            ? "Preparando…"
            : phase.name === "transferring"
              ? `Enviando… ${phase.percent}%`
              : phase.name === "processing"
                ? "Procesando…"
                : submitLabel}
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
        {phase.name === "ready" && (
          <span
            role="status"
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-sage-600)" }}
          >
            Listo para publicar.
          </span>
        )}
        {phase.name === "failed" && (
          <span role="alert" className="text-[13px] text-red-700">
            {phase.message}
          </span>
        )}
      </div>

      {phase.name === "processing" && (
        <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
          {/* No percentage here on purpose: the provider reports none, and a
              fabricated bar is worse than an honest wait. */}
          El archivo llegó y se está procesando. Puedes dejar esta pestaña
          abierta.
        </p>
      )}
    </form>
  );
}

/**
 * Send the bytes straight to the provider, reporting progress.
 *
 * No credentials are attached: the URL is single-use and already authorizes
 * exactly one upload to exactly one allocated video.
 */
function transfer(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`status_${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("network")));
    xhr.addEventListener("abort", () => reject(new Error("aborted")));
    xhr.send(form);
  });
}
