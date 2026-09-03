import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ingestUnitV2, type IngestUnitParams } from "./ingest-v2";
import { resolveEnvironment } from "../shared/psico-environment";
import { unitKeyFromLegacyChapterId } from "./lib/block-key";

/**
 * Content Core — ingesta reproducible de UNA unidad desde un payload construido.
 *
 *   node dist/content-core/unit-ingest-cli.js --payload=<path>           # dry-run
 *   node dist/content-core/unit-ingest-cli.js --payload=<path> --apply   # escribe
 *
 * El wrapper mínimo que faltaba: `ingestUnitV2` existe desde CC-5, pero no había
 * forma de invocarlo para un capítulo concreto sin escribir un script suelto cada
 * vez. Esto lo hace repetible y, sobre todo, verificable antes de escribir.
 *
 * ── Por qué resuelve los identificadores en vez de leerlos ──────────────────
 *
 * El payload trae `editionKey` (estable, nombra el LIBRO) y `unitKey`. El
 * `unitKey`, en cambio, es `uuidv5(Chapter.id)` sobre un cuid aleatorio: el mismo
 * libro ingerido en dos bases da claves distintas. Medido, no supuesto (#639).
 * Así que aquí el `editionId` se resuelve por `editionKey` EN EL ENTORNO DESTINO,
 * y el `unitKey` del fichero solo se acepta si esa edición realmente lo tiene.
 * Un payload construido contra otra base falla en vez de escribir en la unidad
 * equivocada.
 *
 * ── Qué le pasa al lector después ───────────────────────────────────────────
 *
 * Este CLI se negaba a aplicar sobre una unidad con capítulo legado detrás,
 * porque el lector servía `ChapterBlock` y la ingesta no los escribe: publicar
 * habría dejado Content Core con el texto nuevo y la página con el viejo.
 *
 * Ya no. El lector sigue la regla del espejo: el capítulo legado responde solo
 * mientras todos los bloques publicados conserven `legacyBlockId`, y esta
 * ingesta acuña bloques que no lo tienen. Así que el plan ya no avisa de una
 * divergencia — informa del traspaso, que es lo que de verdad ocurre.
 *
 * `READER_WOULD_DIVERGE` se conserva exportado y sin usar a propósito: fue el
 * motivo por el que C01 no se publicó en su momento, y borrar el nombre haría
 * ilegible ese episodio en los registros.
 *
 * stdout lleva SOLO métricas e identificadores — nunca texto del capítulo.
 * Códigos de salida: 0 ok · 1 rechazado/fallido.
 */

export const UNIT_INGEST_FORBIDDEN = "UNIT_INGEST_FORBIDDEN_WITHOUT_OPT_IN";
export const READER_WOULD_DIVERGE = "READER_WOULD_SERVE_STALE_LEGACY_BLOCKS";

export interface UnitIngestArgs {
  payloadPath: string;
  apply: boolean;
}

export function parseUnitIngestArgs(argv: string[]): UnitIngestArgs {
  let payloadPath = "";
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--dry-run") apply = false;
    else if (a.startsWith("--payload=")) payloadPath = a.slice(10);
    else if (a === "--payload") payloadPath = argv[++i] ?? "";
  }
  if (!payloadPath) throw new Error("MISSING_PAYLOAD");
  return { payloadPath, apply };
}

/** Mismo umbral que el bootstrap: escribir en una caja desplegada se pide aparte. */
export function assertUnitIngestAllowed(env: {
  ALLOW_CONTENT_CORE_UNIT_INGEST?: string;
}): void {
  const environment = resolveEnvironment();
  const deployed = environment === "production" || environment === "staging";
  if (deployed && env.ALLOW_CONTENT_CORE_UNIT_INGEST !== "on") {
    throw new Error(UNIT_INGEST_FORBIDDEN);
  }
}

export interface PayloadFile {
  editionKey: string;
  unitKey: string;
  title: string;
  summary?: string | null;
  durationMinutes?: number | null;
  placement: {
    order: number;
    partNumber: number | null;
    partTitle: string | null;
  };
  blocks: { kind: string; content: string; meta?: unknown }[];
}

export function validatePayloadShape(p: PayloadFile): void {
  if (!p.editionKey) throw new Error("PAYLOAD_MISSING_EDITION_KEY");
  if (!p.unitKey) throw new Error("PAYLOAD_MISSING_UNIT_KEY");
  if (!p.title) throw new Error("PAYLOAD_MISSING_TITLE");
  if (!Array.isArray(p.blocks) || p.blocks.length === 0)
    throw new Error("PAYLOAD_NO_BLOCKS");
  if (typeof p.placement?.order !== "number")
    throw new Error("PAYLOAD_MISSING_PLACEMENT_ORDER");
}

export interface UnitIngestPlan {
  editionId: string;
  editionKey: string;
  unitKey: string;
  contentUnitId: string;
  publishedRevisionNumber: number | null;
  currentBlocks: number;
  incomingBlocks: number;
  legacyBackedChapterId: string | null;
  /** Quién servirá el texto de esta unidad EN CUANTO se aplique la ingesta. */
  readerSourceAfterIngest: "content-core" | "legacy";
}

/**
 * Lo comprobable sin escribir. Se ejecuta igual en dry-run y en apply: un plan
 * que solo corre en dry-run no es una comprobación, es una demostración.
 */
export async function planUnitIngest(
  prisma: PrismaClient,
  payload: PayloadFile,
): Promise<UnitIngestPlan> {
  validatePayloadShape(payload);

  const edition = await prisma.edition.findUnique({
    where: { editionKey: payload.editionKey },
    select: { id: true, slug: true, publishedRevisionId: true },
  });
  if (!edition) throw new Error("EDITION_NOT_FOUND");

  const unit = await prisma.contentUnit.findFirst({
    where: { editionId: edition.id, unitKey: payload.unitKey },
    select: { id: true },
  });
  if (!unit) throw new Error("UNIT_KEY_NOT_IN_THIS_EDITION");

  const published = edition.publishedRevisionId
    ? await prisma.revision.findUnique({
        where: { id: edition.publishedRevisionId },
        select: { number: true },
      })
    : null;
  if (!published) throw new Error("INGEST_REQUIRES_BASE_REVISION");

  const currentBlocks = await prisma.blockVersion.count({
    where: {
      unitVersion: {
        manifestEntries: {
          some: { revisionId: edition.publishedRevisionId!, unitId: unit.id },
        },
      },
    },
  });

  // ¿Hay un capítulo legado respaldando esta unidad? Es exactamente la regla que
  // usa el lector (`legacyChaptersByUnitKey`), replicada sobre la misma derivación
  // en vez de sobre una suposición acerca de los nombres.
  const book = await prisma.book.findUnique({
    where: { slug: edition.slug },
    select: { chapters: { select: { id: true } } },
  });
  const legacyBackedChapterId =
    book?.chapters.find(
      (c) => unitKeyFromLegacyChapterId(c.id) === payload.unitKey,
    )?.id ?? null;

  return {
    editionId: edition.id,
    editionKey: payload.editionKey,
    unitKey: payload.unitKey,
    contentUnitId: unit.id,
    publishedRevisionNumber: published.number,
    currentBlocks,
    incomingBlocks: payload.blocks.length,
    legacyBackedChapterId,
    // Los bloques que acuña la ingesta no llevan origen legado, así que la
    // unidad deja de ser espejo y el lector pasa a Content Core. Vale también
    // cuando no hay capítulo detrás: ahí ya servía Content Core.
    readerSourceAfterIngest: "content-core",
  };
}

export async function runUnitIngest(
  prisma: PrismaClient,
  args: UnitIngestArgs,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ plan: UnitIngestPlan; result: unknown | null }> {
  const payload = JSON.parse(
    readFileSync(args.payloadPath, "utf8"),
  ) as PayloadFile;
  const plan = await planUnitIngest(prisma, payload);

  if (!args.apply) return { plan, result: null };

  assertUnitIngestAllowed(env);

  const params: IngestUnitParams = {
    editionId: plan.editionId,
    unitKey: payload.unitKey,
    title: payload.title,
    summary: payload.summary ?? null,
    durationMinutes: payload.durationMinutes ?? null,
    placement: payload.placement,
    blocks: payload.blocks.map((b) => ({
      kind: b.kind,
      content: b.content,
      meta: (b.meta ?? null) as never,
    })),
  };
  const result = await ingestUnitV2(prisma, params);
  return { plan, result };
}

/* c8 ignore start — arranque del proceso */
async function main(): Promise<void> {
  const args = parseUnitIngestArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const { plan, result } = await runUnitIngest(prisma, args);
    console.log(
      JSON.stringify(
        { mode: args.apply ? "apply" : "dry-run", plan, result },
        null,
        2,
      ),
    );
    if (!args.apply && plan.legacyBackedChapterId) {
      console.log(
        `\nAVISO: la unidad tiene detrás el capítulo legado ` +
          `${plan.legacyBackedChapterId}. Aplicar publica la revisión nueva Y ` +
          `traspasa el texto del lector a Content Core, porque los bloques ` +
          `acuñados aquí ya no son espejo de las filas legadas. Esas filas no ` +
          `se tocan: quedan como histórico.`,
      );
    }
    process.exit(0);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) void main();
/* c8 ignore stop */
