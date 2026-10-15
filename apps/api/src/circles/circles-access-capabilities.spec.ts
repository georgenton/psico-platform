import { describe, expect, it } from "vitest";
import type { CircleActor } from "@psico/types";
import { CirclesController } from "./circles.controller";
import { resolveCirclesRolloutConfig } from "./circles-rollout";
import { CirclesRolloutService } from "./circles-rollout.service";
import type { CirclesService } from "./circles.service";

/**
 * `GET /circles/access` reports the CALLER'S capabilities, and the two it
 * reports are not the same question.
 *
 * ── El fallo que esto impide ────────────────────────────────────────────────
 *
 * La respuesta era `{available:true}` y nada más, así que una superficie que
 * quisiera saber si puede ofrecer la creación de un GRUPO sólo podía deducirlo
 * de la disponibilidad. Esa deducción es falsa: los grupos tienen un segundo
 * interruptor que sólo puede ESTRECHAR, de modo que «Círculos está abierto
 * para ti» no implica «puedes crear un grupo». La pantalla ofrecía un botón
 * que el POST rechazaba.
 *
 * Lo que se fija aquí: que `canCreateGroups` salga del mismo servicio que
 * autoriza la creación —no de una copia— y que un allowlisted SIN el
 * interruptor de grupos reciba `available` y `canCreateGroups:false` en la
 * misma respuesta. Si alguien vuelve a derivar uno del otro, el tercer test
 * falla.
 *
 * Lo que NO se afirma aquí: que el 503 funcione. Eso lo decide el guard antes
 * del handler, tiene sus propias pruebas, y este archivo no lo duplica.
 */

const ACTOR: CircleActor = Object.freeze({
  kind: "USER",
  userId: "user_allowlisted",
});

/** El controller sólo necesita el rollout para esta ruta. */
const controllerFor = (env: Record<string, string | undefined>) =>
  new CirclesController(
    {} as unknown as CirclesService,
    new CirclesRolloutService(resolveCirclesRolloutConfig(env)),
  );

describe("GET /circles/access · capacidades del propio actor", () => {
  it("con el piloto abierto y grupos ON, concede ambas", () => {
    const res = controllerFor({
      CIRCLES_ROLLOUT_MODE: "pilot",
      CIRCLES_PILOT_USER_IDS: "user_allowlisted",
      CIRCLES_GROUPS: "on",
    }).access(ACTOR);

    expect(res).toEqual({ available: true, canCreateGroups: true });
  });

  it("con disponibilidad general, los grupos siguen dependiendo de su propio interruptor", () => {
    // `on` admite a cualquiera autenticado. Si los grupos se dedujeran de la
    // disponibilidad, aquí saldría `true`.
    const res = controllerFor({
      CIRCLES_ROLLOUT_MODE: "on",
    }).access(ACTOR);

    expect(res.available).toBe(true);
    expect(res.canCreateGroups).toBe(false);
  });

  it("un allowlisted SIN el interruptor de grupos recibe la negativa en la misma respuesta", () => {
    // El caso que motivó el cambio: disponible sí, grupos no, y la pantalla
    // tiene que poder distinguirlo sin preguntar nada más.
    const res = controllerFor({
      CIRCLES_ROLLOUT_MODE: "pilot",
      CIRCLES_PILOT_USER_IDS: "user_allowlisted",
    }).access(ACTOR);

    expect(res).toEqual({ available: true, canCreateGroups: false });
  });

  it("una bandera de grupos que no se entiende se lee cerrada, no abierta", () => {
    const res = controllerFor({
      CIRCLES_ROLLOUT_MODE: "pilot",
      CIRCLES_PILOT_USER_IDS: "user_allowlisted",
      CIRCLES_GROUPS: "true",
    }).access(ACTOR);

    expect(res.canCreateGroups).toBe(false);
  });

  it("no filtra configuración: sólo las dos capacidades, nunca el modo ni la allowlist", () => {
    const res = controllerFor({
      CIRCLES_ROLLOUT_MODE: "pilot",
      CIRCLES_PILOT_USER_IDS: "user_allowlisted,otra_persona",
      CIRCLES_GROUPS: "on",
    }).access(ACTOR);

    expect(Object.keys(res).sort()).toEqual(["available", "canCreateGroups"]);
    const serializado = JSON.stringify(res);
    expect(serializado).not.toContain("pilot");
    expect(serializado).not.toContain("otra_persona");
  });
});
