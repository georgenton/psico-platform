"use client";

import { useEffect, useState } from "react";

/**
 * Inline info button that opens a friendly modal explaining what "solo
 * tú puedes verlo" actually means. Replaces the previous "cifrado E2E"
 * copy that most users don't understand.
 *
 * Use it next to any copy that mentions the privacy guarantee (register,
 * login, unlock gates, etc.). The button itself is unobtrusive; the modal
 * uses an analogy (a lockbox with a single key) plus three concrete
 * consequences the user can act on.
 */
export function PrivacyInfoButton({ label = "¿Cómo?" }: { label?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cómo protegemos tu diario"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors"
        style={{
          color: "var(--color-lavender-600)",
          background: "var(--color-lavender-50)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M12 8h.01M11 12h1v5h1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {label}
      </button>

      {open ? <PrivacyModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(30, 20, 50, 0.55)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 24,
          maxWidth: 460,
          width: "100%",
          padding: "32px 28px",
          boxShadow: "0 24px 60px rgba(30, 20, 50, 0.28)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: 42,
            lineHeight: 1,
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          🔒
        </div>
        <h2
          id="privacy-modal-title"
          style={{
            fontSize: 22,
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 12,
            color: "var(--color-warm-900)",
          }}
        >
          Solo tú puedes leer tu diario
        </h2>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--color-warm-700)",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          Piensa en tu diario como una <b>caja fuerte con una llave única</b> —
          tú eres el único que la tiene.
        </p>

        <ul
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginBottom: 24,
            paddingLeft: 0,
            listStyle: "none",
          }}
        >
          <li style={rowStyle}>
            <span style={dotStyle}>🔑</span>
            <span>
              Tu llave se crea con tu contraseña.{" "}
              <b>Nunca sale de tu dispositivo.</b>
            </span>
          </li>
          <li style={rowStyle}>
            <span style={dotStyle}>👀</span>
            <span>
              Ni nuestro equipo puede abrir tu diario. Nosotros solo vemos texto
              revuelto que no significa nada.
            </span>
          </li>
          <li style={rowStyle}>
            <span style={dotStyle}>📝</span>
            <span>
              Si olvidas tu contraseña, nadie puede recuperar lo que escribiste.
              Por eso te daremos una <b>frase de respaldo de 24 palabras</b> la
              primera vez que abras tu diario — guárdala en un lugar seguro.
            </span>
          </li>
        </ul>

        <p
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--color-warm-500)",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          Lo mismo aplica a tus conversaciones con Eco.
        </p>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 600,
            color: "white",
            background: "var(--color-lavender-600)",
            border: "none",
            cursor: "pointer",
          }}
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--color-warm-700)",
};

const dotStyle: React.CSSProperties = {
  fontSize: 20,
  lineHeight: 1,
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: 14,
  background: "var(--color-lavender-50)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
