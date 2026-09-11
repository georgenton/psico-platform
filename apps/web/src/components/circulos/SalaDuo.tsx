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
import {
  PreparacionPrivada,
  borradorInicial,
  borradorTieneTexto,
} from "./PreparacionPrivada";
import type { BorradorPrivado } from "./PreparacionPrivada";
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

  // The draft lives here, not in the form, so "Volver a editar" — which
  // unmounts the form — cannot discard it. Memory only: no storage, no
  // autosave, no endpoint.
  const [draft, setDraft] = useState<BorradorPrivado>(() =>
    borradorInicial(allowedModes),
  );

  // One idempotency key per logical INTENTION, held in memory for as long as
  // the outcome is uncertain.
  //
  // The key is what tells the API "this is the same act again" rather than "a
  // second act". Minting a fresh one per request — which is what this did
  // before — turned every retry into a new intention: a share confirmed just
  // as the connection dropped, retried by the person, would arrive under a new
  // key and come back `CIRCLE_IDEMPOTENCY_CONFLICT`. So the key is derived
  // from the command AND its payload: retrying the identical thing reuses it,
  // and changing the text mints a new one because it is genuinely a different
  // intention.
  const keys = useRef(new Map<string, string>());
  const keyFor = useCallback((kind: string, payload: unknown): string => {
    const intention = `${kind}:${JSON.stringify(payload ?? null)}`;
    const existing = keys.current.get(intention);
    if (existing) return existing;
    const minted = crypto.randomUUID();
    keys.current.set(intention, minted);
    return minted;
  }, []);

  const command = useCallback(
    async (kind: string, payload?: unknown): Promise<boolean> => {
      setBusy(true);
      setCommandError(null);
      const idempotencyKey = keyFor(kind, payload);
      try {
        const res = await fetch(
          `/api/circulos/actividad/${encodeURIComponent(activityId)}/comando`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, payload, idempotencyKey }),
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
        // Settled. The key has done its job and a later, genuinely new
        // intention with the same text should not replay this one.
        keys.current.delete(`${kind}:${JSON.stringify(payload ?? null)}`);
        refresh();
        return true;
      } catch {
        // Deliberately KEEPS the key: a network failure is the case where the
        // command may or may not have landed, and the retry must ask about the
        // same act rather than start a new one.
        setCommandError("CIRCLE_UNAVAILABLE");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activityId, refresh, keyFor],
  );

  /**
   * Leave permanently: withdraw FIRST, then forget the session.
   *
   * Deleting the cookie used to be the whole of "salir", and it was a lie the
   * screen told on the server's behalf. The seat stayed `ACCEPTED`, the guest
   * session stayed valid in PostgreSQL, and the other person waited for a
   * confirmation that was never coming — while this screen said the person had
   * left. The only thing that actually left was their access.
   *
   * `withdraw` is the command that changes the aggregate: it settles the seat,
   * revokes the guest sessions bound to it, and decides `CANCELLED` or
   * `CLOSED`. So it runs first, and the local cleanup happens only if it
   * succeeded. On failure nothing is cleared — cookie, draft, polling and
   * screen all stay — and the person can retry under the same idempotency key.
   */
  const withdrawAndLeave = useCallback(async () => {
    if (!(await command("withdraw"))) return false;

    setDraft(borradorInicial(allowedModes));
    setBusy(true);
    try {
      await fetch("/api/circulos/sesion", { method: "DELETE" });
    } catch {
      // The withdrawal already landed, which is the part that matters: the
      // seat is settled and the API has revoked the session server-side. A
      // cookie that outlives it is inert.
    } finally {
      setBusy(false);
      setLocal({ stage: "left" });
      if (!isGuest) router.replace("/dashboard/circulos");
    }
    return true;
  }, [command, allowedModes, isGuest, router]);

  // Warn before the draft is lost — from wherever in the flow it still exists.
  //
  // This lived inside `PreparacionPrivada` and was destroyed by the very
  // navigation it needed to survive: "Ver qué se compartirá" unmounts the form,
  // so the warning disappeared at the exact stage where somebody is most likely
  // to think they are finished and close the tab. Here it is tied to the DRAFT,
  // not to a screen, so it holds through prepare, through preview, and through
  // a failed command — and stops the moment a confirmation or a withdrawal has
  // actually cleared the draft.
  const hasDraft = borradorTieneTexto(draft);
  useEffect(() => {
    if (!hasDraft) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasDraft]);

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
        <h1 style={S.h1}>Te retiraste de esta actividad</h1>
        <p style={S.p}>
          La otra persona ya no está esperándote, y esta sala se cerró para ti.
          Lo que escribiste en privado nunca salió de tu pantalla.
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
            compartir nada o retirarte en cualquier momento.
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
              onClick={withdrawAndLeave}
              disabled={busy}
            >
              No quiero hacerla
            </button>
          </div>
        </section>
      )}

      {stageName === "prepare" && (
        <PreparacionPrivada
          fields={fields}
          allowedModes={allowedModes}
          draft={draft}
          onDraftChange={setDraft}
          busy={busy}
          onPreview={(confirmation) =>
            setLocal({ stage: "preview", confirmation })
          }
          onWithdraw={withdrawAndLeave}
        />
      )}

      {stageName === "preview" && local.stage === "preview" && (
        <PreviewCompartir
          confirmation={local.confirmation}
          fields={fields}
          busy={busy}
          // Back to editing with everything intact: the draft is owned above
          // this component, so unmounting the form does not touch it.
          onBack={() => setLocal({ stage: "prepare" })}
          onConfirm={async () => {
            if (await command("share", local.confirmation)) {
              // Confirmed. The text is on the server now, so the local copy
              // has no reason to exist.
              setDraft(borradorInicial(allowedModes));
              setLocal({ stage: "prepare" });
            }
            // On failure: stay on the preview, keep the draft, show the error.
            // The person can retry the identical confirmation under the same
            // idempotency key, or go back and edit it.
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
            Puedes cerrar esta página y volver a{" "}
            <strong>la dirección de esta sala</strong> mientras tu sesión siga
            vigente. El enlace de invitación original ya se usó y sirve una sola
            vez.
          </p>
          {/* No exit button here: the always-visible one below covers this
              stage, and two identical controls on one screen is a question
              about which is which, not a convenience. */}
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
          <button
            type="button"
            style={S.quiet}
            onClick={withdrawAndLeave}
            disabled={busy}
          >
            Retirarme de la actividad
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
