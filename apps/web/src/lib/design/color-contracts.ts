import type { Ambient, Theme } from "./resolve-tokens";

/**
 * Los pares de color que SÍ prometen legibilidad.
 *
 * El sistema tiene tres clases de color y el nombre no las distingue:
 *
 *   1. RAMPA — `--color-lavender-500`, `--color-sage-100`. Es un valor. No
 *      promete nada. Sirve para bordes, gráficos, decoración.
 *   2. TOKEN SEMÁNTICO — `--fg-body`, `--bg-page`. Dice su función, pero por sí
 *      solo no dice sobre qué es legible.
 *   3. PAR DECLARADO — lo de esta lista. Un fondo y el primer plano autorizado
 *      encima, con un contraste comprobado en cada estado que el producto puede
 *      producir de verdad.
 *
 * Escribir un componente es elegir un PAR, no dos tokens que suenen bien. Que
 * eso no se pudiera hacer es lo que describía #728: `--bg-action-soft` con
 * `--fg-body` daba 1,32 en Noche, y `--fg-on-brand` sobre `--bg-brand-strong`
 * daba 2,25 — un par que parecía diseñado para ir junto y no lo estaba.
 *
 * Añadir una fila aquí es prometer algo. La prueba la cobra.
 */

export interface ContratoDePar {
  /** Cómo se llama en una conversación sobre diseño. */
  readonly nombre: string;
  /** El token del primer plano, tal cual se escribe en CSS. */
  readonly fg: string;
  /**
   * El fondo. Puede ser un gradiente: entonces se mide contra TODOS sus stops y
   * manda el peor, porque el texto se apoya en todo el recorrido.
   */
  readonly bg: string;
  /**
   * `normal` exige 4,5:1 (1.4.3). `grande` exige 3:1 y sólo vale si el par se
   * usa exclusivamente en texto de 24px, o de 18,66px en negrita.
   */
  readonly tamano: "normal" | "grande";
  /** Dónde vive. Sirve para saber a quién romper si alguien cambia el valor. */
  readonly usadoEn: string;
  /**
   * En qué estados existe este par de verdad.
   *
   * `AmbientThemeApplier` sólo se monta en el armazón del panel, así que un par
   * cuyo único consumidor vive fuera —la pantalla de acceso, Autor, Círculos—
   * nunca ve una clase `amb-*`. Exigirle contraste en `noche` sería inventar un
   * requisito; en el ciclo 11 forcé ambientes donde no llegan y me salieron
   * cuarenta hallazgos que no existían. `alcance` evita repetir eso.
   */
  readonly alcance: "panel" | "fuera" | "ambos";
}

export const CONTRATOS: readonly ContratoDePar[] = [
  {
    nombre: "PÁGINA",
    fg: "var(--fg-body)",
    bg: "var(--bg-page)",
    tamano: "normal",
    usadoEn: "el texto corriente sobre el fondo de la aplicación",
    alcance: "ambos",
  },
  {
    nombre: "PANEL",
    fg: "var(--fg-body)",
    bg: "var(--bg-surface)",
    tamano: "normal",
    usadoEn: "tarjetas y paneles blancos",
    alcance: "ambos",
  },
  {
    nombre: "ACCIÓN",
    fg: "var(--fg-on-action)",
    bg: "var(--bg-action)",
    tamano: "normal",
    usadoEn:
      "el botón principal escrito con el par — «Hazte Pro →» del paywall. " +
      "Compárese con `.btn.primary`, que se rellena con `var(--color-sage-600)` " +
      "a mano: esa rampa SÍ se invierte en Noche y por eso el componente " +
      "necesita su propio override. El par no lo necesita porque se congela " +
      "entero. Mismo verde, dos comportamientos: elegir el par es elegir el " +
      "que promete algo",
    alcance: "ambos",
  },
  {
    nombre: "ACCIÓN SUAVE",
    fg: "var(--fg-on-action-soft)",
    bg: "var(--bg-action-soft)",
    tamano: "normal",
    usadoEn:
      "realces en verde claro. Hoy sólo los pinta el prototipo de lectura " +
      "guiada, que vive fuera del panel: el 1,32 que reportaba DS-02 salía de " +
      "forzarle un ambiente que esa ruta no monta. El par se declara igual, " +
      "porque lo que faltaba era poder decirlo",
    alcance: "ambos",
  },
  {
    nombre: "MARCA SÓLIDA",
    fg: "var(--fg-on-brand)",
    bg: "var(--bg-brand-strong)",
    tamano: "normal",
    usadoEn: "píldoras e iniciales sobre un relleno de marca",
    alcance: "ambos",
  },
  {
    nombre: "SUPERFICIE DE MARCA",
    fg: "var(--fg-on-brand-surface)",
    bg: "var(--bg-brand-surface)",
    tamano: "normal",
    usadoEn:
      "la tarjeta del Mapa, PaywallPro, la recomendación de Eco, avatares",
    alcance: "ambos",
  },
  {
    nombre: "SUPERFICIE DE MARCA · secundario",
    fg: "var(--fg-on-brand-surface-muted)",
    bg: "var(--bg-brand-surface)",
    tamano: "normal",
    usadoEn: "el texto de apoyo dentro de una superficie de marca",
    alcance: "ambos",
  },
  {
    // DS-01 del #728. El issue lo describía como «~2,58 sobre página oscura»,
    // y eso ya no es alcanzable: el token tiene un solo consumidor —el acento
    // de la pantalla de acceso— y ahí la página es clara en los dos estados que
    // esa pantalla produce. Se deja el nombre y se declara el contrato, que es
    // lo que faltaba: «fuerte» no significa «seguro sobre cualquier fondo»,
    // significa legible sobre la página.
    nombre: "ACENTO SOBRE PÁGINA",
    fg: "var(--fg-link-strong)",
    bg: "var(--bg-page)",
    tamano: "normal",
    usadoEn: "el acento de la pantalla de acceso (DS-01 del #728)",
    alcance: "fuera",
  },
  {
    nombre: "ERROR",
    fg: "var(--color-error-text)",
    bg: "var(--bg-surface)",
    tamano: "normal",
    usadoEn: "los avisos de error (#741 — no dejar que se rompa otra vez)",
    alcance: "ambos",
  },
];

/**
 * Los estados que la aplicación puede producir de verdad.
 *
 * `AmbientThemeApplier` sólo se monta en el armazón del panel y se retira al
 * salir, así que fuera del panel NO hay clase de ambiente. Exigir contraste en
 * `renaissance + noche` a una pantalla de acceso sería inventarse un requisito;
 * en el ciclo 11 forcé justamente eso y generé cuarenta hallazgos que no
 * existían.
 */
export const ESTADOS_DEL_PANEL: ReadonlyArray<{
  theme: Theme;
  ambient: Ambient;
}> = [
  { theme: "contemporary", ambient: "calma" },
  { theme: "contemporary", ambient: "enfoque" },
  { theme: "contemporary", ambient: "energia" },
  { theme: "contemporary", ambient: "noche" },
  { theme: "renaissance", ambient: "calma" },
  { theme: "renaissance", ambient: "enfoque" },
  { theme: "renaissance", ambient: "energia" },
  { theme: "renaissance", ambient: "noche" },
];

/** Fuera del panel: tema sí, ambiente no. */
export const ESTADOS_SIN_AMBIENTE: ReadonlyArray<{ theme: Theme }> = [
  { theme: "contemporary" },
  { theme: "renaissance" },
];
