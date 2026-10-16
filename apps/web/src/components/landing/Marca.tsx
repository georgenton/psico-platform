/**
 * La marca FeelVerse · ruta A · Open Verse.
 *
 * Geometría tomada de `docs/design/themes/brand.js`, que la fija como
 * definitiva: dos planos de página que se abren hacia fuera, y la apertura ES
 * la V del nombre. Regla de uso que viene con ella: plano, una sola tinta, sin
 * perspectiva, sin inclinación, sin sombra ni degradado. El tema sólo cambia la
 * tinta, no el símbolo; no hay variantes de logo por tema.
 *
 * El nombre canónico es FeelVerse, con F y V mayúsculas. Nunca «Feel Verse»,
 * «Psico» ni «PsicoContent».
 *
 * Son dos trazados, no dos logos: a 20 px o menos se usa la variante óptica,
 * con el canal central y los planos engrosados, porque si no la apertura se
 * cierra visualmente a tamaños pequeños.
 */

/** Trazado normal — por encima de 20 px. */
const PLANOS = [
  "M22 34 L5 24 L5 14 L22 26 Z",
  "M26 34 L43 24 L43 14 L26 26 Z",
] as const;

/** Variante óptica — 20 px o menos. */
const PLANOS_PEQUENOS = [
  "M21.5 35 L4 24.5 L4 12.5 L21.5 25 Z",
  "M26.5 35 L44 24.5 L44 12.5 L26.5 25 Z",
] as const;

/**
 * Sólo el símbolo. Es decorativo: el nombre accesible lo aporta el lockup, o un
 * `aria-label` explícito donde el símbolo vaya suelto.
 */
export function SimboloMarca({
  tamano = 20,
  pequeno,
}: {
  tamano?: number;
  pequeno?: boolean;
}) {
  const optico = pequeno ?? tamano <= 20;
  const trazados = optico ? PLANOS_PEQUENOS : PLANOS;
  return (
    <span
      className="fv-mark"
      style={{ width: `${tamano}px`, height: `${tamano}px` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48">
        {trazados.map((d) => (
          <path key={d} fill="currentColor" d={d} />
        ))}
      </svg>
    </span>
  );
}

/**
 * Símbolo más nombre: la firma accesible de la marca.
 *
 * El texto «FeelVerse» es texto real —seleccionable y legible por lector de
 * pantalla—, no una imagen. La V va en su propio `span` porque la hoja de
 * estilos de marca la trata aparte.
 */
export function Lockup({
  tamano = 18,
  invertido,
}: {
  tamano?: number;
  invertido?: boolean;
}) {
  return (
    <span
      className={invertido ? "fv-lockup fv-lockup-inv" : "fv-lockup"}
      style={{ fontSize: `${tamano}px` }}
    >
      <SimboloMarca tamano={Math.round(tamano * 1.25)} pequeno={tamano <= 15} />
      <span className="fv-wm">
        Feel<span>V</span>erse
      </span>
    </span>
  );
}
