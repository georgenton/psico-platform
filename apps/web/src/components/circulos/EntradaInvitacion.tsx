"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * `/i#token` — the door.
 *
 * The invitation secret arrives in the URL FRAGMENT, and the fragment is the
 * only part of a URL a browser never puts on the wire: it is not in the request
 * line, so it reaches no access log, no proxy, no CDN and no `Referer` header.
 * That property is worth nothing if the page then copies it somewhere durable,
 * so this component's whole job is to move it from the fragment into a POST
 * body and leave no other trace:
 *
 *   1. read `location.hash` exactly once, on mount;
 *   2. keep it in a ref — never in React state, because state is what gets
 *      serialised into the RSC payload and rendered into the HTML;
 *   3. erase it from the address bar with `history.replaceState` BEFORE any
 *      network call, so a screenshot, a shoulder, or a "share this tab" never
 *      catches it, and `replaceState` rather than `pushState` so Back cannot
 *      return to a URL that still holds it;
 *   4. POST it same-origin to the one Route Handler that may spend it;
 *   5. clear the ref and navigate.
 *
 * It is never written to `localStorage`, `sessionStorage`, a JS-readable
 * cookie, a query string, an analytics call or a log line. The `catch` blocks
 * below report failures without their cause for the same reason: an error
 * string that quotes the token is the token, in a log.
 */

type Phase = "reading" | "ready" | "exchanging" | "error";

export function EntradaInvitacion() {
  const router = useRouter();
  const secretRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("reading");
  const [manual, setManual] = useState("");
  const [hadFragment, setHadFragment] = useState(false);

  useEffect(() => {
    // `window.location.hash` includes the leading "#".
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const secret = raw.trim();

    if (secret.length > 0) {
      secretRef.current = secret;
      setHadFragment(true);
      // Erase it before anything else can observe it. `pathname + search`
      // without the hash; `search` is preserved because the fragment is the
      // only part that ever carried a secret.
      const clean = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", clean);
    }
    setPhase("ready");
  }, []);

  const exchange = useCallback(
    async (secret: string) => {
      setPhase("exchanging");
      try {
        const res = await fetch("/api/circulos/sesion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret }),
        });
        // Whatever happened, the secret's job is done.
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
    },
    [router],
  );

  // Auto-exchange when the link carried a fragment: the person already chose to
  // open it, and making them press a second button only keeps the secret alive
  // in memory for longer. Consent to PARTICIPATE is asked for in the room,
  // before anything is written — accepting the invitation only opens the door.
  useEffect(() => {
    if (phase === "ready" && secretRef.current) {
      void exchange(secretRef.current);
    }
  }, [phase, exchange]);

  if (phase === "exchanging" || (phase === "reading" && hadFragment)) {
    return (
      <p role="status" aria-live="polite" style={S.status}>
        Abriendo tu invitación…
      </p>
    );
  }

  if (phase === "error") {
    return (
      <div role="alert" aria-live="assertive" style={S.panel}>
        <h1 style={S.h1}>Este enlace ya no sirve</h1>
        <p style={S.p}>
          Puede haber caducado, haberse usado ya, o no ser válido. Pídele a la
          persona que te invitó que te envíe uno nuevo.
        </p>
        <a href="/" style={S.link}>
          Ir al inicio
        </a>
      </div>
    );
  }

  return (
    <div style={S.panel}>
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
          void exchange(code);
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
          style={S.input}
        />
        <button type="submit" style={S.primary} disabled={!manual.trim()}>
          Continuar
        </button>
      </form>
    </div>
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

const S: Record<string, React.CSSProperties> = {
  panel: {
    maxWidth: "34rem",
    margin: "0 auto",
    padding: "2rem 1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  status: { padding: "2rem 1.25rem", textAlign: "center", color: "#4a4a52" },
  h1: { fontSize: "1.4rem", lineHeight: 1.3, margin: 0 },
  p: { margin: 0, lineHeight: 1.6, color: "#4a4a52" },
  label: { display: "block", marginBottom: ".4rem", fontWeight: 600 },
  input: {
    width: "100%",
    minHeight: "44px",
    padding: ".6rem .75rem",
    borderRadius: ".5rem",
    border: "1px solid #cfcfd6",
    fontSize: "1rem",
  },
  primary: {
    marginTop: ".75rem",
    minHeight: "44px",
    padding: ".7rem 1.2rem",
    borderRadius: ".5rem",
    border: "none",
    background: "#4c5f4a",
    color: "#fff",
    fontSize: "1rem",
    cursor: "pointer",
  },
  link: { color: "#4c5f4a" },
};
