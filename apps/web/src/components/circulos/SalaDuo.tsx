"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CircleActivityView,
  CirclePreparationField,
  CircleShareConfirmation,
  CircleSharingMode,
} from "@psico/types";

import { estilos as S } from "./estilos";
import { usePollingActividad } from "./usePollingActividad";
import { PreparacionPrivada } from "./PreparacionPrivada";
import { PreviewCompartir } from "./PreviewCompartir";
import { Reveal } from "./Reveal";
import { Artefacto } from "./Artefacto";
import { Seguimiento } from "./Seguimiento";

/**
 * One room, one server view, several faces.
 *
 * Which stage a person sees is derived entirely from `CircleActivityView` —
 * the same object the API filtered for them — and never from local belief about
 * what "should" come next. That matters at the reveal: the room shows the other
 * person's words when, and only when, the server put them in the payload. There
 * is no client-side gate deciding whether to render something it already holds,
 * because it never holds it early.
 *
 * The stages: consent → private preparation → exact preview → wait → reveal and
 * turns → shared artifact → confirmation → follow-up → a way out that is always
 * on screen.
 */

export interface SalaDuoProps {
  readonly activityId: string;
  readonly initialView: CircleActivityView | null;
  readonly initialError: string | null;
  /** From the pinned template. Copy the person may need; never their answers. */
  readonly fields: readonly CirclePreparationField[];
  readonly allowedModes: readonly CircleSharingMode[];
  readonly isGuest: boolean;
}

type Local =
  | { stage: "consent" }
  | { stage: "prepare" }
  | { stage: "preview"; confirmation: CircleShareConfirmation }
  | { stage: "left" };

export function SalaDuo({
  activityId,
  initialView,
  initialError,
  fields,
  allowedModes,
  isGuest,
}: SalaDuoProps) {
  const router = useRouter();
  const { view, error, loading, refresh } = usePollingActividad(
    activityId,
    initialView,
  );
  const [local, setLocal] = useState<Local>({ stage: "consent" });
  const [busy, setBusy] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const previousStage = useRef<string>("");

  const command = useCallback(
    async (kind: string, payload?: unknown): Promise<boolean> => {
      setBusy(true);
      setCommandError(null);
      try {
        const res = await fetch(
          `/api/circulos/actividad/${encodeURIComponent(activityId)}/comando`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, payload }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            code?: unknown;
          } | null;
          setCommandError(
            typeof body?.code === "string" ? body.code : "CIRCLE_UNAVAILABLE",
          );
          return false;
        }
        refresh();
        return true;
      } catch {
        setCommandError("CIRCLE_UNAVAILABLE");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activityId, refresh],
  );

  const leave = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/circulos/sesion", { method: "DELETE" });
    } catch {
      // The cookie may survive a failed request; the next command still fails
      // closed upstream. Nothing to tell the person here.
    } finally {
      setBusy(false);
      setLocal({ stage: "left" });
      if (!isGuest) router.replace("/dashboard/circulos");
    }
  }, [isGuest, router]);

  const stageName = view ? derivedStage(view, local) : "loading";

  // Move focus to the heading whenever the stage changes, so somebody on a
  // keyboard or a screen reader lands on the new content instead of being left
  // where a now-removed button used to be.
  useEffect(() => {
    if (stageName !== previousStage.current && previousStage.current !== "") {
      headingRef.current?.focus();
    }
    previousStage.current = stageName;
  }, [stageName]);

  if (local.stage === "left") {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Saliste de esta actividad</h1>
        <p style={S.p}>
          Ya no tienes acceso a esta sala en este dispositivo. Lo que escribiste
          en privado nunca salió de tu pantalla.
        </p>
        <a href="/" style={S.secondary}>
          Ir al inicio
        </a>
      </main>
    );
  }

  // An error the SERVER already resolved is an answer, not a pending state.
  // Showing "opening…" on top of it would leave somebody watching a spinner
  // for a room that has already refused them.
  if (!view && loading && !initialError) {
    return (
      <main style={S.page}>
        <p role="status" aria-live="polite" style={S.p}>
          Abriendo la sala…
        </p>
      </main>
    );
  }

  if (!view) {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>No pudimos abrir esta sala</h1>
        <p role="alert" style={S.error}>
          {mensaje(initialError ?? error)}
        </p>
        <a href="/" style={S.secondary}>
          Ir al inicio
        </a>
      </main>
    );
  }

  return (
    <main style={S.page}>
      <header>
        <h1 style={S.h1} tabIndex={-1} ref={headingRef}>
          {view.title}
        </h1>
        <p style={S.p}>{view.summary}</p>
      </header>

      {/* Every asynchronous change the person is waiting on is announced. */}
      <p aria-live="polite" style={visuallyHidden}>
        {anuncio(view, stageName)}
      </p>

      {commandError && (
        <p role="alert" style={S.error}>
          {mensaje(commandError)}
        </p>
      )}
      {error && !commandError && (
        <p role="status" style={S.error}>
          {mensaje(error)}
        </p>
      )}

      {stageName === "consent" && (
        <section style={S.section} aria-labelledby="cons-h">
          <h2 id="cons-h" style={S.h2}>
            Antes de empezar
          </h2>
          <p style={S.p}>
            Vas a prepararte por tu cuenta y después decidir qué compartir.
            Nadie ve nada tuyo hasta que tú lo confirmes, y puedes elegir no
            compartir nada o salir en cualquier momento.
          </p>
          <p style={S.p}>Toma unos {estimado(view)} minutos.</p>
          <div style={S.acciones}>
            <button
              type="button"
              style={S.primary}
              onClick={() => setLocal({ stage: "prepare" })}
            >
              Entiendo, empezar
            </button>
            <button
              type="button"
              style={S.quiet}
              onClick={leave}
              disabled={busy}
            >
              Ahora no
            </button>
          </div>
        </section>
      )}

      {stageName === "prepare" && (
        <PreparacionPrivada
          fields={fields}
          allowedModes={allowedModes}
          busy={busy}
          onPreview={(confirmation) =>
            setLocal({ stage: "preview", confirmation })
          }
          onWithdraw={async () => {
            if (await command("withdraw")) await leave();
          }}
        />
      )}

      {stageName === "preview" && local.stage === "preview" && (
        <PreviewCompartir
          confirmation={local.confirmation}
          fields={fields}
          busy={busy}
          onBack={() => setLocal({ stage: "prepare" })}
          onConfirm={async () => {
            if (await command("share", local.confirmation)) {
              setLocal({ stage: "prepare" });
            }
          }}
        />
      )}

      {stageName === "waiting" && (
        <section style={S.section} aria-labelledby="wait-h">
          <h2 id="wait-h" style={S.h2}>
            Listo. Falta la otra persona.
          </h2>
          <p style={S.p}>
            Ya confirmamos lo tuyo. Cuando la otra persona confirme lo suyo, se
            abren los dos a la vez — ni antes, ni sólo uno.
          </p>
          <p style={S.p}>
            Puedes cerrar esta página y volver con el mismo enlace.
          </p>
          <div style={S.acciones}>
            <button
              type="button"
              style={S.quiet}
              onClick={leave}
              disabled={busy}
            >
              Salir
            </button>
          </div>
        </section>
      )}

      {stageName === "revealed" && view.revealed && (
        <>
          <Reveal view={view} />
          <Artefacto
            view={view}
            busy={busy}
            onPropose={(body) => command("artifact", { body })}
            onConfirm={(artifactId, version) =>
              command("artifact-confirm", { artifactId, version })
            }
          />
        </>
      )}

      {stageName === "follow-up" && (
        <Seguimiento
          view={view}
          busy={busy}
          onDecide={(decision) => command("follow-up", { decision })}
        />
      )}

      {stageName === "closed" && (
        <section style={S.section} aria-labelledby="fin-h">
          <h2 id="fin-h" style={S.h2}>
            Esta actividad terminó
          </h2>
          <p style={S.p}>
            Gracias por el rato. Lo que compartieron queda entre ustedes.
          </p>
        </section>
      )}

      {stageName !== "consent" && stageName !== "closed" && (
        <div style={S.acciones}>
          <button type="button" style={S.quiet} onClick={leave} disabled={busy}>
            Salir de la sala
          </button>
        </div>
      )}
    </main>
  );
}

/**
 * The stage, decided from the server's view first and local intent second.
 *
 * Local state may only move somebody FORWARD through the private part of the
 * flow (consent → prepare → preview), which is the part the server has no
 * opinion about because nothing has been sent yet. Everything from "waiting"
 * onwards is read off the view.
 */
function derivedStage(view: CircleActivityView, local: Local): string {
  if (view.status === "CLOSED" || view.status === "CANCELLED") return "closed";
  if (view.you.status === "WITHDRAWN" || view.you.status === "DECLINED") {
    return "closed";
  }
  if (view.status === "FOLLOW_UP") return "follow-up";
  if (view.status === "REVEALED") return "revealed";
  if (view.you.status === "READY") return "waiting";
  if (local.stage === "preview") return "preview";
  if (local.stage === "prepare") return "prepare";
  return "consent";
}

function anuncio(view: CircleActivityView, stage: string): string {
  switch (stage) {
    case "waiting":
      return "Tu parte está confirmada. Esperando a la otra persona.";
    case "revealed":
      return "Las dos partes están listas. Ya puedes leer lo que compartió la otra persona.";
    case "follow-up":
      return "Es momento de decidir cómo siguen.";
    case "closed":
      return "La actividad terminó.";
    default:
      return `${view.readyCount} de ${view.requiredParticipants} listas.`;
  }
}

function estimado(view: CircleActivityView): number {
  // The view does not carry the estimate; the turns are a fair proxy and this
  // is copy, not a promise.
  return Math.max(10, view.conversationTurns.length * 5);
}

/**
 * Opaque, human wording for an opaque code.
 *
 * The API answers with one code for many causes on purpose — "expired", "used",
 * "revoked" and "never existed" are a single `CIRCLE_INVITATION_UNUSABLE` — so
 * the screen must not invent a more specific story than the server told.
 */
function mensaje(code: string | null): string {
  switch (code) {
    case "CIRCLE_INVITATION_UNUSABLE":
      return "Este enlace ya no sirve. Pide uno nuevo a quien te invitó.";
    case "CIRCLE_FORBIDDEN":
    case "CIRCLE_GUEST_SESSION_INVALID":
      return "Esta sala no está disponible para ti en este dispositivo.";
    case "CIRCLE_IDEMPOTENCY_CONFLICT":
      return "Esa acción ya se registró de otra forma. Recarga para ver el estado actual.";
    case "CIRCLE_INVALID_PAYLOAD":
    case "CIRCLE_SHARE_INVALID":
      return "No pudimos enviar eso. Revisa lo que escribiste e inténtalo de nuevo.";
    case "CIRCLES_UNAVAILABLE":
      return "Círculos no está disponible todavía.";
    default:
      return "Algo no funcionó. Inténtalo de nuevo en un momento.";
  }
}

const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
