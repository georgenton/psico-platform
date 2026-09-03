import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  READER_WOULD_DIVERGE,
  UNIT_INGEST_FORBIDDEN,
  assertUnitIngestAllowed,
  parseUnitIngestArgs,
  planUnitIngest,
  validatePayloadShape,
  type PayloadFile,
} from "./unit-ingest-cli";
import { unitKeyFromLegacyChapterId } from "./lib/block-key";

/**
 * El CLI de ingesta por unidad — sus decisiones, no su fontanería.
 *
 * Cada negativo se construye MUTANDO un payload y un entorno completos y
 * válidos, para que falle por lo que dice fallar. Un test que parte de `{}`
 * pasa aunque la comprobación que cree estar probando ya no exista.
 */

const LEGACY_CHAPTER_ID = "cmql50rvm00025nvvwpft991k";
const BACKED_UNIT_KEY = unitKeyFromLegacyChapterId(LEGACY_CHAPTER_ID);
const NATIVE_UNIT_KEY = "00000000-0000-5000-8000-000000000001";

const payload = (over: Partial<PayloadFile> = {}): PayloadFile => ({
  editionKey: "emociones-en-construccion-1e",
  unitKey: BACKED_UNIT_KEY,
  title: "¿Realmente sabemos qué es una emoción?",
  summary: null,
  durationMinutes: null,
  placement: {
    order: 1,
    partNumber: 1,
    partTitle: "Deconstruyendo lo que sabíamos",
  },
  blocks: [{ kind: "PARAGRAPH", content: "…" }],
  ...over,
});

/** Prisma mínimo, con una edición publicada y la unidad presente. */
function db(over: { chapters?: { id: string }[]; unitFound?: boolean } = {}) {
  return {
    edition: {
      findUnique: vi.fn().mockResolvedValue({
        id: "ed_1",
        slug: "emociones-en-construccion",
        publishedRevisionId: "rev_9",
      }),
    },
    contentUnit: {
      findFirst: vi
        .fn()
        .mockResolvedValue(over.unitFound === false ? null : { id: "cu_1" }),
    },
    revision: { findUnique: vi.fn().mockResolvedValue({ number: 9 }) },
    blockVersion: { count: vi.fn().mockResolvedValue(129) },
    book: {
      findUnique: vi.fn().mockResolvedValue({
        chapters: over.chapters ?? [{ id: LEGACY_CHAPTER_ID }],
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("unit-ingest CLI · argumentos", () => {
  it("exige el payload y deja el dry-run como opción por defecto", () => {
    expect(() => parseUnitIngestArgs([])).toThrow("MISSING_PAYLOAD");
    expect(parseUnitIngestArgs(["--payload=/tmp/p.json"])).toEqual({
      payloadPath: "/tmp/p.json",
      apply: false,
    });
    expect(
      parseUnitIngestArgs(["--payload", "/tmp/p.json", "--apply"]).apply,
    ).toBe(true);
    // `--dry-run` después de `--apply` gana: lo prudente no se pierde por orden.
    expect(
      parseUnitIngestArgs(["--payload=/p", "--apply", "--dry-run"]).apply,
    ).toBe(false);
  });
});

describe("unit-ingest CLI · forma del payload", () => {
  it("acepta un payload completo", () => {
    expect(() => validatePayloadShape(payload())).not.toThrow();
  });

  it.each([
    ["editionKey", { editionKey: "" }, "PAYLOAD_MISSING_EDITION_KEY"],
    ["unitKey", { unitKey: "" }, "PAYLOAD_MISSING_UNIT_KEY"],
    ["title", { title: "" }, "PAYLOAD_MISSING_TITLE"],
    ["blocks", { blocks: [] }, "PAYLOAD_NO_BLOCKS"],
  ])("rechaza un payload sin %s", (_n, over, code) => {
    expect(() =>
      validatePayloadShape(payload(over as Partial<PayloadFile>)),
    ).toThrow(code);
  });

  it("rechaza una colocación sin orden", () => {
    const p = payload();
    // @ts-expect-error se comprueba precisamente el caso mal tipado en disco
    p.placement = { partNumber: 1, partTitle: "x" };
    expect(() => validatePayloadShape(p)).toThrow(
      "PAYLOAD_MISSING_PLACEMENT_ORDER",
    );
  });
});

describe("unit-ingest CLI · opt-in en cajas desplegadas", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.PSICO_ENV = "production";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("se niega en producción sin la variable explícita", () => {
    expect(() => assertUnitIngestAllowed({})).toThrow(UNIT_INGEST_FORBIDDEN);
    expect(() =>
      assertUnitIngestAllowed({ ALLOW_CONTENT_CORE_UNIT_INGEST: "true" }),
    ).toThrow(UNIT_INGEST_FORBIDDEN);
  });

  it("deja pasar con el opt-in exacto", () => {
    expect(() =>
      assertUnitIngestAllowed({ ALLOW_CONTENT_CORE_UNIT_INGEST: "on" }),
    ).not.toThrow();
  });
});

describe("unit-ingest CLI · plan", () => {
  it("resuelve la edición en el entorno destino y describe el cambio", async () => {
    const prisma = db();
    const plan = await planUnitIngest(
      prisma,
      payload({ blocks: Array(188).fill({ kind: "PARAGRAPH", content: "x" }) }),
    );
    expect(prisma.edition.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { editionKey: "emociones-en-construccion-1e" },
      }),
    );
    expect(plan.editionId).toBe("ed_1");
    expect(plan.publishedRevisionNumber).toBe(9);
    expect(plan.currentBlocks).toBe(129);
    expect(plan.incomingBlocks).toBe(188);
  });

  it("rechaza un unitKey que esta edición no tiene, en vez de escribir en otra unidad", async () => {
    await expect(
      planUnitIngest(db({ unitFound: false }), payload()),
    ).rejects.toThrow("UNIT_KEY_NOT_IN_THIS_EDITION");
  });

  it("marca la divergencia cuando un capítulo legado respalda la unidad", async () => {
    const plan = await planUnitIngest(db(), payload());
    expect(plan.legacyBackedChapterId).toBe(LEGACY_CHAPTER_ID);
    expect(plan.readerWouldDiverge).toBe(true);
  });

  it("no la marca cuando ningún capítulo legado deriva ese unitKey", async () => {
    const plan = await planUnitIngest(
      db({ chapters: [{ id: "otro-capitulo-cualquiera" }] }),
      payload({ unitKey: NATIVE_UNIT_KEY }),
    );
    expect(plan.legacyBackedChapterId).toBeNull();
    expect(plan.readerWouldDiverge).toBe(false);
  });

  it("exige una revisión base publicada", async () => {
    const prisma = db();
    prisma.edition.findUnique.mockResolvedValue({
      id: "ed_1",
      slug: "emociones-en-construccion",
      publishedRevisionId: null,
    });
    await expect(planUnitIngest(prisma, payload())).rejects.toThrow(
      "INGEST_REQUIRES_BASE_REVISION",
    );
  });
});

describe("unit-ingest CLI · el nombre del rechazo", () => {
  it("nombra la divergencia del lector, no un fallo genérico", () => {
    // El código es la documentación operativa: quien lo vea en un log tiene que
    // saber QUÉ pasaría, no solo que algo se negó.
    expect(READER_WOULD_DIVERGE).toBe("READER_WOULD_SERVE_STALE_LEGACY_BLOCKS");
  });
});
