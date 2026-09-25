/**
 * QA visual fixture — synthetic reading material.
 *
 * Every word here is written for this file. Nothing is copied from the real
 * catalogue, from anyone's diary, from Eco, or from production: the fixture
 * exists so the reader has *shapes* to render, not so it has content to say.
 * The prose is deliberately neutral — it talks about reading and attention,
 * never about anyone's emotional state — so that a screenshot of a QA book can
 * never be mistaken for a screenshot of a real one.
 *
 * The material is chosen to stress the renderer rather than to be pleasant:
 *
 *   · every block kind the reader can draw (HEADING, PARAGRAPH, QUOTE, PAUSE,
 *     EXERCISE, VIDEO), including the VIDEO placeholder state — a VIDEO block
 *     with no `meta.videoUrl` is exactly what ops sees before the file lands;
 *   · a very long paragraph and a very short one, because wrapping bugs hide
 *     between the two;
 *   · a long unbroken word and a long heading, which are what actually break a
 *     320 px layout;
 *   · accented characters, «angle quotes», an em dash and an ellipsis, because
 *     font fallbacks fail on those first.
 */
import type { ParsedBlock } from "../content-core/lib/test-edition-parser";
import type { BootstrapInput } from "../content-core/bootstrap-book";

/** Forces a horizontal-overflow test in the narrowest viewport. */
const LONG_WORD = "electroencefalografista";

const CHAPTER_ONE: ParsedBlock[] = [
  {
    kind: "HEADING",
    content: "Leer despacio: una aproximación deliberadamente larga al título",
  },
  {
    kind: "PARAGRAPH",
    content:
      "Este capítulo no enseña nada. Existe para que la pantalla tenga algo que dibujar mientras alguien revisa " +
      "si los márgenes respiran, si la tipografía mantiene su ritmo y si el texto sigue siendo legible cuando la " +
      "ventana se estrecha. Si estás leyendo esto en un entorno que no es de pruebas, algo se configuró mal y " +
      "conviene avisar antes de seguir. La frase continúa un poco más de lo necesario, precisamente porque un " +
      "párrafo corto nunca revela un problema de interlineado: los defectos de composición aparecen cuando una " +
      "línea se encuentra con la siguiente muchas veces seguidas y el ojo empieza a perder el renglón.",
  },
  { kind: "PARAGRAPH", content: "Un párrafo corto." },
  {
    kind: "QUOTE",
    content:
      "«Una cita cabe en pocas palabras, y aun así necesita su propio aire».",
  },
  {
    kind: "PARAGRAPH",
    content:
      `Una palabra larga —${LONG_WORD}— sirve para comprobar que el contenedor no empuja la página hacia los ` +
      "lados en un teléfono estrecho… y que los signos poco frecuentes conservan su forma.",
  },
  { kind: "PAUSE", content: "Respira tres veces antes de continuar." },
  {
    kind: "EXERCISE",
    content:
      "Anota una sola frase sobre lo que acabas de leer. No hace falta que sea buena: hace falta que exista, " +
      "para que el campo de escritura tenga contenido que mostrar.",
  },
];

const CHAPTER_TWO: ParsedBlock[] = [
  { kind: "HEADING", content: "Segundo capítulo" },
  {
    kind: "PARAGRAPH",
    content:
      "Un libro de prueba necesita al menos dos capítulos: con uno solo no se ve la navegación entre ellos, ni el " +
      "progreso, ni qué ocurre al llegar al final del último. Este segundo existe para eso.",
  },
  {
    kind: "VIDEO",
    content: "Vídeo de ejemplo (sin archivo asociado)",
    meta: null,
  },
  {
    kind: "PARAGRAPH",
    content:
      "El bloque de arriba no tiene archivo. Debe mostrarse como un reproductor en espera, no como un hueco ni " +
      "como un error: es el mismo estado que ve el equipo de contenidos antes de subir el material definitivo.",
  },
  { kind: "PAUSE", content: "Una pausa más, para cerrar." },
];

const CHAPTER_THREE: ParsedBlock[] = [
  { kind: "HEADING", content: "Capítulo de acceso reservado" },
  {
    kind: "PARAGRAPH",
    content:
      "Este texto pertenece al cuaderno de prueba con acceso reservado. Sirve para revisar cómo se presenta un " +
      "libro que requiere plan de pago: la portada, el aviso de acceso y el punto exacto en que la lectura se " +
      "detiene deben verse cuidados, no improvisados.",
  },
  {
    kind: "QUOTE",
    content: "«El límite también es una pantalla que alguien va a mirar».",
  },
  {
    kind: "EXERCISE",
    content: "Comprueba que el aviso de acceso explica qué sigue, sin regañar.",
  },
];

const CHAPTER_FOUR: ParsedBlock[] = [
  { kind: "HEADING", content: "Cierre del cuaderno reservado" },
  {
    kind: "PARAGRAPH",
    content:
      "Último capítulo del segundo cuaderno. A partir de aquí no hay más texto, que es justo lo que interesa " +
      "revisar: qué ofrece la pantalla cuando ya no queda nada por leer.",
  },
  { kind: "PAUSE", content: "Fin del material de prueba." },
];

export interface FixtureBookSpec {
  slug: string;
  title: string;
  editionLabel: string;
  categorySlug: string;
  /** What the reader must have to open it. Applied after the bootstrap. */
  plan: "FREE" | "PRO";
  chapters: { order: number; title: string; blocks: ParsedBlock[] }[];
}

/** Author and category are synthetic too, and namespaced like everything else. */
export const FIXTURE_AUTHOR_SLUG = "qa-visual-autoria";
export const FIXTURE_AUTHOR_NAME = "Equipo de pruebas visuales";
export const FIXTURE_CATEGORY_SLUG = "qa-visual";

export const FIXTURE_BOOKS: ReadonlyArray<FixtureBookSpec> = [
  {
    slug: "qa-visual-cuaderno-libre",
    title: "Cuaderno de prueba · acceso libre",
    editionLabel: "Edición de pruebas visuales",
    categorySlug: FIXTURE_CATEGORY_SLUG,
    plan: "FREE",
    chapters: [
      { order: 1, title: "Leer despacio", blocks: CHAPTER_ONE },
      { order: 2, title: "Segundo capítulo", blocks: CHAPTER_TWO },
    ],
  },
  {
    slug: "qa-visual-cuaderno-reservado",
    title: "Cuaderno de prueba · acceso reservado",
    editionLabel: "Edición de pruebas visuales",
    categorySlug: FIXTURE_CATEGORY_SLUG,
    plan: "PRO",
    chapters: [
      { order: 1, title: "Acceso reservado", blocks: CHAPTER_THREE },
      { order: 2, title: "Cierre", blocks: CHAPTER_FOUR },
    ],
  },
];

/**
 * Builds exactly the input the fixture hands to `bootstrapBook`. Lives here, in
 * one place, so the test suite can run the real validator over the real object
 * instead of over a second copy that could drift from it.
 *
 * `file` names a source that does not exist on disk: this material is built in
 * code, and the manifest keeps the field only because the shape requires it.
 */
export function buildBootstrapInput(spec: FixtureBookSpec): BootstrapInput {
  return {
    manifest: {
      slug: spec.slug,
      title: spec.title,
      author: FIXTURE_AUTHOR_NAME,
      authorSlug: FIXTURE_AUTHOR_SLUG,
      categorySlug: spec.categorySlug,
      editionLabel: spec.editionLabel,
      sourceQuality: "qa-visual-fixture",
      language: "es",
      chapters: spec.chapters.map((c) => ({
        order: c.order,
        title: c.title,
        file: `${spec.slug}-${c.order}.md`,
      })),
    },
    chapters: spec.chapters.map((c) => ({
      order: c.order,
      title: c.title,
      blocks: c.blocks,
    })),
  };
}
