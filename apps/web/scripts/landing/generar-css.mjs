/**
 * Genera `src/app/landing.css` desde la referencia aprobada F2.1.
 *
 * Por qué un script y no copiar a mano: son ~60 KB de CSS del diseño aprobado,
 * y la prioridad declarada es fidelidad. Copiado a mano, cada regeneración
 * dependería de que yo no me equivoque; así depende de un archivo.
 *
 * La referencia vive en `docs/design/` —el espejo del proyecto de Claude
 * Design que este repositorio ya mantiene— y es la fuente. Las adaptaciones al
 * producto son CUATRO, están declaradas abajo con su motivo, y el script FALLA
 * si alguna deja de aplicar: así un cambio en la referencia no se cuela
 * silenciosamente.
 *
 *   node scripts/landing/generar-css.mjs
 *   node scripts/landing/generar-css.mjs <refDir> <destino>
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const REF = resolve(process.argv[2] ?? join(AQUI, "..", "..", "..", "..", "docs", "design"));
const DESTINO = resolve(process.argv[3] ?? join(AQUI, "..", "..", "src", "app", "landing.css"));

/**
 * Orden de carga, igual al del prototipo: `themes/core.css` importaba los dos
 * temas y los ambientes, así que aquí van antes que él.
 */
const ORDEN = [
  ["themes/theme-contemporary.css", "tema Contemporary · tokens --fv-*"],
  ["themes/theme-renaissance.css", "tema Renacimiento · tokens --fv-*"],
  ["themes/moods.css", "ambientes · data-mood"],
  ["themes/core.css", "núcleo · espaciado y duraciones"],
  ["themes/brand.css", "marca · Open Verse"],
  ["web-publica-f2-1/home-f1.css", "home F1 · base aprobada"],
  ["web-publica-f2-1/home-f2.css", "home F2 · biblioteca, planes, FAQ y footer"],
  ["web-publica-f2-1/home-f21.css", "home F2.1 · temas, dos alcances y ritmo vertical"],
];

/**
 * Las cuatro adaptaciones. Todas por la misma razón de fondo: en el prototipo
 * el tema vive en `<html>`, y en Next el layout raíz es dueño de `<html>` y
 * `<body>`, así que el atributo pasa al envoltorio `.fh`.
 */
const ADAPTACIONES = [
  {
    archivo: "themes/core.css",
    de: ":root{",
    a: ".fh{",
    motivo: "tokens de espaciado acotados a la landing, para no filtrarlos al panel",
  },
  {
    archivo: "themes/core.css",
    de: "@media (prefers-reduced-motion:reduce){:root{--fv-duration:0ms}}",
    a: "@media (prefers-reduced-motion:reduce){.fh{--fv-duration:0ms}}",
    motivo: "mismo acotado para la duración con movimiento reducido",
  },
  {
    archivo: "web-publica-f2-1/home-f21.css",
    de: 'html[data-theme="renaissance"] body{background:#FAF8F2}',
    a: '.fh[data-theme="renaissance"]{background:#FAF8F2}',
    motivo: "el fondo lo pinta el envoltorio, no <body>",
  },
  {
    archivo: "web-publica-f2-1/home-f21.css",
    de: '[data-theme="renaissance"] .fh{',
    a: '.fh[data-theme="renaissance"]{',
    motivo: "`.fh` pasa a portar el atributo, así que deja de ser descendiente",
  },
];

const FUENTES =
  '@import url("https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&display=swap");';

/**
 * Devuelve dentro de `.fh` los valores con los que el diseño fue hecho.
 *
 * El prototipo es un HTML suelto, así que se apoya en los valores por omisión
 * del navegador allí donde no fija nada: el margen de un párrafo, el tamaño de
 * un `h3`, la sangría y los topos de una lista. La aplicación importa
 * Tailwind, cuyo preflight los pone a cero, y eso descuadra la referencia sin
 * tocar ni una regla suya. Medido: `.fh-price` perdía sus 16 px de margen
 * arriba y abajo, y cada tarjeta de plan quedaba 32 px más corta.
 *
 * Dos decisiones para que esto no se convierta en un parche que pelea con el
 * diseño:
 *
 * · Va ANTES de las hojas del diseño, y envuelto en `:where()`, que no aporta
 *   especificidad. Así cualquier regla del diseño gana siempre, y esto sólo
 *   actúa donde el diseño no dice nada.
 * · Está acotado a `.fh`: no devuelve nada fuera de la landing, así que el
 *   panel autenticado sigue con el reinicio de Tailwind intacto.
 */
const DEVOLVER_DEFECTOS = `
/* ── Valores del navegador que el diseño da por supuestos ──────────────
   Tailwind los pone a cero en toda la aplicación; aquí vuelven, sólo
   dentro de la landing. No editar para corregir un detalle visual: eso
   va en los ajustes del final.

   La forma del selector no es casual. \`:where(.fh) p\` cuenta como UN
   elemento (0,0,1): lo justo para empatar con el reinicio de Tailwind,
   que también es de elemento, y ganarle por orden de aparición —esta
   hoja se carga después—. Envolverlo todo en \`:where()\` daba (0,0,0) y
   perdía contra el reinicio, que es lo que dejaba los encabezados a
   tamaño heredado. Y cualquier regla del diseño, que va por clase
   (0,1,0), sigue ganando a esto.

   El interlineado y el espaciado de letra de h1/h2/h3 vuelven a
   heredarse por un motivo concreto y medido: globals.css de la
   aplicación trae una regla GLOBAL sin acotar
   —h1,h2,h3,.fv-display{...}— que les fija
   line-height:var(--fv-display-leading) y
   letter-spacing:var(--fv-display-tracking). Dentro de la landing el
   primer token no existe, así que la propiedad queda inválida y cae a
   normal en vez de heredar: el titular de la tarjeta de patrón pasaba
   de 34,1 px de interlineado a 25,3 y perdía dos líneas. Donde el
   diseño fija el valor —.fh-h1, .fh-h2, .fh-foot-col h2— no cambia
   nada, y así se comprobó antes de tocarlo. */
:where(.fh) p,
:where(.fh) blockquote,
:where(.fh) figure,
:where(.fh) dl,
:where(.fh) ul,
:where(.fh) ol{margin-block:1em}
:where(.fh) h1{font-size:2em;margin-block:.67em}
:where(.fh) h2{font-size:1.5em;margin-block:.83em}
:where(.fh) h3{font-size:1.17em;margin-block:1em}
:where(.fh) h4{font-size:1em;margin-block:1.33em}
:where(.fh) h1,
:where(.fh) h2,
:where(.fh) h3,
:where(.fh) h4,
:where(.fh) h5,
:where(.fh) h6{font-weight:bold}
:where(.fh) h1,
:where(.fh) h2,
:where(.fh) h3{line-height:inherit;letter-spacing:inherit}
:where(.fh) ul,
:where(.fh) ol{padding-inline-start:40px}
:where(.fh) ul{list-style:disc outside}
:where(.fh) ol{list-style:decimal outside}
:where(.fh) dd{margin-inline-start:40px}
:where(.fh) b,
:where(.fh) strong{font-weight:bold}
:where(.fh) small{font-size:.8em}
:where(.fh) fieldset{margin-inline:2px;padding:.35em .75em .625em}
:where(.fh) legend{padding-inline:2px}
/* Tailwind quita el subrayado de los enlaces. El diseño lo pone a
   none donde no lo quiere —navegación, botones, pie—, así que devolver
   el valor del navegador sólo afecta a los dos sitios donde la
   referencia SÍ subraya: el enlace de la escena del hero y el salto al
   contenido. Comprobado enlace por enlace antes de tocarlo. */
:where(.fh) a{text-decoration:underline}
:where(.fh) summary{display:list-item}
/* Tailwind pone svg en display:block; el navegador lo trata como
   elemento en línea y el diseño cuenta con eso. La diferencia es el
   hueco del descendente de la línea: el radar del hero medía 168 px de
   alto en el prototipo y 161 aquí, y el del mapa 253 frente a 245. */
:where(.fh) svg{display:inline;vertical-align:baseline}
`;

const partes = [];
const aplicadas = [];

partes.push(`/* ============================================================
   Landing pública · referencia aprobada del 27-09-2026 con su ajuste 2.1
   Proyecto de diseño: Psico Platform Design System
   019e08a5-fedf-77ed-8bcc-e4bcf7210128 · web-publica-f2-1/

   ARCHIVO GENERADO — no editar a mano.
   Se regenera con: node scripts/landing/generar-css.mjs
   Fuente: docs/design/{themes,web-publica-f2-1}/

   Los ajustes propios del producto van en el bloque del final, nunca
   dentro de lo copiado.
   ============================================================ */

/* Tipografías del sistema aprobado: Geist y Geist Mono para texto,
   Newsreader en Contemporary y Source Serif 4 en Renacimiento. Un
   @import tiene que ir primero en el archivo, así que se iza aquí. */
${FUENTES}
${DEVOLVER_DEFECTOS}
`);

for (const [rel, nota] of ORDEN) {
  let css = await readFile(join(REF, rel), "utf8");

  // Los @import de la referencia ya quedan resueltos por el orden de arriba.
  css = css.replace(/@import url\([^)]*\);?/g, (m) => {
    aplicadas.push(`${rel}: @import resuelto por concatenación · ${m.slice(0, 44)}…`);
    return "";
  });

  for (const ad of ADAPTACIONES) {
    if (ad.archivo !== rel) continue;
    if (!css.includes(ad.de)) {
      throw new Error(
        `la adaptación ya no aplica en ${rel}: «${ad.de}». ` +
          `La referencia cambió: revisa el selector antes de regenerar.`,
      );
    }
    css = css.replace(ad.de, ad.a);
    aplicadas.push(`${rel}: «${ad.de.slice(0, 38)}…» → «${ad.a.slice(0, 38)}…» · ${ad.motivo}`);
  }

  partes.push(`\n/* ── ${rel} · ${nota} ── */\n${css.trim()}\n`);
}

partes.push(`
/* ════════════════════════════════════════════════════════════════════
   Ajustes del producto · NO vienen de la referencia

   Van al final y agrupados a propósito: así se ve de un vistazo qué se
   añadió y por qué, sin tener que diferenciarlo dentro de lo copiado.
   ════════════════════════════════════════════════════════════════════ */

/* 1 · Reflujo a 320 CSS px.

   El encargo 2.1 exige comprobar el reflujo citando el criterio del
   W3C, y la referencia no lo cumple: medido con Playwright, a 320 px
   desborda 17 px en Contemporary y en Renacimiento. De 360 px en
   adelante no desborda, así que el ajuste se limita a por debajo.

   Qué desborda, medido en el DOM y no supuesto: la fila de la
   cabecera. A 320 px quedan visibles la marca (119 px), «Entrar»
   (77 px) y el botón de menú, y ese último tiene «min-width:44px» —el
   objetivo táctil del proyecto— mientras su contenido, icono más la
   palabra «Menú», necesita 81. Se comprime a 44 y el texto se sale.

   Suman 277 px, así que caben en 320 apretando sólo esta fila: hueco de
   8 px y 12 de margen lateral dan 317. Se aprieta el espaciado en vez
   de esconder la etiqueta: quitar «Menú» dejaría un icono solo justo en
   el ancho donde más ayuda leerlo, y el objetivo táctil se conserva.

   (El motivo hexagonal del pie también sobresale, pero su pie ya es
   «overflow:hidden», así que está recortado y no empuja el documento.
   Parecía el culpable hasta medirlo.) */
@media (max-width:359px){
  .fh .fh-head-in{gap:8px;padding-left:12px;padding-right:12px}
}

/* 2 · Autoría de la obra.

   La maqueta no mostraba autor porque en septiembre no estaba
   confirmado; el encargo pide mostrarlo «cuando esté verificado», y
   ahora lo está para las tres obras. Toma el tono apagado del resto de
   la tarjeta para no competir con el título. */
.fh .fh-autoria{
  margin:0;
  font-size:14px;
  color:var(--fv-muted);
}
`);

await writeFile(DESTINO, partes.join(""), "utf8");

// eslint-disable-next-line no-console
console.log(`escrito: ${DESTINO}`);
// eslint-disable-next-line no-console
console.log(aplicadas.map((a) => "  · " + a).join("\n"));
