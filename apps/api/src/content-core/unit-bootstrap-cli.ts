import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolveEnvironment } from "../shared/psico-environment";

/**
 * Content Core — alta de UNIDADES en una edición que ya existe.
 *
 *   node dist/content-core/unit-bootstrap-cli.js --plan=<path>           # dry-run
 *   node dist/content-core/unit-bootstrap-cli.js --plan=<path> --apply   # escribe
 *
 * El hueco entre las dos herramientas que ya había. `bootstrap-cli` crea un libro
 * ENTERO (Work + Edition + unidades) y se niega si la edición ya existe;
 * `unit-ingest-cli` escribe el contenido de una unidad pero exige que la unidad
 * YA pertenezca a la edición (`UNIT_KEY_NOT_IN_THIS_EDITION`, que falla cerrada a
 * propósito). Añadir los capítulos 4–10 a una edición publicada no cabía en
 * ninguna de las dos.
 *
 * Esto hace UNA sola cosa: crear la fila `ContentUnit`. No toca el manifiesto, no
 * crea versiones y no escribe un solo bloque — de eso se encarga la ingesta, que
 * ya sabe copiar el manifiesto hacia adelante y AÑADIR una unidad que nunca
 * estuvo (`buildNextManifest`). Separarlo mantiene cada paso reversible por
 * separado: una unidad vacía que nadie publica es invisible para el lector.
 *
 * ── Identidad determinista, no aleatoria ────────────────────────────────────
 *
 * `unitKey` llega en el plan y se COMPRUEBA aquí contra el mismo `uuidv5` que usa
 * el resto de Content Core. Content Studio acuña unidades nativas con
 * `randomUUID()`, que sirve cuando una persona crea un capítulo a mano pero no
 * aquí: un dry-run y su apply darían claves distintas, y repetir el lote crearía
 * unidades duplicadas en vez de reconocer las suyas. Con `uuidv5` el comando es
 * idempotente — vuelto a correr, encuentra lo que creó.
 *
 * stdout lleva SOLO identificadores y conteos — nunca texto del capítulo.
 * Códigos de salida: 0 ok · 1 rechazado/fallido.
 */

export const UNIT_BOOTSTRAP_FORBIDDEN =
  "UNIT_BOOTSTRAP_FORBIDDEN_WITHOUT_OPT_IN";
export const ORDER_TAKEN = "ORDER_OCCUPIED_BY_DIFFERENT_UNIT";
export const EDITION_NOT_FOUND = "EDITION_NOT_FOUND";
export const PLAN_INVALID = "UNIT_BOOTSTRAP_PLAN_INVALID";

export interface PlannedUnit {
  unitId: string;
  unitKey: string;
  order: number;
  partNumber: number | null;
  partTitle: string | null;
  title: string;
}

export interface UnitBootstrapPlan {
  editionKey: string;
  units: PlannedUnit[];
}

export interface UnitBootstrapArgs {
  planPath: string;
  apply: boolean;
}

export function parseUnitBootstrapArgs(argv: string[]): UnitBootstrapArgs {
  let planPath = "";
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--dry-run") apply = false;
    else if (a.startsWith("--plan=")) planPath = a.slice(7);
    else if (a === "--plan") planPath = argv[++i] ?? "";
  }
  if (!planPath) throw new Error("MISSING_PLAN");
  return { planPath, apply };
}

/** Mismo umbral que la ingesta: escribir en una caja desplegada se pide aparte. */
export function assertUnitBootstrapAllowed(env: {
  ALLOW_CONTENT_CORE_UNIT_INGEST?: string;
}): void {
  const environment = resolveEnvironment();
  const deployed = environment === "production" || environment === "staging";
  if (deployed && env.ALLOW_CONTENT_CORE_UNIT_INGEST !== "on") {
    throw new Error(UNIT_BOOTSTRAP_FORBIDDEN);
  }
}

export function parsePlan(raw: unknown): UnitBootstrapPlan {
  const bad = (): never => {
    throw new Error(PLAN_INVALID);
  };
  if (typeof raw !== "object" || raw === null) return bad();
  const p = raw as Record<string, unknown>;
  if (typeof p.editionKey !== "string" || !p.editionKey) return bad();
  if (!Array.isArray(p.units) || p.units.length === 0) return bad();
  const units: PlannedUnit[] = p.units.map((u) => {
    if (typeof u !== "object" || u === null) return bad();
    const x = u as Record<string, unknown>;
    if (
      typeof x.unitId !== "string" ||
      typeof x.unitKey !== "string" ||
      typeof x.title !== "string" ||
      typeof x.order !== "number" ||
      !Number.isInteger(x.order) ||
      (x.order as number) < 1
    ) {
      return bad();
    }
    return {
      unitId: x.unitId,
      unitKey: x.unitKey,
      order: x.order,
      partNumber: typeof x.partNumber === "number" ? x.partNumber : null,
      partTitle: typeof x.partTitle === "string" ? x.partTitle : null,
      title: x.title,
    };
  });
  // Un plan que se pisa a sí mismo se rechaza antes de mirar la base.
  const orders = new Set(units.map((u) => u.order));
  if (orders.size !== units.length) return bad();
  const keys = new Set(units.map((u) => u.unitKey));
  if (keys.size !== units.length) return bad();
  return { editionKey: p.editionKey, units };
}

export type UnitOutcome =
  | {
      unitId: string;
      unitKey: string;
      order: number;
      action: "exists";
      contentUnitId: string;
    }
  | { unitId: string; unitKey: string; order: number; action: "would-create" }
  | {
      unitId: string;
      unitKey: string;
      order: number;
      action: "created";
      contentUnitId: string;
    };

type Db = Pick<PrismaClient, "edition" | "contentUnit" | "revisionUnit">;

/**
 * Lo comprobable sin escribir. Corre igual en dry-run y en apply: un plan que
 * solo se valida en dry-run no es una comprobación, es una demostración.
 */
export async function planUnitBootstrap(
  db: Db,
  plan: UnitBootstrapPlan,
): Promise<{ editionId: string; outcomes: UnitOutcome[] }> {
  const edition = await db.edition.findUnique({
    where: { editionKey: plan.editionKey },
    select: { id: true, publishedRevisionId: true },
  });
  if (!edition) throw new Error(EDITION_NOT_FOUND);

  // El manifiesto publicado es quien dice qué posición está ocupada. Preguntarle
  // a `ContentUnit` no bastaría: una unidad puede existir sin estar colocada.
  const placed = edition.publishedRevisionId
    ? await db.revisionUnit.findMany({
        where: { revisionId: edition.publishedRevisionId },
        select: { order: true, unit: { select: { unitKey: true } } },
      })
    : [];
  const occupant = new Map<number, string>(
    placed.map((r) => [r.order, r.unit.unitKey]),
  );

  const outcomes: UnitOutcome[] = [];
  for (const u of plan.units) {
    const taken = occupant.get(u.order);
    if (taken && taken !== u.unitKey) {
      throw new Error(`${ORDER_TAKEN}:${u.order}:${taken}`);
    }
    const existing = await db.contentUnit.findUnique({
      where: {
        editionId_unitKey: { editionId: edition.id, unitKey: u.unitKey },
      },
      select: { id: true },
    });
    outcomes.push(
      existing
        ? {
            unitId: u.unitId,
            unitKey: u.unitKey,
            order: u.order,
            action: "exists",
            contentUnitId: existing.id,
          }
        : {
            unitId: u.unitId,
            unitKey: u.unitKey,
            order: u.order,
            action: "would-create",
          },
    );
  }
  return { editionId: edition.id, outcomes };
}

export async function applyUnitBootstrap(
  prisma: PrismaClient,
  plan: UnitBootstrapPlan,
): Promise<{ editionId: string; outcomes: UnitOutcome[] }> {
  const { editionId, outcomes } = await planUnitBootstrap(prisma, plan);
  const final: UnitOutcome[] = [];
  for (const o of outcomes) {
    if (o.action !== "would-create") {
      final.push(o);
      continue;
    }
    // `create` sobre el índice único (editionId, unitKey): dos ejecuciones en
    // paralelo no pueden producir dos unidades para la misma clave.
    const created = await prisma.contentUnit.create({
      data: { editionId, unitKey: o.unitKey, isFreePreview: false },
      select: { id: true },
    });
    final.push({ ...o, action: "created", contentUnitId: created.id });
  }
  return { editionId, outcomes: final };
}

export async function main(argv: string[]): Promise<number> {
  let args: UnitBootstrapArgs;
  try {
    args = parseUnitBootstrapArgs(argv);
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
  const plan = parsePlan(JSON.parse(readFileSync(args.planPath, "utf8")));
  if (args.apply) assertUnitBootstrapAllowed(process.env);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = args.apply
      ? await applyUnitBootstrap(prisma, plan)
      : await planUnitBootstrap(prisma, plan);
    console.log(
      JSON.stringify(
        {
          mode: args.apply ? "apply" : "dry-run",
          editionKey: plan.editionKey,
          ...result,
        },
        null,
        2,
      ),
    );
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  void main(process.argv.slice(2)).then((c) => {
    process.exitCode = c;
  });
}
