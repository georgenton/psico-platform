import type { CSSProperties } from "react";

/**
 * The shared look of the five practice interactions.
 *
 * Inline styles rather than a stylesheet, to match the rest of the player's
 * scenes. Two rules are load-bearing rather than cosmetic:
 *
 *   - state is never carried by colour alone. Selected controls also change
 *     their border and set `aria-pressed`, so the information survives
 *     greyscale, low vision and a screen reader.
 *   - nothing animates. There is no motion to reduce, which is the simplest
 *     way to honour `prefers-reduced-motion` for this surface.
 */
export const practiceStyles = {
  subheading: {
    margin: "0 0 12px",
    font: "500 15px/1.5 var(--font-sans)",
    color: "var(--color-warm-800)",
  } satisfies CSSProperties,

  hint: {
    margin: "0 0 8px",
    font: "400 13px/1.5 var(--font-sans)",
    color: "var(--color-warm-600)",
  } satisfies CSSProperties,

  list: {
    listStyle: "none",
    margin: "0 0 12px",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  card: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--color-warm-200)",
    background: "var(--color-warm-50)",
  } satisfies CSSProperties,

  position: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    display: "grid",
    placeItems: "center",
    background: "var(--color-warm-200)",
    font: "600 12px/1 var(--font-sans)",
    color: "var(--color-warm-800)",
  } satisfies CSSProperties,

  cardLabel: {
    flex: 1,
    font: "400 14px/1.5 var(--font-sans)",
    color: "var(--color-warm-800)",
  } satisfies CSSProperties,

  cardButtons: { display: "flex", gap: 4 } satisfies CSSProperties,

  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid var(--color-warm-300)",
    background: "white",
    cursor: "pointer",
    font: "500 14px/1 var(--font-sans)",
    color: "var(--color-warm-700)",
  } satisfies CSSProperties,

  ghostButton: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--color-warm-300)",
    background: "transparent",
    cursor: "pointer",
    font: "500 13px/1 var(--font-sans)",
    color: "var(--color-warm-700)",
  } satisfies CSSProperties,

  chip: {
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid var(--color-warm-300)",
    background: "white",
    cursor: "pointer",
    font: "400 13px/1.3 var(--font-sans)",
    color: "var(--color-warm-700)",
    textAlign: "left",
  } satisfies CSSProperties,

  chipSelected: {
    // Border AND weight change too: colour is never the only signal.
    border: "2px solid var(--color-sage-600)",
    background: "var(--color-sage-50)",
    fontWeight: 600,
    color: "var(--color-sage-700)",
  } satisfies CSSProperties,

  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    margin: "0 0 14px",
  } satisfies CSSProperties,

  zone: {
    margin: "0 0 16px",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--color-warm-200)",
  } satisfies CSSProperties,

  feedback: {
    margin: "8px 0 0",
    padding: "10px 12px",
    borderRadius: 10,
    background: "var(--color-sage-50)",
    font: "400 13px/1.6 var(--font-sans)",
    color: "var(--color-warm-800)",
  } satisfies CSSProperties,

  disclaimer: {
    margin: "10px 0 0",
    font: "400 12px/1.6 var(--font-sans)",
    color: "var(--color-warm-600)",
  } satisfies CSSProperties,

  textarea: {
    width: "100%",
    minHeight: 64,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--color-warm-200)",
    font: "400 13px/1.6 var(--font-sans)",
    color: "var(--color-warm-800)",
    resize: "vertical",
  } satisfies CSSProperties,

  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
} as const;
