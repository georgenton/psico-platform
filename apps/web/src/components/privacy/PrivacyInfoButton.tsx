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
export function PrivacyInfoButton({
  label = "¿Cómo?",
  variant = "basic",
}: {
  label?: string;
  /**
   * "basic" — the short lockbox explanation (register / login / Eco).
   * "diario" — adds two extra sections used at the diary unlock gate and in
   * Ajustes → Seguridad: (a) the key is your account password, and (b) why
   * YOU decide between "recordar en este dispositivo" and "pedir cada vez".
   */
  variant?: "basic" | "diario";
}) {
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

      {open ? (
        <PrivacyModal variant={variant} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function PrivacyModal({
  variant,
  onClose,
}: {
  variant: "basic" | "diario";
  onClose: () => void;
}) {
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
              Por eso te daremos una <b>frase de respaldo de 12 palabras</b> la
              primera vez que abras tu diario — guárdala en un lugar seguro.
            </span>
          </li>
        </ul>

        <p
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--color-warm-500)",
            marginBottom: variant === "diario" ? 24 : 20,
            textAlign: "center",
          }}
        >
          Lo mismo aplica a tus conversaciones con Eco.
        </p>

        {variant === "diario" ? (
          <>
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>🔑 Es tu misma contraseña</h3>
              <p style={sectionBodyStyle}>
                La llave de tu diario se crea con{" "}
                <b>la misma contraseña con la que inicias sesión</b>. No tienes
                que recordar una clave aparte. Si cambias tu contraseña desde
                Seguridad, tu diario se vuelve a proteger con la nueva —
                automáticamente.
              </p>
            </div>

            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>🤝 Tú decides: recordar o pedir</h3>
              <p style={sectionBodyStyle}>
                Como <b>nadie más que tú</b> puede abrir tu diario (ni
                nosotros), también eres tú quien decide qué tan cómodo o qué tan
                estricto quieres que sea:
              </p>
              <ul
                style={{
                  margin: "10px 0 0",
                  paddingLeft: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <li style={rowStyle}>
                  <span style={dotStyle}>💾</span>
                  <span>
                    <b>Recordar en este dispositivo:</b> abres tu diario sin
                    escribir la contraseña cada vez. Cómodo para tu teléfono o
                    computadora personal.
                  </span>
                </li>
                <li style={rowStyle}>
                  <span style={dotStyle}>🔒</span>
                  <span>
                    <b>Pedir cada vez:</b> te pedimos la contraseña en cada
                    sesión. Ideal en equipos compartidos o prestados.
                  </span>
                </li>
              </ul>
              <p style={{ ...sectionBodyStyle, marginTop: 12 }}>
                Puedes cambiar esto cuando quieras en <b>Ajustes → Seguridad</b>
                , y bloquear tu diario al instante si prestas tu equipo.
                Recordarlo es tan seguro como tu propia sesión: si alguien más
                usa tu dispositivo desbloqueado, podría verlo — por eso la
                decisión es tuya.
              </p>
            </div>
          </>
        ) : null}

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

const sectionStyle: React.CSSProperties = {
  borderTop: "1px solid var(--color-warm-100)",
  paddingTop: 18,
  marginBottom: 18,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "var(--color-warm-900)",
  marginBottom: 8,
};

const sectionBodyStyle: React.CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.55,
  color: "var(--color-warm-700)",
  margin: 0,
};
