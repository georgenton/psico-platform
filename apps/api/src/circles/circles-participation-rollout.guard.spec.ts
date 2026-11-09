import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CirclesParticipationRolloutGuard } from "./circles-participation-rollout.guard";
import { CirclesRolloutGuard } from "./circles-rollout.guard";
import { CirclesRolloutService } from "./circles-rollout.service";
import type { CirclesRolloutMode } from "./circles-rollout";

/**
 * Tener cuenta no puede dejarte peor que no tenerla.
 *
 * ── Lo que se midió, en pantalla y contra staging (2026-11-09) ─────────────
 *
 * Con `CIRCLES_ROLLOUT_MODE=pilot` y un padrón de una sola persona, la misma
 * invitada, al mismo Dúo, con el mismo enlace de un solo uso:
 *
 *   · **sin sesión** → la sala abrió entera: consentimiento, salvaguardas,
 *     «0 de 2 listas» y «Entiendo, empezar».
 *   · **con sesión**, cuenta recién creada fuera del padrón → «No pudimos
 *     abrir esta sala. Círculos no está disponible todavía.»
 *
 * No era una decisión de producto: la superficie de invitadas ya está abierta
 * bajo `pilot` a propósito —«negarla haría que un miembro del padrón no
 * pudiera invitar a nadie»— y ese mismo argumento no se había aplicado a la
 * invitada que además tiene cuenta, que en un piloto real son casi todas.
 */

type Req = {
  user?: { userId: string };
  circleActor?: { kind: string; userId?: string };
};

const contexto = (req: Req) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;

const servicio = (mode: CirclesRolloutMode, pilotUserIds: string[] = []) =>
  new CirclesRolloutService({
    mode,
    pilotUserIds,
    groupsEnabled: true,
  } as never);

const PADRON = ["en-el-padron"];

describe("la puerta de participación", () => {
  it.each(["on", "pilot"] as const)(
    "con %s admite a quien NO está en el padrón — es la invitada",
    (mode) => {
      const req: Req = { user: { userId: "fuera-del-padron" } };
      const guard = new CirclesParticipationRolloutGuard(
        servicio(mode, PADRON),
      );
      expect(guard.canActivate(contexto(req))).toBe(true);
      // Y le construye su actor, que es la otra mitad del trabajo.
      expect(req.circleActor).toMatchObject({ userId: "fuera-del-padron" });
    },
  );

  it("con off no admite a nadie, ni dentro del padrón", () => {
    for (const userId of ["en-el-padron", "fuera-del-padron"]) {
      const guard = new CirclesParticipationRolloutGuard(
        servicio("off", PADRON),
      );
      expect(() => guard.canActivate(contexto({ user: { userId } }))).toThrow();
    }
  });

  it("sin usuario falla cerrado, aunque la superficie esté abierta", () => {
    const guard = new CirclesParticipationRolloutGuard(servicio("on"));
    expect(() => guard.canActivate(contexto({}))).toThrow();
  });

  /**
   * La mitad que importa tanto como la otra: esto NO ensancha lo que se puede
   * EMPEZAR. Si alguien borrara la puerta del padrón de `POST /circles/duo`,
   * cualquiera con cuenta podría crear durante el piloto.
   */
  it("la puerta del padrón sigue rechazando a quien no está en él", () => {
    const guard = new CirclesRolloutGuard(servicio("pilot", PADRON));
    expect(() =>
      guard.canActivate(contexto({ user: { userId: "fuera-del-padron" } })),
    ).toThrow();
    expect(
      guard.canActivate(contexto({ user: { userId: "en-el-padron" } })),
    ).toBe(true);
  });
});

describe("el trinquete sobre el controlador", () => {
  const fuente = readFileSync(
    join(__dirname, "circles-participation.controller.ts"),
    "utf8",
  );

  it("la clase usa la puerta de participación, no la del padrón", () => {
    expect(fuente).toMatch(
      /@Controller\("circles"\)[\s\S]{0,400}?@UseGuards\(JwtAuthGuard, CirclesParticipationRolloutGuard\)/,
    );
  });

  it("y `POST duo` conserva la del padrón encima", () => {
    // Los dos guardianes corren: el de la clase y el de la ruta. Si alguien
    // quitara éste, crear dejaría de consultar el padrón durante el piloto y
    // nadie se enteraría hasta ver un Dúo de alguien que no debía poder.
    const i = fuente.indexOf('@Post("duo")');
    expect(i).toBeGreaterThan(-1);
    const cabecera = fuente.slice(i, fuente.indexOf("createDuo(", i));
    expect(cabecera).toContain("@UseGuards(JwtAuthGuard, CirclesRolloutGuard)");
  });

  it("ninguna otra ruta de este controlador crea nada", () => {
    // Si apareciera una segunda ruta de creación bajo la puerta nueva, habría
    // que ponerle también la del padrón. Esto lo hace visible.
    const rutas = [...fuente.matchAll(/@(Post|Get)\("([^"]+)"\)/g)].map(
      (m) => m[2],
    );
    const crean = rutas.filter(
      (r) => !r.startsWith("activities/") && r !== "duo",
    );
    expect(crean).toEqual([]);
  });
});
