"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { estilos as S } from "./estilos";
import { useHidratado } from "./useHidratado";
import {
  invitationLink,
  mintIdempotencyKey,
  mintInvitationToken,
} from "@/lib/circulos/invitacion";

/**
 * The organiser's one explicit act, for two people or for a room of them.
 *
 * ── Nothing happens on mount ───────────────────────────────────────────────
 *
 * Opening this screen creates NOTHING, mints no token and sends no request. A
 * page that provisions on render turns "I was reading about this" into "I have
 * started something with other people", and the second is not a thing a
 * navigation may decide. The intention is minted inside the click handler and
 * nowhere else.
 *
 * ── One intention, many attempts ───────────────────────────────────────────
 *
 * `intentionRef` holds the tokens, the size and the idempotency key for as long
 * as the outcome is uncertain. Every retry of the same attempt sends the SAME
 * ones, so a creation that landed and whose response was lost replays into the
 * same invitations instead of minting a second set. A new intention is minted
 * only after a failure that definitely happened BEFORE any creation, and only
 * when the person asks again.
 *
 * The SIZE is part of the intention, which is why changing it while an attempt
 * is unresolved is refused rather than allowed: retrying a group of four as a
 * group of six is a different request under a used key, and the API answers it
 * with a conflict. The selector is therefore locked once an attempt is in
 * flight and released only when nothing can have been created.
 *
 * A `ref`, not state: two clicks in one tick both read the same pre-update
 * state value, so a state flag does not stop a double click. `busyRef` is
 * checked and set synchronously, which does.
 *
 * ── The tokens live in memory, for one screen ──────────────────────────────
 *
 * No `localStorage`, no `sessionStorage`, no cookie, no server round-trip to
 * store them, nothing in the URL of this page. They exist in a ref and in the
 * rendered links, and a reload loses them — which is why the screen says so
 * before the person navigates away. One link per seat, so losing the screen
 * loses every link at once and the whole activity has to be started again.
 */

const CREATE_ENDPOINT = "/api/circulos/duo";

type Failure =
  | "unauthenticated"
  | "circles-off"
  | "template-unavailable"
  | "conflict"
  | "temporary";

/**
 * Copy the organiser can act on. Never an upstream message or a cause.
 *
 * Two of the five talk about the links, so they are written for the number
 * this attempt actually has: a Dúo that said "los mismos enlaces" would be
 * telling somebody holding one link to look for several.
 */
function failureCopy(failure: Failure, links: number): string {
  switch (failure) {
    case "unauthenticated":
      return "Tu sesión ya no está activa. Vuelve a entrar y abre esta página otra vez.";
    case "circles-off":
      return "Esta actividad todavía no está disponible. No se creó nada.";
    case "template-unavailable":
      return "Esta actividad ya no está disponible. No se creó nada.";
    case "conflict":
      return links > 1
        ? "No pudimos confirmar este intento. Empieza uno nuevo para obtener enlaces."
        : "No pudimos confirmar este intento. Empieza uno nuevo para obtener un enlace.";
    case "temporary":
      return links > 1
        ? "No pudimos confirmarlo. Puede que se haya creado o puede que no, así que vuelve a intentarlo con los mismos enlaces antes de empezar de cero."
        : "No pudimos confirmarlo. Puede que se haya creado o puede que no, así que vuelve a intentarlo con el mismo enlace antes de empezar de cero.";
  }
}

/** A failure that certainly happened before anything was created. */
function isDefinitelyBeforeCreation(failure: Failure): boolean {
  return failure !== "temporary";
}

interface Created {
  readonly activityId: string;
  /** One per seat that is not the organiser's, in seat order. */
  readonly links: readonly string[];
}

export interface CrearCirculoProps {
  readonly templateKey: string;
  readonly templateVersion: number;
  /**
   * The sizes this template admits, decided server-side from its own range and
   * passed down already resolved.
   *
   * A single size means there is nothing to choose and no selector is rendered
   * — a Dúo is two people, and offering a control with one option would invent
   * a decision. Several sizes render a choice, and the first is the default.
   */
  readonly sizes: readonly number[];
}

/**
 * How each seat is named on screen.
 *
 * Positional and stable: seat 2 is «Participante 2» for everybody, before
 * anybody has accepted and after. It is not a name, not an initial, not an
 * email and not an order of arrival — the organiser is looking at a list of
 * links they are about to send to people they already know, and the only thing
 * the screen has to do is let them keep the links apart.
 */
function seatLabel(index: number): string {
  return `Participante ${index + 2}`;
}

export function CrearCirculo({
  templateKey,
  templateVersion,
  sizes,
}: CrearCirculoProps) {
  const options = useMemo(() => (sizes.length > 0 ? [...sizes] : [2]), [sizes]);
  const [size, setSize] = useState(options[0]!);
  const [busy, setBusy] = useState(false);
  // Same window as the other doors: server markup on screen, no handler yet.
  const hidratado = useHidratado();
  const [created, setCreated] = useState<Created | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const intentionRef = useRef<{
    tokens: string[];
    key: string;
    size: number;
  } | null>(null);
  const busyRef = useRef(false);

  /**
   * True while an attempt may already have created something.
   *
   * The size cannot change here. Sending a different one under the same key is
   * a conflict at the API, so a selector that stayed live would be offering a
   * choice whose only effect is an error the person did not cause.
   */
  const sizeLocked = busy || intentionRef.current !== null || created !== null;

  const create = useCallback(async () => {
    // Synchronous guard: this is what makes a double click one creation.
    if (busyRef.current || created) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);

    // Mint ONCE per intention, then reuse for every retry of it. One secret per
    // seat that is not the organiser's: one for a Dúo, N−1 for a group of N.
    if (!intentionRef.current) {
      intentionRef.current = {
        tokens: Array.from({ length: size - 1 }, () => mintInvitationToken()),
        key: mintIdempotencyKey(),
        size,
      };
    }
    const intention = intentionRef.current;

    try {
      const res = await fetch(CREATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Exactly the keys the handler accepts. No userId, no circleId, no
        // role, no source: who is creating comes from the cookie, and which
        // sizes are legal is decided against the template, server-side.
        body: JSON.stringify({
          payload: {
            templateKey,
            templateVersion,
            invitationTokens: intention.tokens,
            // `size` ONLY when the template offered a choice.
            //
            // A Dúo's range has one value, so there is nothing to choose and
            // nothing to say — and the request stays byte-identical to the one
            // production sends today. That is not tidiness: the Web deploys
            // before the API does, and an API that has not yet learned about
            // `size` answers an unknown property with a 400. Sending a field
            // whose only possible value the server already knows would break
            // every Dúo created during the deploy window.
            ...(options.length > 1 ? { size: intention.size } : {}),
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
          links: intention.tokens.map((token) =>
            invitationLink(window.location.origin, token),
          ),
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
  }, [created, options.length, size, templateKey, templateVersion]);

  const copy = useCallback(async (link: string, index: number) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(index);
    } catch {
      setCopied(null);
    }
  }, []);

  if (created) {
    const many = created.links.length > 1;
    return (
      <section style={S.section} aria-labelledby="circulo-listo">
        <h2 id="circulo-listo" style={S.h2}>
          {many
            ? "Listo. Comparte un enlace con cada persona"
            : "Listo. Comparte este enlace"}
        </h2>
        <p style={S.p}>
          {many
            ? "Cada enlace es para UNA persona. Envíaselos por donde ya se escriban, uno a cada quien. Cada enlace sirve una sola vez: la primera persona que lo acepte ocupa ese lugar y el enlace deja de funcionar."
            : "Envíaselo a la persona con la que vas a hacer esto, por donde ya se escriban. Sirve una sola vez: la primera persona que lo acepte queda dentro y el enlace deja de funcionar."}
        </p>
        <p style={S.aviso}>
          {many
            ? "Cópialos antes de salir o recargar. No se guardan en ningún lado y no podemos volver a mostrártelos."
            : "Cópialo antes de salir o recargar. No se guarda en ningún lado y no podemos volver a mostrártelo."}
        </p>

        <ul style={{ margin: "0 0 1rem", padding: 0, listStyle: "none" }}>
          {created.links.map((link, index) => (
            <li key={link} style={{ marginBottom: ".9rem" }}>
              {many && (
                <p style={{ ...S.p, fontWeight: 600, marginBottom: ".2rem" }}>
                  {seatLabel(index)}
                </p>
              )}
              <p style={S.cita}>{link}</p>
              <button
                type="button"
                style={S.secondary}
                onClick={() => copy(link, index)}
                aria-label={
                  many
                    ? `Copiar el enlace de ${seatLabel(index)}`
                    : "Copiar enlace"
                }
              >
                Copiar enlace
              </button>
            </li>
          ))}
        </ul>

        <div style={S.acciones}>
          <Link href={`/compartir/${created.activityId}`} style={S.primary}>
            Entrar a la sala
          </Link>
        </div>

        {/* Announced, not merely coloured — the confirmation has to reach
            someone who is not looking at the button. And it names WHICH link,
            because a room of five copy buttons all saying "copied" is how the
            same link gets sent to two people. */}
        <p role="status" aria-live="polite" style={S.p}>
          {copied === null
            ? ""
            : many
              ? `Enlace de ${seatLabel(copied)} copiado.`
              : "Enlace copiado."}
        </p>
      </section>
    );
  }

  const choosing = options.length > 1;

  return (
    <section style={S.section} aria-labelledby="circulo-crear">
      <h2 id="circulo-crear" style={S.h2}>
        ¿Lo hacemos?
      </h2>

      {choosing && (
        <fieldset
          style={{ border: 0, margin: "0 0 1rem", padding: 0 }}
          disabled={sizeLocked}
        >
          <legend style={{ ...S.p, fontWeight: 600, padding: 0 }}>
            ¿Cuántas personas van a participar, contándote?
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem" }}>
            {options.map((option) => (
              <label
                key={option}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: ".35rem",
                }}
              >
                <input
                  type="radio"
                  name="circulo-tamano"
                  value={option}
                  checked={size === option}
                  onChange={() => setSize(option)}
                  disabled={sizeLocked}
                />
                {option} personas
              </label>
            ))}
          </div>
          <p style={S.p}>
            Vas a recibir {size - 1}{" "}
            {size - 1 === 1 ? "enlace" : "enlaces distintos"}, uno para cada
            persona que invites.
          </p>
          {sizeLocked && (
            <p style={S.aviso}>
              Ya empezamos este intento con {intentionRef.current?.size ?? size}{" "}
              personas. Para cambiarlo, empieza uno nuevo.
            </p>
          )}
        </fieldset>
      )}

      <p style={S.p}>
        {choosing
          ? "Al confirmar creamos la actividad y te damos un enlace por persona. Todavía no se le avisa a nadie."
          : "Al confirmar creamos la actividad y te damos un enlace para invitar a la otra persona. Todavía no se le avisa a nadie."}
      </p>

      {failure && (
        <p style={S.error} role="alert">
          {failureCopy(failure, (intentionRef.current?.size ?? size) - 1)}
        </p>
      )}

      <div style={S.acciones}>
        <button
          type="button"
          style={S.primary}
          onClick={create}
          disabled={busy || !hidratado}
        >
          {failure === "temporary"
            ? "Reintentar"
            : busy
              ? "Creando…"
              : choosing
                ? "Crear el círculo"
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
 *
 * 503 is `circles-off` for a group whose modality is shut exactly as it is for
 * Círculos being off, because the API answers both with the same opaque code —
 * and a screen that distinguished them would be telling somebody the modality
 * exists and is closed to them, which is what the opacity is for.
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
