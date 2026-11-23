import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hay UN solo camino de salida, y borra las tres cosas.
 *
 * EL FALLO QUE ESTO IMPIDE. «Cerrar sesión» existía dos veces: el del menú
 * borraba las dos galletas de sesión Y la del sobre del diario, y avisaba a la
 * API para que revocara el token de renovación; el de Perfil sólo borraba las
 * dos primeras. Quien salía desde Perfil en un equipo compartido dejaba la
 * llave de su diario en el navegador y una sesión viva en el servidor.
 */

const borradas: string[] = [];
let galletas: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (n: string) => (galletas[n] ? { value: galletas[n] } : undefined),
    set: vi.fn(),
    delete: (n: string) => {
      borradas.push(n);
    },
  }),
}));
const destino = vi.fn((_: string) => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: (p: string) => destino(p) }));

const salirEnLaApi = vi.fn(async (_r: string, _a: string) => undefined);
vi.mock("@/lib/api", async (original) => ({
  ...(await original<object>()),
  authApi: { logout: (r: string, a: string) => salirEnLaApi(r, a) },
}));

import { TOKEN_NAMES } from "@/lib/cookies";
import { logoutAction } from "./auth";

beforeEach(() => {
  borradas.length = 0;
  galletas = {};
  salirEnLaApi.mockReset().mockResolvedValue(undefined);
  destino.mockClear();
});

describe("logoutAction", () => {
  it("revoca en el servidor y borra sesión y llave del diario", async () => {
    galletas = { [TOKEN_NAMES.access]: "a", [TOKEN_NAMES.refresh]: "r" };
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(salirEnLaApi).toHaveBeenCalledWith("r", "a");
    expect(borradas).toEqual(
      expect.arrayContaining([
        TOKEN_NAMES.access,
        TOKEN_NAMES.refresh,
        "psico_diary_wrap",
      ]),
    );
    expect(destino).toHaveBeenCalledWith("/login");
  });

  it("si la API no responde, en este dispositivo se borra igual", async () => {
    galletas = { [TOKEN_NAMES.access]: "a", [TOKEN_NAMES.refresh]: "r" };
    salirEnLaApi.mockRejectedValue(new Error("caída"));
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(borradas).toContain("psico_diary_wrap");
  });
});

describe("nadie más cierra sesión por su cuenta", () => {
  const raiz = resolve(__dirname, "../../../..");
  const fuentes = execFileSync("git", ["ls-files", "apps/web/src"], {
    cwd: raiz,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  it("sólo `actions/auth.ts` borra las galletas de sesión", () => {
    expect(fuentes.length).toBeGreaterThan(300);
    const quien = fuentes.filter((f) =>
      /\.delete\(\s*TOKEN_NAMES\.(access|refresh)/.test(
        readFileSync(resolve(raiz, f), "utf8"),
      ),
    );
    expect(quien).toEqual(["apps/web/src/actions/auth.ts"]);
  });

  it("el botón de Perfil usa el mismo cierre que el menú", () => {
    for (const f of [
      "apps/web/src/components/dashboard/perfil/DangerZone.tsx",
      "apps/web/src/app/dashboard/_DashboardShell.tsx",
    ]) {
      const fuente = readFileSync(resolve(raiz, f), "utf8");
      expect(fuente).toMatch(
        /import \{[^}]*\blogoutAction\b[^}]*\} from "@\/actions\/auth"/,
      );
      expect(fuente).toContain("<form action={logoutAction}>");
    }
  });
});
