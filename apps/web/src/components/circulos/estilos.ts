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
 * clear WCAG AA.
 *
 * ── Por qué tokens y no hexadecimales ────────────────────────────────────────
 *
 * Los valores eran literales, y eso congelaba estas pantallas en el claro de
 * Contemporary. Las rutas de `dashboard/circulos/*` heredan el armazón del
 * panel, que monta `AmbientThemeApplier`, así que en Noche la página pasa a
 * `#141119` y la superficie a `#211d2e` con tinta `#dad5e8` — mientras esto
 * seguía pintando `#fbfaf8` sobre `#ffffff` con `#26262b`. Una tarjeta clara
 * dentro de un panel oscuro. Y no sólo en Noche: `--bg-page` tiene un tinte
 * distinto en Calma, Enfoque, Energía y en Renaissance, y un literal no sigue
 * a ninguno.
 *
 * Cada valor de abajo es un token del sistema. Los PARES concretos que esta
 * pantalla forma no viven en `lib/design/color-contracts.ts` —ese archivo
 * declara el contrato global y los diez estados— sino que `estilos.test.ts`
 * los DERIVA de este objeto y los mide con la misma maquinaria. Es la
 * diferencia que importa: cambiar un token de aquí cambia lo que se mide, sin
 * tocar la prueba. Peores casos hoy: `--fg-body` 7,04 (sobre `subtle`) ·
 * `--fg-muted` 4,63 (sobre `subtle`) · ACCIÓN 4,88 · ERROR 6,47. Fuera del
 * panel —la sala de invitado, donde hay tema pero no ambiente— ninguno baja
 * de 4,81.
 *
 * Tres tokens se midieron y NO se usan: `--fg-tertiary` da 2,09 sobre tarjeta y
 * `--fg-link` / `--fg-link-strong` caen a 2,30 en Renaissance Noche. Por eso el
 * texto que antes era verde (`#33402f`) pasa a `--fg-body` y la señal verde se
 * queda en el borde, que no promete legibilidad.
 */
export const estilos: Record<string, CSSProperties> = {
  page: {
    maxWidth: "38rem",
    margin: "0 auto",
    padding: "1.25rem 1rem 4rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    color: "var(--fg-body)",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: ".85rem",
    padding: "1.1rem",
    borderRadius: ".75rem",
    background: "var(--bg-surface)",
    border: "1px solid var(--bg-divider)",
  },
  h1: { fontSize: "1.45rem", lineHeight: 1.3, margin: 0 },
  h2: { fontSize: "1.15rem", lineHeight: 1.35, margin: 0 },
  p: { margin: 0, lineHeight: 1.65, color: "var(--fg-body)" },
  aviso: {
    margin: 0,
    padding: ".8rem .9rem",
    borderRadius: ".5rem",
    background: "var(--bg-subtle)",
    border: "1px solid var(--bg-divider)",
    lineHeight: 1.6,
    color: "var(--fg-body)",
  },
  /**
   * A short list inside an `aviso`. Bullets kept, because six situations read
   * as six things to check yourself against — a paragraph would read as one
   * warning to skim past.
   */
  lista: {
    margin: ".5rem 0",
    paddingLeft: "1.2rem",
    display: "flex",
    flexDirection: "column",
    gap: ".3rem",
  },
  listaItem: { lineHeight: 1.55 },
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
    border: "1px solid var(--bg-divider)",
    // El fondo y la tinta van explícitos a propósito. La app no declara
    // `color-scheme`, así que sin valores propios el control mezcla dos
    // fuentes: la caja por defecto del navegador y una tinta que sí sigue al
    // token. Fijar ambos lo deja entero dentro del par declarado.
    //
    // Este control vive HOY sólo en `/compartir/[activityId]` —`SalaDuo` →
    // `PreparacionPrivada`—, que está fuera del panel y por tanto nunca ve un
    // ambiente: medido ahí pinta `#ffffff` con tinta `#574f45`, unos 7,6:1. Si
    // algún día la sala entra al panel, esto ya está preparado para Noche.
    background: "var(--bg-surface)",
    color: "var(--fg-body)",
    fontSize: "1rem",
    lineHeight: 1.55,
    fontFamily: "inherit",
    resize: "vertical",
  },
  counter: {
    fontSize: ".85rem",
    color: "var(--fg-muted)",
    alignSelf: "flex-end",
  },
  /**
   * A short clarification next to the control it clarifies.
   *
   * Quieter than `p` and much quieter than `aviso`, which is a box and reads as
   * a warning. These notes are not warnings — they are the one sentence a
   * person needs to choose correctly, and they earn their place only by being
   * next to the choice.
   *
   * `--fg-muted` se mide contra los tres fondos sobre los que esta nota puede
   * acabar, porque acaba en los tres: dentro de una tarjeta (5,29), dentro de
   * un `aviso` o del panel de ayuda (4,63) y suelta sobre la página (4,98),
   * que es lo que hace `OpinionOpcional` cuando la persona ya respondió. El
   * peor caso sigue por encima de 4,5, así que «más callado» es cuestión de
   * tamaño y peso, no de legibilidad.
   */
  nota: {
    margin: 0,
    fontSize: ".9rem",
    lineHeight: 1.55,
    color: "var(--fg-muted)",
  },
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
    background: "var(--bg-action)",
    color: "var(--fg-on-action)",
    fontSize: "1rem",
    cursor: "pointer",
  },
  secondary: {
    minHeight: "44px",
    padding: ".7rem 1.15rem",
    borderRadius: ".5rem",
    border: "1px solid var(--bg-action)",
    background: "var(--bg-surface)",
    color: "var(--fg-body)",
    fontSize: "1rem",
    cursor: "pointer",
  },
  quiet: {
    minHeight: "44px",
    padding: ".7rem 1rem",
    borderRadius: ".5rem",
    border: "1px solid var(--bg-divider)",
    background: "transparent",
    color: "var(--fg-body)",
    fontSize: "1rem",
    cursor: "pointer",
  },
  /**
   * A help affordance, and it says what it is in words.
   *
   * Not an icon on its own: `ⓘ` is a symbol somebody has to already know, and
   * the people this screen is for are reading it once. Never hover-only
   * either — there is no hover on a phone, which is where most of this will be
   * read.
   */
  ayuda: {
    minHeight: "44px",
    padding: ".6rem .9rem",
    borderRadius: ".5rem",
    border: "1px dashed var(--bg-action)",
    background: "transparent",
    color: "var(--fg-body)",
    fontSize: ".95rem",
    cursor: "pointer",
  },
  ayudaPanel: {
    display: "flex",
    flexDirection: "column",
    gap: ".7rem",
    padding: ".9rem 1rem",
    borderRadius: ".6rem",
    background: "var(--bg-subtle)",
    border: "1px solid var(--bg-divider)",
  },
  ayudaEtiqueta: {
    margin: 0,
    fontSize: ".82rem",
    letterSpacing: ".01em",
    color: "var(--fg-muted)",
  },
  /** Which step of how many. Quiet, and never the main thing on screen. */
  paso: {
    margin: 0,
    fontSize: ".85rem",
    color: "var(--fg-muted)",
  },
  /** The FeelVerse signature. Present, small, and not a banner. */
  firma: {
    margin: 0,
    fontSize: ".8rem",
    letterSpacing: ".02em",
    color: "var(--fg-muted)",
  },
  /** A disclosure that opens in place, with its own summary as the control. */
  detalle: {
    borderRadius: ".5rem",
    border: "1px solid var(--bg-divider)",
    background: "var(--bg-surface)",
    padding: ".2rem .4rem",
  },
  detalleResumen: {
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    padding: ".6rem .5rem",
    cursor: "pointer",
    fontWeight: 600,
    color: "var(--fg-body)",
  },
  cita: {
    margin: 0,
    padding: ".75rem .9rem",
    borderLeft: "3px solid var(--bg-action)",
    background: "var(--bg-surface)",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  turno: { margin: 0, lineHeight: 1.65, color: "var(--fg-body)" },
  error: {
    margin: 0,
    padding: ".8rem .9rem",
    borderRadius: ".5rem",
    background: "var(--bg-surface)",
    border: "1px solid var(--bg-divider)",
    color: "var(--color-error-text)",
    lineHeight: 1.6,
  },
};
