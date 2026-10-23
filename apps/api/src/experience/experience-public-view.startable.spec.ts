import { describe, expect, it } from "vitest";
import type { ChapterExperienceDefinition } from "@psico/types";

import { PRODUCTION_EXPERIENCE_DEFINITIONS } from "./experience-production-catalog";
import { toPublicExperienceView } from "./experience-public-view";

/**
 * B1 — discovery says whether a pin may begin a NEW session.
 *
 * Published and startable are different questions. `RETIRED_FOR_NEW_STARTS`
 * keeps a pin resolvable so the sessions already on it finish, while refusing
 * new ones; `POST /guide/sessions` answers 410. Until this field existed the
 * browser could only learn that by pressing, so it offered «Empezar
 * experiencia» for a journey nobody could begin — measured on
 * `eec-c1-cuerpo-antes-que-mente@1`.
 *
 * The decision stays where it was. This only carries it to the one drawing
 * the button.
 */

const BASE: Omit<ChapterExperienceDefinition, "guidePin"> = {
  experienceKey: "x-prueba",
  experienceVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  status: "PUBLISHED",
  title: "Una experiencia de prueba",
  scenes: [],
} as unknown as Omit<ChapterExperienceDefinition, "guidePin">;

const conPin = (guideKey: string, guideVersion: number) =>
  ({
    ...BASE,
    guidePin: { guideKey, guideVersion },
  }) as ChapterExperienceDefinition;

describe("toPublicExperienceView — arrancabilidad", () => {
  it("un pin retirado para inicios nuevos se sirve como NO arrancable", () => {
    const vista = toPublicExperienceView(
      conPin("eec-c1-cuerpo-antes-que-mente", 1),
    );
    expect(vista.startable).toBe(false);
  });

  it("un pin cualquiera que nadie ha retirado se sirve como arrancable", () => {
    const vista = toPublicExperienceView(
      conPin("eec-c2-gesto-necesita-contexto", 1),
    );
    expect(vista.startable).toBe(true);
  });

  it("la versión forma parte de la pregunta", () => {
    // La retirada nombra `@1`. Otra versión del mismo guía es otro pin, y
    // responder por el nombre sin la versión contestaría sobre uno que nadie
    // fijó.
    expect(
      toPublicExperienceView(conPin("eec-c1-cuerpo-antes-que-mente", 2))
        .startable,
    ).toBe(true);
  });

  it("todo lo que el build publica lleva la respuesta, no la omite", () => {
    // Un campo ausente se lee como «no se pudo preguntar», y los clientes lo
    // tratan como un no. Que el servidor lo omitiera sería apagar su propia
    // oferta sin decirlo.
    for (const d of PRODUCTION_EXPERIENCE_DEFINITIONS) {
      expect(typeof toPublicExperienceView(d).startable).toBe("boolean");
    }
  });
});
