"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-side cap. The backend rejects > 25 MB (Whisper-native limit). At
 * roughly 1 MB / 60s of webm-opus, 10 min keeps us comfortably under and
 * matches the design's "respuestas concisas" voice.
 */
export const MAX_RECORDING_MS = 10 * 60 * 1000;

export type RecorderState =
  | { phase: "idle" }
  | { phase: "permission-denied" }
  | { phase: "unsupported" }
  | { phase: "recording"; startedAt: number; elapsedMs: number }
  | { phase: "stopped"; blob: Blob; mimeType: string; durationMs: number };

/**
 * useRecorder — Sprint front-voz hook for the MediaRecorder API.
 *
 * Wraps mic permission + MediaRecorder lifecycle behind a tiny state
 * machine the page can render against. We deliberately KEEP it minimal —
 * no waveform RMS sampling, no pause/resume. v1 ships a single-take flow;
 * if a user is unhappy they hit "retake" and re-record. The design's
 * waveform + pause are nice-to-haves but add ~200 LOC; v2.
 *
 * MIME selection: Chrome → audio/webm, Safari → audio/mp4, Firefox →
 * audio/ogg. The server accepts all three via the FileInterceptor allowlist.
 * We let MediaRecorder pick the default to avoid forcing a codec that
 * isn't supported on a given browser.
 */
export function useRecorder(): {
  state: RecorderState;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<RecorderState>({ phase: "idle" });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  // Tick every 250ms while recording so the timer UI stays fresh without
  // updating React state at 60fps.
  useEffect(() => {
    if (state.phase !== "recording") return;
    tickRef.current = window.setInterval(() => {
      setState((s) =>
        s.phase === "recording"
          ? { ...s, elapsedMs: Date.now() - startTimeRef.current }
          : s,
      );
    }, 250);
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, [state.phase]);

  // Hard cap at MAX_RECORDING_MS — if the user forgets to stop, we stop
  // for them and surface the stopped state.
  useEffect(() => {
    if (state.phase !== "recording") return;
    if (state.elapsedMs >= MAX_RECORDING_MS) {
      mediaRecorderRef.current?.state === "recording" &&
        mediaRecorderRef.current.stop();
    }
  }, [state]);

  const start = useCallback(async () => {
    if (typeof window === "undefined" || !window.MediaRecorder) {
      setState({ phase: "unsupported" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const durationMs = Date.now() - startTimeRef.current;
        // Release the mic immediately so the browser indicator clears.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setState({ phase: "stopped", blob, mimeType, durationMs });
      };
      startTimeRef.current = Date.now();
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState({
        phase: "recording",
        startedAt: startTimeRef.current,
        elapsedMs: 0,
      });
    } catch (err) {
      // getUserMedia rejects with NotAllowedError when the user denies, or
      // NotFoundError when there's no mic. Both land at "permission-denied"
      // because the UX is the same: ask the user to check browser settings.
      const name = err instanceof Error ? err.name : "";
      setState({
        phase:
          name === "NotAllowedError" || name === "NotFoundError"
            ? "permission-denied"
            : "unsupported",
      });
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    setState({ phase: "idle" });
  }, []);

  return { state, start, stop, reset };
}

/** Formats milliseconds as `M:SS` for the timer UI. */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
