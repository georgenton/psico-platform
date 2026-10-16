/**
 * Genera `src/components/landing/sprite-iconos.ts` desde la referencia.
 *
 * La landing aprobada lleva su iconografía como un sprite SVG en línea: 23
 * símbolos `<symbol id="i-…">` a los que el marcado apunta con
 * `<use href="#i-…">`. Se extrae de la referencia en vez de transcribirse,
 * por el mismo motivo que la hoja de estilos.
 *
 * El sprite se inyecta con `dangerouslySetInnerHTML`, así que NO hace falta
 * convertir los atributos a su forma JSX (`stroke-width` y compañía). Es
 * contenido propio del repositorio, no entrada de usuario.
 *
 *   node scripts/landing/generar-sprite.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ORIGEN = resolve(
  process.argv[2] ??
    join(AQUI, "..", "..", "..", "..", "docs", "design", "web-publica-f2-1", "FeelVerse-Home-F2-1.html"),
);
const DESTINO = resolve(
  process.argv[3] ?? join(AQUI, "..", "..", "src", "components", "landing", "sprite-iconos.ts"),
);

const html = await readFile(ORIGEN, "utf8");

const sprite = html.match(/<svg width="0" height="0"[^>]*>([\s\S]*?)<\/svg>/);
if (!sprite) {
  throw new Error(`no encontré el sprite de iconos en ${ORIGEN}`);
}

const simbolos = sprite[1].trim();
const ids = [...simbolos.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
if (ids.length === 0) throw new Error("el sprite no contiene símbolos");

// Un backtick o un `${` dentro del SVG rompería la plantilla al escribirla.
if (/[`]|\$\{/.test(simbolos)) {
  throw new Error("el sprite contiene caracteres que romperían la plantilla");
}

const contenido = `/**
 * Sprite de iconos de la landing aprobada F2.1.
 *
 * ARCHIVO GENERADO — no editar a mano.
 * Se regenera con: node scripts/landing/generar-sprite.mjs
 * Fuente: docs/design/web-publica-f2-1/FeelVerse-Home-F2-1.html
 *
 * Son ${ids.length} símbolos; el marcado los usa con <use href="#i-…">.
 */

/** Los identificadores disponibles, sin el prefijo \`i-\`. */
export const ICONOS = [
${ids.map((id) => `  "${id.replace(/^i-/, "")}",`).join("\n")}
] as const;

export type NombreIcono = (typeof ICONOS)[number];

/** El contenido del sprite, para inyectarlo una vez por página. */
export const SPRITE_ICONOS = \`${simbolos}\`;
`;

await writeFile(DESTINO, contenido, "utf8");

// eslint-disable-next-line no-console
console.log(`escrito: ${DESTINO}\n  ${ids.length} símbolos: ${ids.join(", ")}`);
