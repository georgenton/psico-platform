"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { estilos as S } from "./estilos";

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

export function EntradaInvitacion() {
  const router = useRouter();
  const secretRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("reading");
  const [manual, setManual] = useState("");

  /** Check the link without spending it. Never creates a session. */
  const inspect = useCallback(async (secret: string) => {
    setPhase("inspecting");
    try {
      const res = await fetch("/api/circulos/inspeccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        secretRef.current = null;
        setPhase("error");
        return;
      }
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
    setPhase("accepting");
    try {
      const res = await fetch("/api/circulos/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      // Spent or refused, the secret's job is done either way.
      secretRef.current = null;

      if (!res.ok) {
        setPhase("error");
        return;
      }
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
  }, [router]);

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
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Te invitaron a una actividad</h1>
        <p style={S.p}>
          Es una actividad para dos: cada quien se prepara por su lado y después
          decide qué compartir. Nadie ve nada tuyo hasta que tú lo confirmes.
        </p>
        <p style={S.aviso} role="note">
          Esta invitación sirve una sola vez. Al aceptarla se abre tu sala en
          este dispositivo.
        </p>
        <div style={S.acciones}>
          <button
            type="button"
            style={S.primary}
            onClick={accept}
            disabled={phase === "accepting"}
          >
            {phase === "accepting" ? "Abriendo…" : "Aceptar invitación"}
          </button>
          <button
            type="button"
            style={S.quiet}
            onClick={decline}
            disabled={phase === "accepting"}
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
