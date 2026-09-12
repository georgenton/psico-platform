"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

import { estilos as S } from "./estilos";
import {
  invitationLink,
  mintIdempotencyKey,
  mintInvitationToken,
} from "@/lib/circulos/invitacion";

/**
 * The organiser's one explicit act.
 *
 * ── Nothing happens on mount ───────────────────────────────────────────────
 *
 * Opening this screen creates NO Dúo, mints no token and sends no request. A
 * page that provisions on render turns "I was reading about this" into "I have
 * started something with another person", and the second is not a thing a
 * navigation may decide. The intention is minted inside the click handler and
 * nowhere else.
 *
 * ── One intention, many attempts ───────────────────────────────────────────
 *
 * `intentionRef` holds the token and the idempotency key for as long as the
 * outcome is uncertain. Every retry of the same attempt sends the SAME pair, so
 * a creation that landed and whose response was lost replays into the same
 * invitation instead of minting a second one. A new pair is minted only after a
 * failure that definitely happened BEFORE any creation, and only when the
 * person asks again.
 *
 * A `ref`, not state: two clicks in one tick both read the same pre-update
 * state value, so a state flag does not stop a double click. `busyRef` is
 * checked and set synchronously, which does.
 *
 * ── The token lives in memory, for one screen ──────────────────────────────
 *
 * No `localStorage`, no `sessionStorage`, no cookie, no server round-trip to
 * store it, nothing in the URL of this page. It exists in a ref and in the
 * rendered link, and a reload loses it — which is why the screen says so before
 * the person navigates away.
 */

const CREATE_ENDPOINT = "/api/circulos/duo";

type Failure =
  | "unauthenticated"
  | "circles-off"
  | "template-unavailable"
  | "conflict"
  | "temporary";

/** Copy the organiser can act on. Never an upstream message or a cause. */
const FAILURE_COPY: Record<Failure, string> = {
  unauthenticated:
    "Tu sesión ya no está activa. Vuelve a entrar y abre esta página otra vez.",
  "circles-off": "Esta actividad todavía no está disponible. No se creó nada.",
  "template-unavailable":
    "Esta actividad ya no está disponible. No se creó nada.",
  conflict:
    "No pudimos confirmar este intento. Empieza uno nuevo para obtener un enlace.",
  temporary:
    "No pudimos confirmarlo. Puede que se haya creado o puede que no, así que vuelve a intentarlo con el mismo enlace antes de empezar de cero.",
};

/** A failure that certainly happened before anything was created. */
function isDefinitelyBeforeCreation(failure: Failure): boolean {
  return failure !== "temporary";
}

interface Created {
  readonly activityId: string;
  readonly link: string;
}

export interface CrearDuoProps {
  readonly templateKey: string;
  readonly templateVersion: number;
}

export function CrearDuo({ templateKey, templateVersion }: CrearDuoProps) {
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [copied, setCopied] = useState(false);

  const intentionRef = useRef<{ token: string; key: string } | null>(null);
  const busyRef = useRef(false);

  const create = useCallback(async () => {
    // Synchronous guard: this is what makes a double click one creation.
    if (busyRef.current || created) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);

    // Mint ONCE per intention, then reuse for every retry of it.
    if (!intentionRef.current) {
      intentionRef.current = {
        token: mintInvitationToken(),
        key: mintIdempotencyKey(),
      };
    }
    const intention = intentionRef.current;

    try {
      const res = await fetch(CREATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Exactly the keys the handler accepts. No userId, no circleId, no
        // role, no source: who is creating comes from the cookie.
        body: JSON.stringify({
          payload: {
            templateKey,
            templateVersion,
            invitationToken: intention.token,
          },
          idempotencyKey: intention.key,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { activityId?: unknown };
        if (typeof data?.activityId !== "string") {
          setFailure("temporary");
          return;
        }
        setCreated({
          activityId: data.activityId,
          link: invitationLink(window.location.origin, intention.token),
        });
        return;
      }

      const failed = classify(res.status);
      setFailure(failed);
      // Only drop the intention when nothing can have been created under it.
      if (isDefinitelyBeforeCreation(failed)) intentionRef.current = null;
    } catch {
      // Network error: the request may or may not have reached the API. Keep
      // the intention so the retry is the same one.
      setFailure("temporary");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [created, templateKey, templateVersion]);

  const copy = useCallback(async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [created]);

  if (created) {
    return (
      <section style={S.section} aria-labelledby="duo-listo">
        <h2 id="duo-listo" style={S.h2}>
          Listo. Comparte este enlace
        </h2>
        <p style={S.p}>
          Envíaselo a la persona con la que vas a hacer esto, por donde ya se
          escriban. Sirve una sola vez: la primera persona que lo abra queda
          dentro y el enlace deja de funcionar.
        </p>
        <p style={S.aviso}>
          Cópialo antes de salir o recargar. No se guarda en ningún lado y no
          podemos volver a mostrártelo.
        </p>

        <p style={S.cita}>{created.link}</p>

        <div style={S.acciones}>
          <button type="button" style={S.primary} onClick={copy}>
            Copiar enlace
          </button>
          <Link href={`/compartir/${created.activityId}`} style={S.secondary}>
            Entrar a la sala
          </Link>
        </div>

        {/* Announced, not merely coloured — the confirmation has to reach
            someone who is not looking at the button. */}
        <p role="status" aria-live="polite" style={S.p}>
          {copied ? "Enlace copiado." : ""}
        </p>
      </section>
    );
  }

  return (
    <section style={S.section} aria-labelledby="duo-crear">
      <h2 id="duo-crear" style={S.h2}>
        ¿Lo hacemos?
      </h2>
      <p style={S.p}>
        Al confirmar creamos la actividad y te damos un enlace para invitar a la
        otra persona. Todavía no se le avisa a nadie.
      </p>

      {failure && (
        <p style={S.error} role="alert">
          {FAILURE_COPY[failure]}
        </p>
      )}

      <div style={S.acciones}>
        <button
          type="button"
          style={S.primary}
          onClick={create}
          disabled={busy}
        >
          {failure === "temporary"
            ? "Reintentar"
            : busy
              ? "Creando…"
              : "Crear Dúo"}
        </button>
      </div>
    </section>
  );
}

/**
 * Status → the only five distinctions the organiser can act on.
 *
 * Deliberately coarse. An organiser can retry, start over, sign in again, or
 * go elsewhere; a finer taxonomy would only be repeating the server's internal
 * reasons back to a person who cannot use them.
 */
function classify(status: number): Failure {
  if (status === 401 || status === 403) return "unauthenticated";
  if (status === 503) return "circles-off";
  if (status === 422 || status === 404 || status === 400) {
    return "template-unavailable";
  }
  if (status === 409) return "conflict";
  return "temporary";
}
