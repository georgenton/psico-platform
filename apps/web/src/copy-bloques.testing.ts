import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import * as tipos from "@psico/types";
import ts from "typescript";

/**
 * De un fichero al texto que de verdad se pinta, en bloques.
 *
 * Lo usan los trinquetes de copy (`copy-privacidad`, `copy-mapa`). Un bloque es
 * un elemento JSX con texto propio —con sus negritas dentro— o una cadena
 * suelta. Los comentarios no cuentan: citar una frase retirada para explicar
 * por qué se retiró no es volver a decirla. Y las constantes compartidas de
 * `@psico/types` se resuelven a lo que pintan, porque ahí vive buena parte del
 * copy que web y móvil comparten.
 */

export const RAIZ = join(__dirname, "..", "..", "..");

export function ficheros(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) ficheros(p, salida);
    else if (
      /\.tsx?$/.test(e) &&
      !/\.(test|spec|e2e-spec|pg-spec)\.tsx?$/.test(e) &&
      !e.endsWith(".d.ts")
    )
      salida.push(p);
  }
  return salida;
}

// ─── De un fichero a sus bloques de texto ────────────────────────────────────

/** Las constantes de copy de `@psico/types`, resueltas a lo que pintan. */
const CONSTANTES = new Map<string, string>(
  Object.entries(tipos).filter(
    (par): par is [string, string] =>
      typeof par[1] === "string" && /^[A-Z][A-Z0-9_]+$/.test(par[0]),
  ),
);

function textoDe(nodo: ts.Node): string {
  if (ts.isJsxText(nodo)) return nodo.text;
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo))
    return nodo.text;
  if (ts.isIdentifier(nodo)) return CONSTANTES.get(nodo.text) ?? "";
  if (ts.isTemplateExpression(nodo))
    return (
      nodo.head.text +
      nodo.templateSpans
        .map((s) => textoDe(s.expression) + s.literal.text)
        .join("")
    );
  // Los atributos (className, style…) no son texto de la pantalla; los que sí
  // lo son —aria-label, title— se recogen aparte como bloques propios.
  if (ts.isJsxAttributes(nodo)) return "";
  const partes: string[] = [];
  nodo.forEachChild((h) => {
    partes.push(textoDe(h));
  });
  return partes.join(" ");
}

const tieneTextoPropio = (n: ts.Node): boolean =>
  (ts.isJsxElement(n) || ts.isJsxFragment(n)) &&
  n.children.some((c) => ts.isJsxText(c) && c.text.trim().length > 0);

export function bloquesDe(fuente: string, nombre = "muestra.tsx"): string[] {
  const sf = ts.createSourceFile(
    nombre,
    fuente,
    ts.ScriptTarget.Latest,
    true,
    nombre.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
  const bloques: string[] = [];
  const limpio = (t: string) => t.replace(/\s+/g, " ").trim();

  const visitar = (n: ts.Node, dentroDeBloque: boolean): void => {
    if (!dentroDeBloque && tieneTextoPropio(n)) {
      bloques.push(limpio(textoDe(n)));
      // Dentro sólo quedan por recoger los atributos con texto.
      n.forEachChild((h) => visitar(h, true));
      return;
    }
    // `{ECO_PRIVACY_NOTE}` como único hijo: no hay texto propio, pero se pinta.
    if (
      !dentroDeBloque &&
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isIdentifier(n.expression) &&
      CONSTANTES.has(n.expression.text)
    ) {
      bloques.push(limpio(textoDe(n.expression)));
      return;
    }
    const esCadena =
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateExpression(n);
    const esSuma =
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.PlusToken;
    if (
      (esCadena || esSuma) &&
      (!dentroDeBloque || ts.isJsxAttribute(n.parent))
    ) {
      bloques.push(limpio(textoDe(n)));
      return;
    }
    n.forEachChild((h) => visitar(h, dentroDeBloque));
  };
  visitar(sf, false);
  return bloques.filter((b) => b.includes(" "));
}

/** Todos los bloques de los ámbitos pedidos, por ruta relativa a la raíz. */
export function leerBloques(ambitos: readonly string[]): Map<string, string[]> {
  const porFichero = new Map<string, string[]>();
  for (const a of ambitos)
    for (const f of ficheros(join(RAIZ, a)))
      porFichero.set(
        f.slice(RAIZ.length + 1),
        bloquesDe(readFileSync(f, "utf8"), f),
      );
  return porFichero;
}

/** `\b` de JavaScript es ASCII y parte por «tú»: el límite se escribe a mano. */
const L = "a-záéíóúüñ";
export const frase = (alternativas: string) =>
  new RegExp(`(?<![${L}])(?:${alternativas})(?![${L}])`, "i");
