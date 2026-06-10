"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { joinSessionAction } from "@/actions/terapia";

type Status =
  | "idle"
  | "requesting-token"
  | "loading-sdk"
  | "joining"
  | "in-call"
  | "ended"
  | "error";

interface Props {
  sessionId: string;
  backHref: string;
}

/**
 * VideoRoom — embed Daily.co iframe inside the dashboard.
 *
 * Flow:
 *   1. Calls /sessions/:id/join to get a room URL (+ optional join token).
 *   2. Dynamically imports @daily-co/daily-js to keep the initial bundle thin.
 *   3. Creates a Daily iframe inside the container ref, joins, listens for end.
 *
 * Demo branch: if the room URL is a stub (`fake-room://…` from
 * ConsoleVideoProvider) we render a static "demo room" card instead. This
 * lets the entire UI flow be tested end-to-end before Daily.co is wired in
 * production.
 */
export function VideoRoom({ sessionId, backHref }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // callObject holds the Daily call instance once created.
  const callObjectRef = useRef<unknown>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 1. Request the room URL.
  useEffect(() => {
    if (status !== "idle") return;
    setStatus("requesting-token");
    joinSessionAction(sessionId)
      .then((res) => {
        if (res.error) {
          setError(res.error);
          setStatus("error");
          return;
        }
        if (!res.joinUrl) {
          setError("No pudimos obtener la sala. Reintenta.");
          setStatus("error");
          return;
        }
        setRoomUrl(res.joinUrl);
        setStatus("loading-sdk");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error desconocido");
        setStatus("error");
      });
  }, [sessionId, status]);

  // 2. Once we have a real (https) room URL, load Daily and join.
  useEffect(() => {
    if (status !== "loading-sdk" || !roomUrl) return;
    if (!roomUrl.startsWith("https://")) {
      // Stub provider — go straight to "in-call" demo state.
      setStatus("in-call");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const Daily = (await import("@daily-co/daily-js")).default;
        if (cancelled) return;
        if (!containerRef.current) {
          setError("Container no disponible.");
          setStatus("error");
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const frame = (Daily as any).createFrame(containerRef.current, {
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "16px",
          },
          showLeaveButton: true,
          showFullscreenButton: true,
        });
        callObjectRef.current = frame;
        frame.on("left-meeting", () => {
          setStatus("ended");
        });
        frame.on("error", (event: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = event as any;
          setError(e?.errorMsg ?? "Error en la sala.");
          setStatus("error");
        });
        setStatus("joining");
        await frame.join({ url: roomUrl });
        if (cancelled) {
          await frame.leave();
          return;
        }
        setStatus("in-call");
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "No pudimos cargar la sala.",
        );
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      const obj = callObjectRef.current as
        | { leave?: () => Promise<unknown>; destroy?: () => void }
        | null;
      if (obj) {
        obj.leave?.().catch(() => {});
        obj.destroy?.();
        callObjectRef.current = null;
      }
    };
  }, [status, roomUrl]);

  function handleLeave() {
    startTransition(() => {
      const obj = callObjectRef.current as
        | { leave?: () => Promise<unknown>; destroy?: () => void }
        | null;
      if (obj) {
        obj.leave?.().catch(() => {});
        obj.destroy?.();
        callObjectRef.current = null;
      }
      setStatus("ended");
    });
  }

  function handleFinish() {
    router.push(backHref);
  }

  // Stub demo branch: shown when roomUrl is `fake-room://…`.
  const isStub = roomUrl !== null && !roomUrl.startsWith("https://");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="text-[13px]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Volver al detalle
        </Link>
        {status === "in-call" && !isStub ? (
          <button
            type="button"
            onClick={handleLeave}
            disabled={pending}
            className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium"
            style={{
              borderColor: "var(--color-rose-300)",
              color: "var(--color-rose-700)",
            }}
          >
            Salir de la sala
          </button>
        ) : null}
      </div>

      {/* Iframe container — visible only when Daily is mounted */}
      <div
        ref={containerRef}
        className="rounded-2xl bg-black"
        style={{
          height: isStub || status === "error" || status === "ended" ? 0 : "70vh",
          minHeight:
            isStub || status === "error" || status === "ended" ? 0 : "480px",
          overflow: "hidden",
        }}
      />

      {/* Status states */}
      {status === "idle" || status === "requesting-token" ? (
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-700)",
          }}
        >
          Conectando a la sala…
        </p>
      ) : null}

      {status === "loading-sdk" || status === "joining" ? (
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-700)",
          }}
        >
          Cargando video…
        </p>
      ) : null}

      {isStub && status === "in-call" ? (
        <div
          className="rounded-2xl border-[1.5px] bg-white p-6 text-center"
          style={{ borderColor: "var(--color-lavender-200)" }}
        >
          <p
            className="text-[18px] font-semibold"
            style={{ color: "var(--color-lavender-700)" }}
          >
            🎥 Sala demo
          </p>
          <p
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: "var(--color-warm-700)" }}
          >
            Estás en modo demo. El proveedor de video aún no está configurado
            en producción. Cuando se conecte Daily.co, esta sala mostrará tu
            cámara y la de tu terapeuta.
          </p>
          <p
            className="mt-3 text-[11px] font-mono"
            style={{ color: "var(--color-warm-500)" }}
          >
            {roomUrl}
          </p>
          <button
            type="button"
            onClick={handleFinish}
            className="mt-5 rounded-xl px-4 py-2 text-[13px] font-medium text-white"
            style={{ background: "var(--color-lavender-600)" }}
          >
            Terminar sesión demo
          </button>
        </div>
      ) : null}

      {status === "ended" ? (
        <div
          className="rounded-2xl border-[1.5px] bg-white p-6 text-center"
          style={{ borderColor: "var(--color-sage-200)" }}
        >
          <p
            className="text-[16px] font-semibold"
            style={{ color: "var(--color-sage-700)" }}
          >
            ✓ Sesión finalizada
          </p>
          <p
            className="mt-2 text-[13px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            Cuando regreses al detalle de la sesión podrás dejar tu feedback.
          </p>
          <button
            type="button"
            onClick={handleFinish}
            className="mt-5 rounded-xl px-4 py-2 text-[13px] font-medium text-white"
            style={{ background: "var(--color-lavender-600)" }}
          >
            Ir al detalle →
          </button>
        </div>
      ) : null}

      {status === "error" ? (
        <div
          className="rounded-2xl border-[1.5px] bg-white p-6 text-center"
          style={{ borderColor: "var(--color-rose-200)" }}
        >
          <p
            className="text-[16px] font-semibold"
            style={{ color: "var(--color-rose-700)" }}
          >
            No pudimos abrir la sala
          </p>
          <p
            className="mt-2 text-[12px]"
            style={{ color: "var(--color-rose-700)" }}
          >
            {error}
          </p>
          <Link
            href={backHref}
            className="mt-5 inline-block rounded-xl border-[1.5px] bg-white px-4 py-2 text-[13px] font-medium"
            style={{
              borderColor: "var(--color-warm-300)",
              color: "var(--color-warm-700)",
            }}
          >
            ← Volver
          </Link>
        </div>
      ) : null}
    </div>
  );
}
