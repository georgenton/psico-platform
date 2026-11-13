import { readFileSync, writeFileSync } from "node:fs";

import {
  normalizeUnitPayloadBlocks,
  type PayloadBlock,
} from "./unit-payload-normalize";

/**
 * Del payload que sale del build al payload que la ingesta puede publicar.
 *
 *   node dist/content-core/unit-payload-normalize-cli.js \
 *     --in=artifacts/eec/C01/v1.0/feelverse/unit-payload.json \
 *     --out=/ruta/payload-normalizado.json \
 *     --unit-key=<unitKey de la edición DESTINO>
 *
 * Existe porque entre las dos había un hueco que ninguna de las dos veía, y
 * los dos extremos son verdes por separado: el build entrega el énfasis dentro
 * de `content` —la forma de antes de la reparación del 2026-10-26— y la
 * ingesta escribe lo que le dan. Juntas deshacían la reparación. Medido el
 * 2026-11-13 contra lo que sirve staging: 49 de los 188 bloques del capítulo 1.
 *
 * ── Dos razones para que esto sea un comando y no un `node -e` ──────────────
 *
 * La primera es repetible: una escritura de contenido que sólo sabe hacer quien
 * la hizo no es un procedimiento. La segunda es el `unitKey`, que es el pie que
 * ya tropezó antes (#639): vale `uuidv5(Chapter.id)` sobre un cuid aleatorio,
 * así que **el mismo libro ingerido en dos bases tiene claves distintas** y el
 * del build no sirve para ninguna otra. `--unit-key` lo sustituye de forma
 * explícita y el informe dice que lo hizo; sin la bandera, el payload sale con
 * el del build y `planUnitIngest` lo rechazará con `UNIT_KEY_NOT_IN_THIS_EDITION`
 * en vez de escribir en la unidad equivocada.
 *
 * ── Negativas ───────────────────────────────────────────────────────────────
 *
 * Sale con 1 si algún bloque no se pudo traducir, nombrando el índice y el
 * motivo, y **no escribe el fichero**. Publicar un payload medio normalizado
 * dejaría Markdown en crudo en unas filas y marcas en otras, que es peor que
 * detenerse. `--permitir-negativas` lo escribe igualmente, para el caso
 * declarado en que un bloque se queda como está a propósito — y entonces el
 * informe lleva la lista, porque esa decisión tiene que viajar con el plan.
 *
 * stdout lleva SÓLO cifras, índices y motivos — nunca texto del capítulo.
 */

export interface NormalizeCliArgs {
  inPath: string;
  outPath: string;
  unitKey: string | null;
  allowRefusals: boolean;
}

export function parseNormalizeArgs(argv: string[]): NormalizeCliArgs {
  let inPath = "";
  let outPath = "";
  let unitKey: string | null = null;
  let allowRefusals = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--permitir-negativas") allowRefusals = true;
    else if (a.startsWith("--in=")) inPath = a.slice(5);
    else if (a.startsWith("--out=")) outPath = a.slice(6);
    else if (a.startsWith("--unit-key=")) unitKey = a.slice(11);
    else if (a === "--in") inPath = argv[++i] ?? "";
    else if (a === "--out") outPath = argv[++i] ?? "";
    else if (a === "--unit-key") unitKey = argv[++i] ?? null;
  }
  if (!inPath) throw new Error("MISSING_IN");
  if (!outPath) throw new Error("MISSING_OUT");
  return { inPath, outPath, unitKey, allowRefusals };
}

interface PayloadFile {
  editionKey: string;
  unitKey: string;
  title: string;
  blocks: PayloadBlock[];
  [k: string]: unknown;
}

export interface NormalizeCliReport {
  editionKey: string;
  unitKeyFromBuild: string;
  unitKeyWritten: string;
  unitKeyOverridden: boolean;
  blocks: number;
  normalized: number;
  untouched: number;
  refusals: { index: number; kind: string; blocker: string; detail: string }[];
  wrote: boolean;
}

export function runNormalize(args: NormalizeCliArgs): NormalizeCliReport {
  const payload = JSON.parse(readFileSync(args.inPath, "utf8")) as PayloadFile;
  if (!Array.isArray(payload.blocks) || payload.blocks.length === 0)
    throw new Error("PAYLOAD_NO_BLOCKS");

  const result = normalizeUnitPayloadBlocks(payload.blocks);
  const blocked = result.refusals.length > 0 && !args.allowRefusals;
  const unitKeyWritten = args.unitKey ?? payload.unitKey;

  if (!blocked) {
    writeFileSync(
      args.outPath,
      `${JSON.stringify({ ...payload, unitKey: unitKeyWritten, blocks: result.blocks }, null, 2)}\n`,
      "utf8",
    );
  }

  return {
    editionKey: payload.editionKey,
    unitKeyFromBuild: payload.unitKey,
    unitKeyWritten,
    unitKeyOverridden:
      args.unitKey !== null && args.unitKey !== payload.unitKey,
    blocks: payload.blocks.length,
    normalized: result.normalized,
    untouched: result.untouched,
    refusals: result.refusals,
    wrote: !blocked,
  };
}

/* c8 ignore start — arranque del proceso */
function main(): void {
  const args = parseNormalizeArgs(process.argv.slice(2));
  const report = runNormalize(args);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.wrote ? 0 : 1);
}

if (require.main === module) main();
/* c8 ignore stop */
