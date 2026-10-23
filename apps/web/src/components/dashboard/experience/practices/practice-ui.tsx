import type { CSSProperties } from "react";

/**
 * The shared look of the five practice interactions.
 *
 * Inline styles rather than a stylesheet, to match the rest of the player's
 * scenes. Three rules are load-bearing rather than cosmetic:
 *
 *   - state is never carried by colour alone. Selected controls also change
 *     their border and set `aria-pressed`, so the information survives
 *     greyscale, low vision and a screen reader.
 *   - nothing animates. There is no motion to reduce, which is the simplest
 *     way to honour `prefers-reduced-motion` for this surface.
 *   - B4 — every control is at least `TOUCH_TARGET` on both sides. Los de
 *     ordenar medían 30 × 30, y un dedo no mide 30 px: en la escena cuyo
 *     trabajo ES pulsar flechas, ésa era la parte más difícil de usar.
 */

/**
 * El objetivo táctil mínimo de FeelVerse, en píxeles CSS.
 *
 * Un número exportado y no un literal repetido: así una prueba puede medir
 * contra lo mismo que dibuja el componente, y bajarlo en un sitio rompe la
 * prueba en vez de pasar desapercibido.
 */
export const TOUCH_TARGET = 44;
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
    // B4 — con dos controles de 44 px, una tarjeta estrecha ya no da para
    // todo en una línea. Envolver es la respuesta correcta: los controles
    // bajan a su propia fila y la frase recupera el ancho. Lo que NO se hace
    // es volver a encoger el área táctil para que quepa.
    flexWrap: "wrap",
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
    // El tercer número es el que decide cuándo envuelve: por debajo de 180 px
    // la frase deja de poder leerse de un vistazo, y es mejor que los
    // controles pasen abajo que seguir estrechándola.
    flex: "1 1 180px",
    minWidth: 0,
    font: "400 14px/1.5 var(--font-sans)",
    color: "var(--color-warm-800)",
  } satisfies CSSProperties,

  cardButtons: {
    display: "flex",
    gap: 4,
    // Cuando la fila envuelve, los controles se quedan a la derecha en vez de
    // saltar al principio de su línea: el orden visual sigue al de lectura.
    marginLeft: "auto",
  } satisfies CSSProperties,

  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    // `min*` además del tamaño fijo: si algún día el contenedor aprieta, lo
    // que cede es el espacio alrededor, no el área que se pulsa.
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    borderRadius: 8,
    border: "1px solid var(--color-warm-300)",
    // B4 — un token, no `white`.
    //
    // Con el literal, el ambiente Noche dejaba el control casi invisible: el
    // glifo sigue al tema (`--color-warm-700` pasa a claro) y el fondo se
    // quedaba blanco, así que la flecha quedaba a 1,43:1 contra su propio
    // botón. Medido en el navegador, en los dos sistemas visuales. Con el
    // token, el fondo acompaña al glifo y el contraste se sostiene en ambos.
    background: "var(--color-warm-100)",
    cursor: "pointer",
    font: "500 14px/1 var(--font-sans)",
    color: "var(--color-warm-700)",
  } satisfies CSSProperties,

  ghostButton: {
    padding: "8px 14px",
    // La salida declarada de la práctica («ver el ejemplo resuelto») se pulsa
    // tanto como las flechas, y medía unos 31 px de alto.
    minHeight: TOUCH_TARGET,
    borderRadius: 10,
    border: "1px solid var(--color-warm-300)",
    background: "transparent",
    cursor: "pointer",
    font: "500 13px/1 var(--font-sans)",
    color: "var(--color-warm-700)",
  } satisfies CSSProperties,

  chip: {
    padding: "7px 12px",
    // Las opciones de las prácticas de elección, por el mismo motivo.
    minHeight: TOUCH_TARGET,
    borderRadius: 999,
    border: "1px solid var(--color-warm-300)",
    // B4 — un token, no `white`.
    //
    // Con el literal, el ambiente Noche dejaba el control casi invisible: el
    // glifo sigue al tema (`--color-warm-700` pasa a claro) y el fondo se
    // quedaba blanco, así que la flecha quedaba a 1,43:1 contra su propio
    // botón. Medido en el navegador, en los dos sistemas visuales. Con el
    // token, el fondo acompaña al glifo y el contraste se sostiene en ambos.
    background: "var(--color-warm-100)",
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
