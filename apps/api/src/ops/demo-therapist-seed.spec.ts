import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  seedTherapists,
  type TherapistSeedClient,
} from "../../prisma/seed-therapists";
import {
  DEMO_THERAPIST_IDS,
  isDemoTherapist,
} from "../terapia/demo-therapists";

/**
 * Lo que la semilla puede decir de una ficha de terapeuta de demostración.
 *
 * Hasta el 2026-11-24 nacían activas, con «licencia verificada» y con
 * puntuaciones sobre reseñas que no existen, y cada pasada lo volvía a escribir:
 * retirar una ficha duraba hasta la siguiente siembra.
 *
 * El doble de aquí es una base en memoria que APLICA el upsert —crea con
 * `create`, mezcla `update` sobre la fila— en vez de anotar la llamada. Es lo
 * que permite afirmar sobre la fila que queda, que es lo que importa.
 */
type Fila = Record<string, unknown>;

function base(existentes: Fila[] = []) {
  const filas = new Map<string, Fila>(
    existentes.map((f) => [f.id as string, { ...f }]),
  );
  const horarios = new Map<string, number>();
  const client: TherapistSeedClient = {
    therapist: {
      async upsert(args: unknown) {
        const { where, create, update } = args as {
          where: { id: string };
          create: Fila;
          update: Fila;
        };
        const fila = filas.get(where.id);
        filas.set(where.id, fila ? { ...fila, ...update } : { ...create });
        return filas.get(where.id);
      },
    },
    therapistAvailability: {
      async count({ where }) {
        return horarios.get(where.therapistId) ?? 0;
      },
      async create({ data }) {
        horarios.set(
          data.therapistId,
          (horarios.get(data.therapistId) ?? 0) + 1,
        );
        return {};
      },
    },
  };
  return { filas, client };
}

/** Una fila como las que hay en staging: activa, «verificada» y puntuada. */
const COMO_EN_STAGING = (id: string): Fila => ({
  id,
  name: "Nombre de antes",
  title: "Título de antes",
  licenseNumber: "PSI-EC-0000",
  licenseVerified: true,
  isActive: true,
  avgRating: 4.9,
  reviewsCount: 64,
  popularity: 95,
  priceUsd: 60,
});

describe("semilla · fichas de demostración", () => {
  it("siembra exactamente las declaradas, ni una más ni una menos", async () => {
    const { filas, client } = base();
    await seedTherapists(client);
    expect([...filas.keys()].sort()).toEqual([...DEMO_THERAPIST_IDS].sort());
    for (const id of filas.keys()) expect(isDemoTherapist(id)).toBe(true);
  });

  it("nacen inactivas, sin licencia verificada y sin puntuaciones", async () => {
    const { filas, client } = base();
    await seedTherapists(client);
    for (const f of filas.values()) {
      expect(f).toMatchObject({
        isActive: false,
        licenseVerified: false,
        avgRating: 0,
        reviewsCount: 0,
        popularity: 0,
      });
      // Y el número dice lo que es: los de antes parecían registros reales.
      expect(f.licenseNumber).toMatch(/^DEMO-/);
    }
    // `licenseNumber` es único en la tabla.
    const numeros = [...filas.values()].map((f) => f.licenseNumber);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("sembrar dos veces sobre una fila INACTIVA la deja inactiva", async () => {
    const retirada = { ...COMO_EN_STAGING("t_marina"), isActive: false };
    const { filas, client } = base([retirada]);
    await seedTherapists(client);
    await seedTherapists(client);
    expect(filas.get("t_marina")).toEqual(retirada);
  });

  it("y sobre una corregida a mano no reafirma nada", async () => {
    const corregida = {
      ...COMO_EN_STAGING("t_lucia"),
      licenseVerified: false,
      avgRating: 0,
      reviewsCount: 0,
      title: "Perfil de demostración",
      priceUsd: 0,
    };
    const { filas, client } = base([corregida]);
    await seedTherapists(client);
    expect(filas.get("t_lucia")).toEqual(corregida);
  });

  it("tampoco apaga una fila existente: no es quien lo decide", async () => {
    // Lo que deja fuera del producto a una ficha de demostración es su
    // identidad, en el servicio. La semilla ni la reactiva ni la retira.
    const { filas, client } = base([COMO_EN_STAGING("t_diego")]);
    await seedTherapists(client);
    expect(filas.get("t_diego")).toEqual(COMO_EN_STAGING("t_diego"));
  });

  it("el `update` va vacío, dicho directamente", async () => {
    const updates: unknown[] = [];
    const { client } = base();
    await seedTherapists({
      ...client,
      therapist: {
        async upsert(args: unknown) {
          updates.push((args as { update: unknown }).update);
          return {};
        },
      },
    });
    expect(updates).toHaveLength(DEMO_THERAPIST_IDS.length);
    for (const u of updates) expect(u).toEqual({});
  });
});

describe("la lista de fichas de demostración", () => {
  it("no tiene repetidos y no incluye nada que no sea una ficha sembrada", () => {
    expect(new Set(DEMO_THERAPIST_IDS).size).toBe(DEMO_THERAPIST_IDS.length);
    expect(isDemoTherapist("pro-real-1")).toBe(false);
    expect(isDemoTherapist("")).toBe(false);
    // Un nombre heredado de Object no es una ficha.
    expect(isDemoTherapist("constructor")).toBe(false);
  });

  it("no importa nada: la semilla la carga con ts-node", () => {
    const fuente = readFileSync(
      join(__dirname, "..", "terapia", "demo-therapists.ts"),
      "utf8",
    );
    expect(fuente).not.toMatch(/^import /m);
  });

  it("es la única lista: ningún otro fichero de la API nombra los ids", () => {
    // Una segunda copia es una que se queda atrás cuando se añade una ficha.
    const semilla = readFileSync(
      join(__dirname, "..", "..", "prisma", "seed-therapists.ts"),
      "utf8",
    );
    for (const id of DEMO_THERAPIST_IDS) {
      expect(semilla.match(new RegExp(`"${id}"`, "g"))).toHaveLength(1);
    }
    for (const f of [
      "../terapia/terapia.service.ts",
      "../subscription/payment.service.ts",
    ]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      for (const id of DEMO_THERAPIST_IDS) expect(src).not.toContain(`"${id}"`);
    }
  });
});
