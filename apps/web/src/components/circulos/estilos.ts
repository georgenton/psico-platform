import type { CSSProperties } from "react";

/**
 * The room's visual primitives.
 *
 * Inline styles rather than a new stylesheet or a CSS framework: the rest of
 * this app styles its dashboard surfaces the same way, and the guest room is
 * the one place a third-party stylesheet must never be fetched — a strict CSP
 * with no external origins is easier to hold when the page asks for nothing.
 *
 * Two things here are requirements, not taste: every interactive control is at
 * least 44px tall (a thumb target on a phone) and text sits on backgrounds that
 * clear WCAG AA. The palette is the one FeelVerse already uses elsewhere.
 */
export const estilos: Record<string, CSSProperties> = {
  page: {
    maxWidth: "38rem",
    margin: "0 auto",
    padding: "1.25rem 1rem 4rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    color: "#26262b",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: ".85rem",
    padding: "1.1rem",
    borderRadius: ".75rem",
    background: "#fbfaf8",
    border: "1px solid #e6e3dd",
  },
  h1: { fontSize: "1.45rem", lineHeight: 1.3, margin: 0 },
  h2: { fontSize: "1.15rem", lineHeight: 1.35, margin: 0 },
  p: { margin: 0, lineHeight: 1.65, color: "#3d3d45" },
  aviso: {
    margin: 0,
    padding: ".8rem .9rem",
    borderRadius: ".5rem",
    background: "#f2efe6",
    border: "1px solid #ddd6c4",
    lineHeight: 1.6,
    color: "#3d3a2f",
  },
  fieldset: { border: "none", padding: 0, margin: 0 },
  legend: { fontWeight: 600, padding: 0, marginBottom: ".5rem" },
  radioRow: {
    display: "flex",
    alignItems: "center",
    gap: ".6rem",
    minHeight: "44px",
    lineHeight: 1.5,
    cursor: "pointer",
  },
  radio: { width: "1.1rem", height: "1.1rem", flexShrink: 0 },
  field: { margin: 0, display: "flex", flexDirection: "column", gap: ".35rem" },
  label: { fontWeight: 600 },
  textarea: {
    width: "100%",
    padding: ".6rem .7rem",
    borderRadius: ".5rem",
    border: "1px solid #cfcbc2",
    fontSize: "1rem",
    lineHeight: 1.55,
    fontFamily: "inherit",
    resize: "vertical",
  },
  counter: { fontSize: ".85rem", color: "#6b6b75", alignSelf: "flex-end" },
  acciones: {
    display: "flex",
    flexWrap: "wrap",
    gap: ".6rem",
    marginTop: ".25rem",
  },
  primary: {
    minHeight: "44px",
    padding: ".7rem 1.15rem",
    borderRadius: ".5rem",
    border: "none",
    background: "#4c5f4a",
    color: "#ffffff",
    fontSize: "1rem",
    cursor: "pointer",
  },
  secondary: {
    minHeight: "44px",
    padding: ".7rem 1.15rem",
    borderRadius: ".5rem",
    border: "1px solid #4c5f4a",
    background: "#ffffff",
    color: "#33402f",
    fontSize: "1rem",
    cursor: "pointer",
  },
  quiet: {
    minHeight: "44px",
    padding: ".7rem 1rem",
    borderRadius: ".5rem",
    border: "1px solid #cfcbc2",
    background: "transparent",
    color: "#4a4a52",
    fontSize: "1rem",
    cursor: "pointer",
  },
  cita: {
    margin: 0,
    padding: ".75rem .9rem",
    borderLeft: "3px solid #b9c4b3",
    background: "#ffffff",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  turno: { margin: 0, lineHeight: 1.65, color: "#3d3d45" },
  error: {
    margin: 0,
    padding: ".8rem .9rem",
    borderRadius: ".5rem",
    background: "#f6ebe9",
    border: "1px solid #e0c4bf",
    color: "#6a2f26",
    lineHeight: 1.6,
  },
};
