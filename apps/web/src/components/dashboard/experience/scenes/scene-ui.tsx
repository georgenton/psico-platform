/**
 * GR-6 — the visual primitives every scene shares.
 *
 * Not a framework. These are four small components that exist because twelve
 * panels would otherwise repeat the same heading, the same paragraph spacing
 * and the same 44px action row twelve times — and would drift apart the first
 * time one of them was touched.
 *
 * The heading takes focus after a transition. That is the accessibility
 * contract of the whole player: when the panel changes, a screen reader
 * announces the new panel rather than leaving the reader on a button that no
 * longer exists.
 */

import type { CSSProperties, ReactNode } from "react";

export function SceneHeading({
  children,
  headingRef,
}: {
  children: ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <h3 ref={headingRef} tabIndex={-1} style={headingStyle}>
      {children}
    </h3>
  );
}

export function SceneBody({ children }: { children: ReactNode }) {
  return <p style={bodyStyle}>{children}</p>;
}

/** A quieter line: a clarification, never a new claim. */
export function SceneNote({ children }: { children: ReactNode }) {
  return (
    <p style={{ ...bodyStyle, color: "var(--color-warm-500)" }}>{children}</p>
  );
}

export function SceneActions({ children }: { children: ReactNode }) {
  return <div style={actionsStyle}>{children}</div>;
}

/**
 * The one control that moves a person forward.
 *
 * `intent` is the only thing that distinguishes «Continuar» from a
 * confirmation that reaches the ledger, and it is set by the SCENE, not
 * inferred. A presentational panel that wanted to send a command would have to
 * ask for a callback it was never given.
 */
export function SceneAction({
  label,
  onClick,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      type="button"
      className={variant === "primary" ? "btn primary" : "btn ghost"}
      onClick={onClick}
      disabled={disabled}
      style={{ minHeight: 44 }}
    >
      {label}
    </button>
  );
}

const headingStyle: CSSProperties = {
  font: "700 19px/1.3 var(--font-sans)",
  color: "var(--color-warm-900)",
  margin: "0 0 10px",
  outlineOffset: 4,
};

const bodyStyle: CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.65,
  color: "var(--color-warm-700)",
  margin: "0 0 12px",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 18,
};
