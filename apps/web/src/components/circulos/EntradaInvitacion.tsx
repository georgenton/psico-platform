"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { CircleInvitationPreview } from "@psico/types";

import { estilos as S } from "./estilos";
import { useHidratado } from "./useHidratado";

/**
 * `/i#token` — the door.
 *
 * ── Opening a link is not accepting an invitation ───────────────────────────
 *
 * Mounting this page calls `inspect` and nothing else. `inspect` is the route
 * that reads an invitation WITHOUT spending it, so a preview crawler, a link
 * scanner in a messaging app, a prefetch, or somebody tapping twice all leave
 * the invitation exactly as they found it.
 *
 * Only pressing "Aceptar invitación" calls the exchange, and only the exchange
 * consumes the invitation and creates the session cookie. That is the whole
 * point of the split: the person who opens a link has not yet agreed to
 * anything, and a screen that decided for them would be spending a one-shot
 * secret on their behalf.
 *
 * ── The fragment ────────────────────────────────────────────────────────────
 *
 * The secret arrives in the URL FRAGMENT, the only part of a URL a browser
 * never puts on the wire: it reaches no access log, no proxy, no CDN and no
 * `Referer`. That is worth nothing if the page then copies it somewhere
 * durable, so it is read once, held in a ref (never state — state is what gets
 * serialised into the RSC payload and rendered into the HTML), erased from the
 * address bar with `history.replaceState` BEFORE any network call, and dropped
 * the moment it is spent or abandoned.
 *
 * `replaceState` rather than `pushState`, so Back cannot return to a URL that
 * still holds it. It is never written to storage, a JS-readable cookie, a query
 * string, an analytics call or a log line — the `catch` blocks discard the
 * cause for the same reason.
 */

type Phase =
  | "reading"
  | "inspecting"
  | "decide"
  | "accepting"
  | "manual"
  | "error";

/**
 * The same shape `AcceptInvitationDto` enforces, asked here first.
 *
 * Not a second authority — the server still decides, and it is the only one
 * that can. Asking early buys one thing: the difference between «fix this
 * word» and «this link no longer works», which is decided entirely by whether
 * the check happens before or after the invitation is consumed.
 *
 * The two refusals are the DTO's, in the DTO's words: an address or a bare
 * number, because this field is shown to the whole room and the one thing it
 * must never become is a way to contact somebody.
 */
function aliasProblema(nombre: string): string | null {
  if (nombre.length > 24) {
    return "Es un poco largo: 24 caracteres como máximo.";
  }
  if (/[@\n\r\t]/.test(nombre)) {
    return "Mejor un nombre, no un correo. Lo verán las demás personas.";
  }
  if (/^[0-9\s+()-]+$/.test(nombre)) {
    return "Mejor un nombre, no un número. Lo verán las demás personas.";
  }
  return null;
}

export function EntradaInvitacion() {
  const router = useRouter();
  const secretRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("reading");
  /**
   * The name this person will be shown under, kept in component state only.
   *
   * It travels with the acceptance and nowhere else — not to storage, not to
   * a query string, not to a log. It is personal data the moment somebody
   * types their own name into it, and the copy above says plainly that it is
   * a chosen name rather than a verified one.
   */
  const [alias, setAlias] = useState("");
  /**
   * Something correctable about the name — never a reason to spend the link.
   *
   * Separate from `phase` on purpose: the phases describe what is happening to
   * the INVITATION, and a name that needs another try is not something
   * happening to the invitation at all.
   */
  const [aliasError, setAliasError] = useState<string | null>(null);
  // Accepting an invitation is the guest's first press, on markup the server
  // sent. Until this is true, the press would be swallowed in silence.
  const hidratado = useHidratado();
  const [manual, setManual] = useState("");
  // What this invitation IS. Four fields, from the server, shown before the
  // decision — never an id, a roster, a state or anybody's content.
  const [preview, setPreview] = useState<CircleInvitationPreview | null>(null);

  /** Check the link without spending it. Never creates a session. */
  const inspect = useCallback(async (secret: string) => {
    setPhase("inspecting");
    try {
      const res = await fetch("/api/circulos/inspeccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The secret, and nothing else.
        //
        // Looking is not accepting, so the name somebody may type further down
        // has no business on the request that only asks what this invitation
        // is — and this runs on mount, before there is anything to send. The
        // name travels with the acceptance, which is the one request that
        // creates the seat it belongs to.
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        secretRef.current = null;
        setPhase("error");
        return;
      }
      const body = (await res.json()) as { preview?: unknown };
      setPreview(isPreview(body.preview) ? body.preview : null);
      setPhase("decide");
    } catch {
      secretRef.current = null;
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    // `window.location.hash` includes the leading "#".
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const secret = raw.trim();

    if (secret.length === 0) {
      setPhase("manual");
      return;
    }

    secretRef.current = secret;
    // Erase it before anything else can observe it. `pathname + search` without
    // the hash; `search` is preserved because the fragment is the only part
    // that ever carried a secret.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    void inspect(secret);
  }, [inspect]);

  /** The only path that consumes the invitation. */
  const accept = useCallback(async () => {
    const secret = secretRef.current;
    if (!secret) {
      setPhase("error");
      return;
    }
    // ── Checked BEFORE the invitation is spent ────────────────────────────
    //
    // A single-use link and a correctable typo must never meet. If the name is
    // the only thing wrong, the person edits it and presses again: the secret
    // is untouched, the value they typed is still in the box, and nothing tells
    // them the link expired — which is what a refusal AFTER consuming would
    // have looked like, and would have been unrecoverable.
    const nombre = alias.trim();
    const problema = nombre.length > 0 ? aliasProblema(nombre) : null;
    if (problema) {
      setAliasError(problema);
      return;
    }
    setAliasError(null);

    setPhase("accepting");
    try {
      const res = await fetch("/api/circulos/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          nombre.length > 0 ? { secret, alias: nombre } : { secret },
        ),
      });

      if (!res.ok) {
        // The API validates the name before its handler opens the invitation,
        // so a refusal over the name alone leaves the link unspent. We only
        // read it that way when we actually sent a name — otherwise a 400 is
        // about the secret, and the secret is then done.
        if (res.status === 400 && nombre.length > 0) {
          setAliasError(
            "Ese nombre no se puede usar. Prueba con otro — tu invitación sigue siendo válida.",
          );
          setPhase("decide");
          return;
        }
        // Spent or refused, the secret's job is done either way.
        secretRef.current = null;
        setPhase("error");
        return;
      }
      secretRef.current = null;
      const activityId = await resolveActivity();
      if (!activityId) {
        setPhase("error");
        return;
      }
      router.replace(`/compartir/${activityId}`);
    } catch {
      secretRef.current = null;
      setPhase("error");
    }
  }, [router, alias]);

  /** "Ahora no": forget the secret and leave. No accept, no write. */
  const decline = useCallback(() => {
    secretRef.current = null;
    router.replace("/");
  }, [router]);

  if (phase === "reading" || phase === "inspecting") {
    return (
      <main style={S.page}>
        <p role="status" aria-live="polite" style={S.p}>
          Revisando tu invitación…
        </p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Este enlace ya no sirve</h1>
        <p role="alert" style={S.error}>
          Puede haber caducado, haberse usado ya, o no ser válido. Pídele a la
          persona que te invitó que te envíe uno nuevo.
        </p>
        <a href="/" style={S.secondary}>
          Ir al inicio
        </a>
      </main>
    );
  }

  if (phase === "decide" || phase === "accepting") {
    // More than two only when the server said so. An absent count reads as a
    // Dúo, which is the shape every existing invitation has.
    const grupo = (preview?.participants ?? 2) > 2;
    return (
      <main style={S.page}>
        <p style={S.firma}>Una experiencia de FeelVerse</p>
        {/*
          The name when the server sent one, and a sentence that still works
          when it did not. A missing name is a preview the API declined to fill
          in — it is not a broken invitation, and answering it with "this link
          does not work" would turn a degraded field into a dead end.

          What it never does is guess at the relationship. "Tu pareja te
          invitó" would be an invention about two people we know nothing about.
        */}
        <h1 style={S.h1}>
          {preview
            ? `${preview.inviterFirstName} te invita a compartir un momento`
            : "Te invitan a compartir un momento"}
        </h1>

        {preview ? (
          <section style={S.section} aria-labelledby="inv-h">
            <h2 id="inv-h" style={S.h2}>
              {preview.title}
            </h2>
            <p style={S.p}>{preview.summary}</p>
            <p style={S.p}>
              Unos {preview.estimatedMinutes} minutos ·{" "}
              <strong>No necesitas crear una cuenta.</strong>
            </p>
            {/* How many people will read what this person writes, said BEFORE
                they accept. It is the one fact a Dúo let a screen assume and a
                group cannot: agreeing to be read by one person and agreeing to
                be read by four are different decisions. Absent when the server
                did not send it — an older response degrades the sentence, it
                does not invent a number. */}
            {typeof preview.participants === "number" && (
              <p style={S.p}>
                {preview.participants > 2
                  ? `Pueden participar hasta ${preview.participants} personas, contándote a ti. Puede que sean menos: la actividad sigue con quienes acepten.`
                  : "Participan dos personas: quien te invitó y tú."}
              </p>
            )}
          </section>
        ) : (
          <section style={S.section}>
            <p style={S.p}>Descubran qué les ayuda cuando algo les preocupa.</p>
            <p style={S.p}>
              Unos 15 minutos · <strong>No necesitas crear una cuenta.</strong>
            </p>
          </section>
        )}

        <section style={S.section} aria-labelledby="como-h">
          <h2 id="como-h" style={S.h2}>
            Cómo funciona
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.2rem",
              display: "grid",
              gap: ".5rem",
            }}
          >
            <li style={S.turno}>
              Primero te preparas <strong>por tu cuenta</strong>. Lo que
              escribas se queda en tu pantalla y no se guarda en ningún sitio.
            </li>
            <li style={S.turno}>
              Después decides qué compartir — todo, una parte, o{" "}
              <strong>nada</strong>.
            </li>
            <li style={S.turno}>
              {grupo ? (
                <>
                  Se abre para todas las personas <strong>a la vez</strong>,
                  sólo cuando todas confirmaron. Nadie ve nada tuyo antes.
                </>
              ) : (
                <>
                  Se abre para los dos <strong>a la vez</strong>, sólo cuando
                  ambos confirmaron. Nadie ve nada tuyo antes.
                </>
              )}
            </li>
            {grupo && (
              <li style={S.turno}>
                Si alguien elige <strong>no compartir nada</strong>, la
                actividad termina ahí para todo el grupo y no se abre nada. No
                se dice quién lo eligió.
              </li>
            )}
            <li style={S.turno}>
              Puedes retirarte en cualquier momento, sin dar explicaciones.
              {grupo
                ? " En un grupo, retirarte cierra la actividad para todas las personas."
                : ""}
            </li>
          </ul>
        </section>

        {/* The name, and what accepting publishes.
            Said BEFORE the button, because it is part of what the person is
            agreeing to: the others will see that you are here, and under what
            name. What you WRITE is a separate decision, made later. */}
        {grupo && (
          <section style={S.section} aria-labelledby="alias-h">
            <h2 id="alias-h" style={S.h2}>
              ¿Cómo quieres que te vean?
            </h2>
            <label htmlFor="circulo-alias" style={S.p}>
              Un nombre corto para que las demás personas sepan quién eres.
            </label>
            <input
              id="circulo-alias"
              name="alias"
              type="text"
              maxLength={24}
              value={alias}
              onChange={(e) => {
                setAlias(e.target.value);
                // Editing is the fix. Clear the complaint as soon as they act
                // on it, rather than leaving it under a box they just changed.
                if (aliasError) setAliasError(null);
              }}
              aria-invalid={aliasError ? true : undefined}
              aria-describedby={aliasError ? "alias-error" : undefined}
              placeholder="Por ejemplo, Ana"
              style={{
                display: "block",
                width: "100%",
                maxWidth: "20rem",
                margin: ".4rem 0 .6rem",
                padding: ".7rem",
                borderRadius: ".6rem",
                border: "1px solid #dfe6e0",
                fontSize: "1rem",
              }}
            />
            {aliasError && (
              <p id="alias-error" role="alert" style={S.error}>
                {aliasError}
              </p>
            )}
            <p style={S.aviso} role="note">
              Al aceptar, las personas que participan verán este nombre y que te
              incorporaste. No verán lo que escribas hasta que tú lo confirmes.
              Es sólo el nombre que elegiste: no lo comprobamos, y no hace falta
              que sea el tuyo real.
            </p>
          </section>
        )}

        <p style={S.aviso} role="note">
          Esta invitación sirve una sola vez. Al aceptarla se abre tu sala en
          este dispositivo.
        </p>
        <div style={S.acciones}>
          <button
            type="button"
            style={S.primary}
            onClick={accept}
            disabled={phase === "accepting" || !hidratado}
          >
            {phase === "accepting" ? "Abriendo…" : "Aceptar invitación"}
          </button>
          <button
            type="button"
            style={S.quiet}
            onClick={decline}
            disabled={phase === "accepting" || !hidratado}
          >
            Ahora no
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={S.page}>
      <h1 style={S.h1}>Abre tu invitación</h1>
      <p style={S.p}>
        Si llegaste con un enlace, ábrelo de nuevo desde donde te lo enviaron.
        Si te compartieron un código, escríbelo aquí.
      </p>
      <form
        // El código de invitación es un secreto portador: quien lo tiene entra
        // al círculo. Sin `method`, un envío nativo lo pondría en la URL, y de
        // ahí pasa al historial y a los registros — exactamente el mismo fallo
        // que en las pantallas de acceso, con otro secreto. Ver #727.
        //
        // Este componente además lo guarda en `secretRef` en lugar de en el
        // estado, precisamente para que no acabe donde no debe; dejarlo escapar
        // por el formulario sería deshacer ese cuidado desde el otro lado.
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          const code = manual.trim();
          if (code.length === 0) return;
          setManual("");
          secretRef.current = code;
          // Same rule as the link: a typed code is inspected, never accepted
          // on the person's behalf.
          void inspect(code);
        }}
      >
        <label htmlFor="codigo" style={S.label}>
          Código de invitación
        </label>
        <input
          id="codigo"
          name="codigo"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          style={S.textarea}
        />
        <button type="submit" style={S.primary} disabled={!manual.trim()}>
          Continuar
        </button>
      </form>
    </main>
  );
}

/**
 * Ask the server which activity this session is for.
 *
 * The browser is not told the id by the exchange response and does not get to
 * choose it: it is read back from the session the server just created, which is
 * the same value every later request is checked against.
 */
async function resolveActivity(): Promise<string | null> {
  try {
    const res = await fetch("/api/circulos/sesion/scope", { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as { activityId?: unknown };
    return typeof data.activityId === "string" ? data.activityId : null;
  } catch {
    return null;
  }
}

/**
 * Is this the preview the server promised?
 *
 * The screen renders whatever comes back, so a malformed body must produce the
 * generic wording rather than `undefined` in the middle of a sentence. Checked,
 * not trusted — and never widened to "whatever fields happen to be present",
 * because that is how an id ends up on screen.
 */
function isPreview(value: unknown): value is CircleInvitationPreview {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<CircleInvitationPreview>;
  return (
    typeof p.title === "string" &&
    typeof p.summary === "string" &&
    typeof p.estimatedMinutes === "number" &&
    typeof p.inviterFirstName === "string"
  );
}
