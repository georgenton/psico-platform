import { describe, expect, it, vi } from "vitest";

import {
  ORDER_TAKEN,
  PLAN_INVALID,
  EDITION_NOT_FOUND,
  applyUnitBootstrap,
  parsePlan,
  parseUnitBootstrapArgs,
  planUnitBootstrap,
} from "./unit-bootstrap-cli";

/**
 * El alta de unidades, por lo que se NIEGA a hacer.
 *
 * Este comando existe para meter C04–C10 en una edición ya publicada. Lo que lo
 * hace seguro no es que sepa crear una fila, sino que se detenga antes de pisar
 * una posición ocupada y que, repetido, reconozca lo que ya creó en vez de
 * duplicarlo.
 */

const EDITION = { id: "ed_1", publishedRevisionId: "rev_11" };

function db(opts: {
  placed?: { order: number; unitKey: string }[];
  existing?: string[];
  edition?: typeof EDITION | null;
}) {
  const created: { editionId: string; unitKey: string }[] = [];
  const client = {
    edition: {
      // `??` no sirve aquí: el caso interesante es `edition: null` explícito, y
      // `null ?? EDITION` lo convertiría en una edición que sí existe.
      findUnique: vi
        .fn()
        .mockResolvedValue("edition" in opts ? opts.edition : EDITION),
    },
    revisionUnit: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          (opts.placed ?? []).map((p) => ({
            order: p.order,
            unit: { unitKey: p.unitKey },
          })),
        ),
    },
    contentUnit: {
      findUnique: vi.fn(
        ({ where }: { where: { editionId_unitKey: { unitKey: string } } }) =>
          Promise.resolve(
            (opts.existing ?? []).includes(where.editionId_unitKey.unitKey)
              ? { id: `cu_${where.editionId_unitKey.unitKey}` }
              : null,
          ),
      ),
      create: vi.fn(
        ({ data }: { data: { editionId: string; unitKey: string } }) => {
          created.push(data);
          return Promise.resolve({ id: `new_${data.unitKey}` });
        },
      ),
    },
  };
  return { client, created };
}

const unit = (n: number, key: string) => ({
  unitId: `EEC-C0${n}`,
  unitKey: key,
  order: n,
  partNumber: 2,
  partTitle: "Construyendo tus emociones",
  title: `Capítulo ${n}`,
});

describe("unit-bootstrap · el plan", () => {
  it("rechaza dos unidades en la misma posición", () => {
    expect(() =>
      parsePlan({
        editionKey: "e",
        units: [unit(4, "a"), { ...unit(5, "b"), order: 4 }],
      }),
    ).toThrow(PLAN_INVALID);
  });

  it("rechaza la misma clave repetida", () => {
    expect(() =>
      parsePlan({ editionKey: "e", units: [unit(4, "a"), unit(5, "a")] }),
    ).toThrow(PLAN_INVALID);
  });

  it("rechaza un plan sin edición o sin unidades", () => {
    expect(() => parsePlan({ units: [unit(4, "a")] })).toThrow(PLAN_INVALID);
    expect(() => parsePlan({ editionKey: "e", units: [] })).toThrow(
      PLAN_INVALID,
    );
  });

  it("dry-run es el modo por defecto", () => {
    expect(parseUnitBootstrapArgs(["--plan=p.json"]).apply).toBe(false);
    expect(parseUnitBootstrapArgs(["--plan=p.json", "--apply"]).apply).toBe(
      true,
    );
  });
});

describe("unit-bootstrap · las negativas", () => {
  it("se detiene si otra unidad ocupa esa posición", async () => {
    const { client } = db({ placed: [{ order: 4, unitKey: "otra-unidad" }] });
    await expect(
      planUnitBootstrap(client as never, {
        editionKey: "e",
        units: [unit(4, "mia")],
      }),
    ).rejects.toThrow(new RegExp(`^${ORDER_TAKEN}:4:otra-unidad$`));
  });

  it("no confunde «posición ocupada por mí» con una colisión", async () => {
    // Reejecutar el lote no puede fallar por encontrarse a sí mismo colocado.
    const { client } = db({
      placed: [{ order: 4, unitKey: "mia" }],
      existing: ["mia"],
    });
    const { outcomes } = await planUnitBootstrap(client as never, {
      editionKey: "e",
      units: [unit(4, "mia")],
    });
    expect(outcomes[0].action).toBe("exists");
  });

  it("falla si la edición no existe en este entorno", async () => {
    const { client } = db({ edition: null });
    await expect(
      planUnitBootstrap(client as never, {
        editionKey: "no-existe",
        units: [unit(4, "a")],
      }),
    ).rejects.toThrow(EDITION_NOT_FOUND);
  });
});

describe("unit-bootstrap · idempotencia", () => {
  it("crea sólo lo que falta y deja intacto lo que ya está", async () => {
    const { client, created } = db({
      placed: [{ order: 3, unitKey: "c03" }],
      existing: ["c03"],
    });
    const { outcomes } = await applyUnitBootstrap(client as never, {
      editionKey: "e",
      units: [
        { ...unit(3, "c03"), unitId: "EEC-C03" },
        unit(4, "c04"),
        unit(5, "c05"),
      ],
    });
    expect(outcomes.map((o) => o.action)).toEqual([
      "exists",
      "created",
      "created",
    ]);
    // C03 ya existía: no se vuelve a crear, no se toca.
    expect(created.map((c) => c.unitKey)).toEqual(["c04", "c05"]);
  });

  it("una segunda pasada no crea nada", async () => {
    const { client, created } = db({ existing: ["c04", "c05"] });
    const { outcomes } = await applyUnitBootstrap(client as never, {
      editionKey: "e",
      units: [unit(4, "c04"), unit(5, "c05")],
    });
    expect(outcomes.every((o) => o.action === "exists")).toBe(true);
    expect(created).toHaveLength(0);
  });

  it("una unidad nueva nace fuera del preview gratuito", async () => {
    const { client, created } = db({});
    await applyUnitBootstrap(client as never, {
      editionKey: "e",
      units: [unit(4, "c04")],
    });
    expect(client.contentUnit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isFreePreview: false }),
      }),
    );
    expect(created).toHaveLength(1);
  });
});
