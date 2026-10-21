import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChapterExperienceDefinition } from "@psico/types";

import { ExperienceDiscoveryService } from "./experience-discovery.service";
import type { ExperienceDefinitionRepository } from "./experience-definition.repository";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * B3 · Prioridad B — el camino a un recorrido que ya es de alguien.
 *
 * B2 midió el agujero: el descubrimiento era el ÚNICO sitio del que el
 * navegador podía sacar una definición, así que retirar una de la lista dejaba
 * sin camino a quien ya tenía una sesión ahí. El registro seguía entero —la
 * sesión COMPLETED con su resumen— y la pantalla decía «No pudimos preparar tu
 * guía».
 *
 * Lo que autoriza aquí no es el estado de publicación: es la PROPIEDAD. Y por
 * eso lo que más importa de este archivo son las negativas — que una cuenta
 * ajena reciba exactamente lo mismo que si la experiencia no existiera.
 */

const PILOTO: ChapterExperienceDefinition = {
  experienceKey: "eec-c1-cuerpo-antes-que-mente",
  experienceVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  title: "El cuerpo, antes que la mente",
  status: "ARCHIVED",
  guidePin: { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 },
  scenes: [],
} as unknown as ChapterExperienceDefinition;

function montar(opciones: {
  definicion?: ChapterExperienceDefinition | null;
  sesion?: { id: string } | null;
}) {
  const repositorio = {
    getExact: vi
      .fn()
      .mockResolvedValue(
        opciones.definicion === undefined ? PILOTO : opciones.definicion,
      ),
    listPublishedForChapter: vi.fn().mockResolvedValue([]),
  } as unknown as ExperienceDefinitionRepository;
  const guideSession = {
    findFirst: vi
      .fn()
      .mockResolvedValue(
        opciones.sesion === undefined ? { id: "ses_1" } : opciones.sesion,
      ),
  };
  const prisma = { guideSession } as unknown as PrismaService;
  return {
    servicio: new ExperienceDiscoveryService(repositorio, prisma),
    guideSession,
    repositorio,
  };
}

let actual: ReturnType<typeof montar>;

beforeEach(() => {
  actual = montar({});
});

describe("una experiencia archivada sigue abierta para quien la empezó", () => {
  it("la devuelve cuando esta persona tiene una sesión en su pin exacto", async () => {
    const vista = await actual.servicio.getOwnedExact({
      userId: "user_1",
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
    });

    expect(vista).not.toBeNull();
    expect(vista?.experienceKey).toBe("eec-c1-cuerpo-antes-que-mente");
    // Y sigue diciendo la verdad sobre empezar: recuperar no es reabrir.
    expect(vista?.startable).toBe(false);
  });

  it("la propiedad se comprueba contra el pin de ESTA experiencia", async () => {
    await actual.servicio.getOwnedExact({
      userId: "user_1",
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
    });

    expect(actual.guideSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_1",
          guideKey: "eec-c1-cuerpo-antes-que-mente",
          guideVersion: 1,
        }),
      }),
    );
  });

  it("cuentan la activa y la terminada; la cancelada no", async () => {
    // `findExperienceState` lee una sesión cancelada como «no empezada».
    // Ofrecer aquí un recorrido que alguien canceló sería desenterrarlo.
    await actual.servicio.getOwnedExact({
      userId: "user_1",
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
    });

    const { where } = actual.guideSession.findFirst.mock.calls[0]![0] as {
      where: { status: { in: string[] } };
    };
    expect([...where.status.in].sort()).toEqual(["ACTIVE", "COMPLETED"]);
  });
});

describe("las negativas, que son el punto", () => {
  it("una cuenta sin sesión recibe lo mismo que si no existiera", async () => {
    const { servicio } = montar({ sesion: null });

    await expect(
      servicio.getOwnedExact({
        userId: "otra_cuenta",
        experienceKey: "eec-c1-cuerpo-antes-que-mente",
        experienceVersion: 1,
      }),
    ).resolves.toBeNull();
  });

  it("un borrador declarado en código no se sirve por aquí", async () => {
    // El puerto de base ya filtra los borradores. Esto cubre el otro origen:
    // una definición DRAFT en el catálogo del build sería contenido editorial
    // sin publicar, y tener una sesión en su guía no da derecho a leerlo.
    const { servicio } = montar({
      definicion: { ...PILOTO, status: "DRAFT" } as ChapterExperienceDefinition,
    });

    await expect(
      servicio.getOwnedExact({
        userId: "user_1",
        experienceKey: "eec-c1-cuerpo-antes-que-mente",
        experienceVersion: 1,
      }),
    ).resolves.toBeNull();
  });

  it("un pin que no resuelve no se inventa", async () => {
    const { servicio, guideSession } = montar({ definicion: null });

    await expect(
      servicio.getOwnedExact({
        userId: "user_1",
        experienceKey: "no-existe",
        experienceVersion: 9,
      }),
    ).resolves.toBeNull();
    // Y ni siquiera se pregunta por la sesión: sin definición no hay pin
    // contra el que comprobar nada.
    expect(guideSession.findFirst).not.toHaveBeenCalled();
  });

  it("la versión forma parte de la identidad", async () => {
    await actual.servicio.getOwnedExact({
      userId: "user_1",
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 2,
    });

    expect(actual.repositorio.getExact).toHaveBeenCalledWith({
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 2,
    });
  });
});

describe("control negativo — esto no sustituye al descubrimiento", () => {
  it("la oferta del capítulo sigue siendo sólo lo publicado", async () => {
    // Si `getOwnedExact` se hubiera colado en la lista, un capítulo ofrecería
    // experiencias retiradas a cualquiera con una sesión. Son dos preguntas
    // distintas y siguen teniendo dos respuestas distintas.
    const items = await actual.servicio.listPublishedForChapter({
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
    });

    expect(items).toEqual([]);
    expect(actual.repositorio.listPublishedForChapter).toHaveBeenCalled();
  });
});
