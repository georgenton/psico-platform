/**
 * FeelVerse · marca — un solo componente para toda la aplicación.
 *
 * El nombre canónico es FeelVerse (F y V mayúsculas). Nunca «Feel Verse»,
 * «Psico» ni «PsicoContent».
 *
 * Logo DEFINITIVO: ruta A · Open Verse. Dos planos de página que se abren
 * hacia fuera; la apertura es la V del nombre. Plano, una tinta, sin
 * perspectiva, sin inclinación, sin sombra ni degradado.
 *
 * ── Por qué es un componente y no el script del prototipo ─────────────────
 *
 * El archivo de diseño trae `brand.js`, que crea `window.FV`, inyecta un
 * sprite SVG en el `<body>` y escribe `document.title`. Eso monta la marca
 * manipulando el documento entero: en esta aplicación rompería el renderizado
 * en servidor, duplicaría el sprite en cada navegación del App Router y
 * pelearía con los metadatos de Next. La GEOMETRÍA es lo aprobado y es lo que
 * se traslada; el mecanismo de montaje es el que ya tiene el proyecto.
 *
 * No hay selector de logos ni variantes por theme: el theme sólo cambia la
 * tinta, a través de `--fv-brand-ground`.
 */

/** Geometría aprobada — viewBox 0 0 48 48. */
const MARK = (
  <>
    <path fill="currentColor" d="M22 34 L5 24 L5 14 L22 26 Z" />
    <path fill="currentColor" d="M26 34 L43 24 L43 14 L26 26 Z" />
  </>
);

/**
 * Variante óptica ≤20 px: misma construcción, canal central y planos
 * engrosados para que la apertura no se cierre a 16 px. No es otro logo.
 */
const MARK_SM = (
  <>
    <path fill="currentColor" d="M21.5 35 L4 24.5 L4 12.5 L21.5 25 Z" />
    <path fill="currentColor" d="M26.5 35 L44 24.5 L44 12.5 L26.5 25 Z" />
  </>
);

/**
 * Sólo el símbolo. Decorativo: el nombre accesible lo aporta el lockup, o un
 * `aria-label` explícito en el contenedor cuando el símbolo va suelto.
 */
export function FeelVerseMark({
  size = 20,
  small,
  className,
}: {
  readonly size?: number;
  readonly small?: boolean;
  readonly className?: string;
}) {
  const optical = small ?? size <= 20;
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        flex: "none",
        width: size,
        height: size,
        lineHeight: 0,
        color: "currentColor",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        style={{ display: "block", width: "100%", height: "100%" }}
      >
        {optical ? MARK_SM : MARK}
      </svg>
    </span>
  );
}

/**
 * Símbolo + wordmark. Es la firma accesible de la marca: el texto
 * «FeelVerse» es real, seleccionable y legible por lector de pantalla.
 *
 * La tipografía del wordmark NO cambia con el theme — eso serían dos
 * wordmarks. Familia y peso quedan fijos aquí; del theme sólo hereda la tinta.
 */
export function FeelVerseLockup({
  size = 18,
  inverted,
  className,
}: {
  readonly size?: number;
  readonly inverted?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5em",
        lineHeight: 1,
        whiteSpace: "nowrap",
        fontSize: size,
        color: inverted ? "inherit" : undefined,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          color: inverted ? "inherit" : "var(--fv-brand-ground)",
        }}
      >
        <FeelVerseMark size={Math.round(size * 1.25)} small={size <= 15} />
      </span>
      <span
        style={{
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontWeight: 600,
          fontSize: "1em",
          letterSpacing: "-0.025em",
          color: inverted ? "inherit" : "var(--fv-text)",
        }}
      >
        Feel<span style={{ letterSpacing: "-0.045em" }}>V</span>erse
      </span>
    </span>
  );
}

/**
 * Marca sobre tinta llena: splash, icono de aplicación, avatar social.
 *
 * Usa `--fv-brand-solid`, no `--fv-brand-ground`: ground es tinta de primer
 * plano y noche la invierte a claro, lo que dejaría la marca blanca sobre un
 * tile claro. El fondo del icono es invariable al modo, que además es lo
 * correcto — un icono de aplicación es un recurso exportado fijo.
 */
export function FeelVerseAppIcon({
  size = 64,
  className,
}: {
  readonly size?: number;
  readonly className?: string;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label="FeelVerse"
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        background: "var(--fv-brand-solid)",
        color: "#fff",
        borderRadius: "22%",
      }}
    >
      <FeelVerseMark size={Math.round(size * 0.52)} small={false} />
    </span>
  );
}

/**
 * El favicon, como data-URI de una sola tinta.
 *
 * Se exporta como función pura para que la use `metadata` de Next en lugar de
 * escribir un `<link>` en el documento desde el cliente.
 */
export function feelVerseFaviconHref(color = "#2A2420"): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="${color}">` +
    `<path d="M21.5 35 L4 24.5 L4 12.5 L21.5 25 Z"/>` +
    `<path d="M26.5 35 L44 24.5 L44 12.5 L26.5 25 Z"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
