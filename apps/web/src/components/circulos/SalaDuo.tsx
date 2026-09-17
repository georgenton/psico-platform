"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { circleParticipatingSize } from "@psico/types";
import { ContinuarConQuienesAceptaron } from "./ContinuarConQuienesAceptaron";
import { useRouter } from "next/navigation";
import type {
  CircleActivityView,
  CircleIntro,
  CirclePreparationField,
  CircleShareConfirmation,
  CircleSharingMode,
} from "@psico/types";

import { estilos as S } from "./estilos";
import { useHidratado } from "./useHidratado";
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
import { OpinionOpcional } from "./OpinionOpcional";

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
  /**
   * The template's `doNotSuggestWhen`, shown on the consent screen.
   *
   * It is copy, and it travels the same way the field labels do. What it is
   * NOT is a questionnaire: nothing is asked, nothing is scored, nothing is
   * stored, and the other person never learns that this screen was read, how
   * long it took, or what was decided in front of it. The person reads six
   * sentences and either continues or does not.
   */
  readonly noConviene: readonly string[];
  /** The template's own `estimatedMinutes`, or null when this build lacks it. */
  readonly minutosEstimados: number | null;
  /** What the activity is for, and why it is shaped this way. Copy, optional. */
  readonly intro: CircleIntro | null;
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
  noConviene,
  minutosEstimados,
  intro,
  isGuest,
}: SalaDuoProps) {
  const router = useRouter();
  const { view, error, loading, refresh } = usePollingActividad(
    activityId,
    initialView,
  );
  const [local, setLocal] = useState<Local>({ stage: "consent" });
  const [busy, setBusy] = useState(false);
  // The consent stage is the FIRST paint of this room for everybody, so its
  // buttons are the ones exposed to the window before hydration.
  const hidratado = useHidratado();
  const [commandError, setCommandError] = useState<string | null>(null);
  /**
   * Whether the organiser has «Continuar con quienes aceptaron» open.
   *
   * HERE rather than inside the component, because the room polls: the panel
   * lived in the child and a refetch wiped it a few seconds after it opened.
   */
  const [cerrandoIncorporacion, setCerrandoIncorporacion] = useState(false);
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
  /**
   * How often each prepared help was opened, in memory and nowhere else.
   *
   * A ref rather than state: nothing on screen depends on it, and re-rendering
   * the room because somebody re-read an explanation would be a strange
   * priority. It is read once, at the end, if they agree to contribute —
   * during the preparation itself nothing is sent, so there is no request
   * whose timing says somebody is stuck on a question.
   *
   * Leaving before that point loses them, which is the honest cost of not
   * measuring people while they think.
   */
  const helpOpens = useRef(new Map<string, number>());
  const countHelp = useCallback((fieldKey: string, piece: string) => {
    const key = `${fieldKey}:${piece}`;
    helpOpens.current.set(key, (helpOpens.current.get(key) ?? 0) + 1);
  }, []);

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
        {/* `view` may be null here: withdrawing is a local decision that can
            land before the next read comes back, and the screen has to be
            truthful without one. With no view there is no size, so the copy
            says neither "the other person" nor "the group". */}
        <p style={S.p}>
          {view === null
            ? "Esta sala se cerró para ti. Lo que escribiste en privado nunca salió de tu pantalla."
            : esGrupo(view)
              ? "El resto del grupo ya no está esperándote, y esta sala se cerró para ti. Lo que escribiste en privado nunca salió de tu pantalla."
              : "La otra persona ya no está esperándote, y esta sala se cerró para ti. Lo que escribiste en privado nunca salió de tu pantalla."}
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
        {/* Small, and above the title rather than over it. A guest arrives
            here from a link somebody sent them and has no idea whose product
            this is; a line of text answers that without becoming a banner. */}
        <p style={S.firma}>Una experiencia de FeelVerse</p>
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

      {/* ── Who is here ────────────────────────────────────────────────────
          Only for a flexible room, and only what joining says: names and
          whether somebody is in. Never who is writing, who has confirmed, or
          who chose not to share. */}
      {view.onboarding && (
        <section style={S.section} aria-labelledby="sala-quien">
          <h2 id="sala-quien" style={S.h2}>
            Quiénes están
          </h2>
          <ul style={{ margin: "0 0 .6rem", padding: 0, listStyle: "none" }}>
            {view.onboarding.roster.map((entry, index) => (
              <li key={`${entry.state}-${index}`} style={S.p}>
                <strong>{entry.name}</strong>
                {entry.you ? " (tú)" : ""} ·{" "}
                {entry.state === "ORGANIZES"
                  ? "Organiza"
                  : entry.state === "PARTICIPATES"
                    ? "Participa"
                    : "Invitación pendiente"}
              </li>
            ))}
          </ul>
          <p style={S.p}>
            {view.onboarding.group !== null
              ? `El grupo quedó en ${view.onboarding.group} ${view.onboarding.group === 2 ? "persona" : "personas"}. Las respuestas se comparten entre estas personas.`
              : `Pueden participar hasta ${view.onboarding.capacity}. Por ahora están dentro ${view.onboarding.accepted}.`}
          </p>
          {view.onboarding.open && (
            <p style={S.p}>
              Puedes ir preparando tu parte mientras llegan las demás. Lo que
              escribes se queda en tu pantalla hasta que lo confirmes.
            </p>
          )}
          {view.onboarding.canClose && (
            <ContinuarConQuienesAceptaron
              asking={cerrandoIncorporacion}
              onAsk={() => setCerrandoIncorporacion(true)}
              onCancel={() => setCerrandoIncorporacion(false)}
              busy={busy}
              roster={view.onboarding.roster}
              group={view.onboarding.accepted}
              pending={
                view.onboarding.roster.filter((r) => r.state === "INVITED")
                  .length
              }
              onConfirm={() => command("close-onboarding")}
            />
          )}
        </section>
      )}

      {stageName === "consent" && (
        <section style={S.section} aria-labelledby="cons-h">
          <h2 id="cons-h" style={S.h2}>
            Antes de empezar
          </h2>
          {intro && <p style={S.p}>{intro.body}</p>}
          <p style={S.p}>
            Vas a prepararte por tu cuenta y después decidir qué compartir.
            Nadie ve nada tuyo hasta que tú lo confirmes, y puedes elegir no
            compartir nada o retirarte en cualquier momento.
          </p>
          <p style={S.p}>
            Toma unos {estimado(view, minutosEstimados)} minutos.
          </p>

          {/*
            A disclosure, closed by default. The answer to "why is this
            activity shaped this way" is worth having and is not worth making
            anybody read: whoever wants it opens it, and whoever does not is
            not asked to scroll past it.

            `<details>` rather than a dialog: it is prose, it needs no focus
            trap, it works from the keyboard and with a screen reader without a
            line of JavaScript, and it cannot break under a strict CSP.
          */}
          {intro?.rationale && (
            <details style={S.detalle}>
              <summary style={S.detalleResumen}>
                {intro.rationale.title}
              </summary>
              <p style={{ ...S.p, padding: ".2rem .5rem .8rem" }}>
                {intro.rationale.body}
              </p>
            </details>
          )}

          {/*
           * The situations in which this is the wrong thing to do — read
           * alone, before writing anything.
           *
           * We cannot detect any of them, and the copy does not pretend to.
           * There is no question, no answer, no score and nothing stored: this
           * is a list somebody reads and a decision they take by pressing one
           * of two buttons. Continuing is a decision to take part; it says
           * nothing about their relationship and certifies nothing about it.
           *
           * The other person never learns this screen was here for you, what
           * you thought of it, or how long you looked at it. Leaving needs no
           * reason, and the service accepts none.
           */}
          {noConviene.length > 0 && (
            <div style={S.aviso}>
              <p style={{ ...S.p, fontWeight: 600, color: "inherit" }}>
                Hay situaciones en las que esta actividad no ayuda, y puede
                complicar las cosas:
              </p>
              <ul style={S.lista}>
                {noConviene.map((caso) => (
                  <li key={caso} style={S.listaItem}>
                    {caso}
                  </li>
                ))}
              </ul>
              <p style={{ ...S.p, color: "inherit" }}>
                Esto lo decides tú, y lo decides aquí, a solas. Si alguna te
                suena, no sigas: puedes salir sin dar explicaciones y la otra
                persona no sabrá por qué. No podemos comprobar nada de esto, y
                no lo estamos comprobando.
              </p>
            </div>
          )}

          <div style={S.acciones}>
            <button
              type="button"
              style={S.primary}
              onClick={() => setLocal({ stage: "prepare" })}
              disabled={!hidratado}
            >
              Entiendo, empezar
            </button>
            <button
              type="button"
              style={S.quiet}
              onClick={withdrawAndLeave}
              disabled={busy || !hidratado}
            >
              No quiero hacerla
            </button>
          </div>
        </section>
      )}

      {stageName === "prepare" && (
        <PreparacionPrivada
          participantes={circleParticipatingSize(view)}
          fields={fields}
          allowedModes={allowedModes}
          draft={draft}
          onDraftChange={setDraft}
          busy={busy}
          onPreview={(confirmation) =>
            setLocal({ stage: "preview", confirmation })
          }
          onWithdraw={withdrawAndLeave}
          onHelpOpen={countHelp}
        />
      )}

      {stageName === "preview" && local.stage === "preview" && (
        <PreviewCompartir
          participantes={view.onboarding?.group ?? view.requiredParticipants}
          incorporacionAbierta={view.onboarding?.open ?? false}
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
            {esGrupo(view)
              ? "Listo. Falta el grupo."
              : "Listo. Falta la otra persona."}
          </h2>
          <p style={S.p}>
            {esGrupo(view)
              ? "Ya confirmamos lo tuyo. Cuando todas las personas hayan confirmado lo suyo, se abren todas a la vez — ni antes, ni sólo algunas."
              : "Ya confirmamos lo tuyo. Cuando la otra persona confirme lo suyo, se abren los dos a la vez — ni antes, ni sólo uno."}
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
          {/* Three endings, and the copy has to be true of the one that
              happened — while saying nothing about WHO ended it or why.

              · Nothing was ever opened (cancelled before the reveal): there is
                no "what you shared", and claiming there is would be a small
                lie at the exact moment somebody is looking for reassurance.
              · A room that closed after opening: what each person read stays
                with them, but the room itself is not somewhere to come back
                to, so it does not promise it is.
              · A Dúo: unchanged. */}
          <p style={S.p}>
            {view !== null && view.revealedAt === null
              ? "No se abrió nada y no se compartió nada. Lo que escribiste en privado no salió de tu pantalla."
              : view !== null && circleParticipatingSize(view) > 2
                ? "Gracias por el rato. Lo que leyeron queda con cada quien; esta sala ya no se puede volver a abrir."
                : "Gracias por el rato. Lo que compartieron queda entre ustedes."}
          </p>

          {/*
            An invitation, at the one moment it is not an interruption.

            The destination depends on who is reading: a member has a library, a
            guest has no account and would be bounced to a login they did not
            ask for. Both are real routes and neither carries anything from this
            room — no activity id, no token, no topic, not a word anybody wrote.
            `no-referrer` is what stops the room's own URL travelling as the
            referer, which is the leak a plain link would have.
          */}
          {/*
            Asked here and only here: after the activity is over, where it is
            not an interruption and where nothing depends on the answer.
          */}
          <OpinionOpcional
            activityId={activityId}
            helpOpens={[...helpOpens.current.entries()].map(([key, opens]) => {
              const at = key.lastIndexOf(":");
              return {
                fieldKey: key.slice(0, at),
                piece: key.slice(at + 1) as "explanation" | "example",
                opens,
              };
            })}
          />

          <p style={S.p}>
            ¿Quieres conocer más?{" "}
            <a
              href={
                isGuest
                  ? "/"
                  : "/dashboard/biblioteca/emociones-en-construccion"
              }
              referrerPolicy="no-referrer"
              style={S.secondary}
            >
              Explora Emociones en construcción en FeelVerse
            </a>
          </p>
        </section>
      )}

      {stageName !== "consent" && stageName !== "closed" && (
        <>
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
          {/*
           * Three different things get confused at exactly this button, and the
           * confusion is expensive in both directions: somebody who wanted to
           * stop the conversation deleting their whole account, or somebody who
           * wanted to be gone thinking that leaving one room did it.
           *
           * So the note says what THIS does and points at where the other one
           * lives. It is not the place to explain account deletion.
           */}
          <p style={S.nota}>
            {esGrupo(view)
              ? "Retirarte termina esta actividad para todo el grupo. Antes del intercambio, lo que escribiste se descarta; después, lo que las demás personas ya leyeron se queda. "
              : "Retirarte termina esta actividad para las dos personas. Antes del intercambio, lo que escribiste se descarta; después, lo que la otra persona ya leyó se queda. "}
            {isGuest
              ? "Entraste con un enlace, no con una cuenta: al retirarte el enlace deja de servir y no hay nada más que cerrar."
              : "Retirarte no elimina tu cuenta: eso se hace desde tu perfil y tiene otros efectos."}
          </p>
        </>
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

/** Whether this room holds more than two people. */
function esGrupo(view: CircleActivityView): boolean {
  // The GROUP: a room offered to six that continued with two is two people,
  // and every sentence this switches on — «las dos personas» versus «todo el
  // grupo» — is about the conversation, not about the invitation.
  return circleParticipatingSize(view) > 2;
}

function anuncio(view: CircleActivityView, stage: string): string {
  const grupo = esGrupo(view);
  switch (stage) {
    case "waiting":
      return grupo
        ? "Tu parte está confirmada. Esperando al resto del grupo."
        : "Tu parte está confirmada. Esperando a la otra persona.";
    case "revealed":
      return grupo
        ? "Todas las partes están listas. Ya puedes leer lo que compartió cada quien."
        : "Las dos partes están listas. Ya puedes leer lo que compartió la otra persona.";
    case "follow-up":
      return "Es momento de decidir cómo siguen.";
    case "closed":
      return "La actividad terminó.";
    default:
      // No count in a group.
      //
      // «2 de 5 listas» is an aggregate, not a name — and in a room of five it
      // is still a progress bar on other people, read by somebody who knows
      // who they invited. The Dúo keeps it because there the number IS the
      // other person's state and they will talk about it anyway.
      // `readyCount` is ABSENT from a group's response now, not merely
      // ignored here — so this branch reads a field that is not there rather
      // than one the screen politely declines to render.
      return grupo || view.readyCount === undefined
        ? "Cada quien se prepara por su lado."
        : `${view.readyCount} de ${circleParticipatingSize(view)} listas.`;
  }
}

function estimado(
  view: CircleActivityView,
  templateMinutes: number | null,
): number {
  // The template's own number when this build carries the template — which is
  // the number the approved copy promises, and the one the preview already
  // shows a stranger. Reaching it required passing it in: the wire view does
  // not carry an estimate, and the room used to derive one from the turn count.
  //
  // That derivation said 10 for a template that says 15. Nobody was misled by
  // much, but two screens quoting different numbers for the same activity is
  // the kind of small lie that makes the rest harder to trust.
  //
  // The fallback stays for an activity pinned to a template this build does not
  // have: the turns are a fair proxy, and a proxy beats an empty sentence.
  if (templateMinutes !== null && templateMinutes > 0) return templateMinutes;
  return Math.max(10, view.conversationTurns.length * 5);
}

/**
 * Opaque, human wording for an opaque code.
 *
 * The API answers with one code for many causes on purpose — "expired", "used",
 * "revoked" and "never existed" are a single `CIRCLE_INVITATION_UNUSABLE` — so
 * the screen must not invent a more specific story than the server told.
 */
/**
 * What each refusal says, and what it lets somebody do next.
 *
 * Three rules, and they are in tension often enough to be worth naming:
 *
 *  - **Uniform about causes.** Expired, revoked, already used and never-existed
 *    are one sentence. The API keeps them identical on purpose and repeating
 *    them apart here would undo that.
 *  - **Honest about effects.** Where the server CAN say whether something
 *    landed, the copy says it. A conflict means it landed; a validation refusal
 *    means it did not; a network failure means nobody knows, and the room holds
 *    the idempotency key precisely so that retrying is safe — so it says that
 *    rather than leaving somebody to guess whether they just sent it twice.
 *  - **Always an action.** A message with nothing to do next is a dead end.
 */
function mensaje(code: string | null): string {
  switch (code) {
    case "CIRCLE_INVITATION_UNUSABLE":
      return "Este enlace ya no sirve. Pide uno nuevo a quien te invitó.";
    case "CIRCLE_FORBIDDEN":
    case "CIRCLE_GUEST_SESSION_INVALID":
      // It used to say "en este dispositivo", which sent people hunting for a
      // browser problem — and was simply wrong for a signed-in member whose
      // access token had expired. The device was never the question.
      return "Esta sala ya no está abierta para ti. Si deberías estar aquí, pide a quien te invitó un enlace nuevo.";
    case "CIRCLE_ACTIVITY_UNAVAILABLE":
      return "Esta actividad ya no admite cambios. Recarga para ver cómo quedó.";
    // The two the API now names, and the reason it names them: this exact
    // screen used to show the sentence above — «ya no admite cambios» — to
    // somebody whose room was working perfectly and was simply still waiting
    // for people. It read as "you are too late" when the truth was "not yet".
    case "CIRCLE_ONBOARDING_OPEN":
      return "Todavía se están incorporando personas. Puedes preparar tu parte; podrás enviarla cuando quien organiza continúe con el grupo.";
    case "CIRCLE_GROUP_TOO_SMALL":
      return "Todavía no hay suficientes personas. Hacen falta al menos dos, contándote.";
    case "CIRCLE_IDEMPOTENCY_CONFLICT":
      return "Esa acción ya se registró de otra forma. Recarga para ver el estado actual.";
    case "CIRCLE_INVALID_PAYLOAD":
    case "CIRCLE_SHARE_INVALID":
      return "No pudimos enviar eso. Revisa lo que escribiste e inténtalo de nuevo.";
    case "CIRCLES_UNAVAILABLE":
      return "Círculos no está disponible todavía.";
    case "CIRCLE_UNAVAILABLE":
      // The network, not a verdict: the command may or may not have landed.
      // Saying "something went wrong, try again" invites somebody to wonder
      // whether they have now sent it twice. They have not.
      return "No pudimos confirmar si se envió. Puedes volver a intentarlo: si ya se había registrado, no se duplica.";
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
