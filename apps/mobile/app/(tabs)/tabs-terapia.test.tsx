import { render, waitFor } from "@testing-library/react-native";

/**
 * La barra de pestañas: Terapia no se ofrece y la ayuda inmediata se ve.
 *
 * Van juntas porque la segunda colgaba de la primera. Retirar la pestaña de
 * Terapia sin poner la otra habría dejado la pantalla de ayuda sin ninguna
 * entrada en toda la aplicación, y eso no lo habría notado ninguna prueba.
 */

// `@types/node` no está en este workspace: se declara lo mínimo que Jest ya
// provee, como en `evolucion-copy-contract.test.ts`.
declare const __dirname: string;
declare function require(id: "fs"): {
  readFileSync(path: string, encoding: "utf8"): string;
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
};
declare function require(id: "react"): {
  createElement: (...a: unknown[]) => unknown;
  Fragment: unknown;
};
declare function require(id: "./ayuda" | "./terapia/crisis"): {
  default: unknown;
};

const fs = require("fs");

const mockPestanas: Array<{
  name: string;
  options: { href?: string | null; title?: string; tabBarLabel?: string };
}> = [];

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require("react");
  const Tabs = ({ children }: { children: unknown }) =>
    React.createElement(React.Fragment, null, children);
  Tabs.Screen = (p: never) => {
    mockPestanas.push(p);
    return null;
  };
  return { Tabs, Redirect: () => null, usePathname: () => "/" };
});
jest.mock("@psico/api-client", () => ({
  apiClient: {
    get: async () => ({
      onboardingState: { completedAt: "x", tourCompletedAt: "x" },
    }),
  },
}));
jest.mock("@/context/auth", () => {
  const user = { id: "u", cryptoSalt: null };
  return { useAuth: () => ({ user }) };
});
jest.mock("@/crypto/diary-key-context", () => ({
  DiaryKeyProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/components/TourOverlay", () => ({ TourOverlay: () => null }));

import TabsLayout from "./_layout";

async function pestanas() {
  mockPestanas.length = 0;
  render(<TabsLayout />);
  await waitFor(() => expect(mockPestanas.length).toBeGreaterThan(0));
  return new Map(mockPestanas.map((p) => [p.name, p.options]));
}

it("Terapia no tiene pestaña, y su ruta sigue existiendo", async () => {
  const p = await pestanas();
  // `href: null` oculta la pestaña; quitar la entrada la volvería a mostrar,
  // porque expo-router pinta por defecto toda ruta que encuentra.
  expect(p.get("terapia")?.href).toBeNull();
});

it("ninguna pestaña visible ofrece terapia", async () => {
  for (const [, o] of await pestanas()) {
    if (o.href === null) continue;
    expect(`${o.title} ${o.tabBarLabel ?? ""}`).not.toMatch(/terapia/i);
  }
});

it("la ayuda inmediata tiene pestaña visible", async () => {
  const ayuda = (await pestanas()).get("ayuda");
  expect(ayuda).toBeDefined();
  expect(ayuda?.href).toBeUndefined();
  expect(ayuda?.title).toBe("Ayuda inmediata");
  expect(ayuda?.tabBarLabel).toBe("Ayuda");
});

it("y es la MISMA pantalla que `terapia/crisis`, no una copia", () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const pestana = require("./ayuda").default;
  const crisis = require("./terapia/crisis").default;
  /* eslint-enable @typescript-eslint/no-var-requires */
  expect(pestana).toBe(crisis);
});

it("las notificaciones no ofrecen recordatorios de terapia", () => {
  const src = fs.readFileSync(`${__dirname}/notifications.tsx`, "utf8");
  expect(src).not.toMatch(/key: "terapiaReminders"/);
  // Control: la lista de interruptores sigue siendo la que se mira.
  expect(src).toMatch(/key: "weeklyReport"/);
});

/** Una pantalla nueva de terapia tiene que decir de qué lado está. */
describe("toda pantalla de terapia está clasificada", () => {
  const PANTALLAS: Record<string, "oferta" | "continuidad" | "ayuda"> = {
    "index.tsx": "oferta",
    "terapeutas/index.tsx": "oferta",
    "terapeutas/[id]/index.tsx": "oferta",
    "terapeutas/[id]/reservar.tsx": "oferta",
    "sesiones/index.tsx": "continuidad",
    "sesiones/[id].tsx": "continuidad",
    "recetas.tsx": "continuidad",
    "notificaciones.tsx": "continuidad",
    "crisis.tsx": "ayuda",
  };
  const RAIZ = `${__dirname}/terapia`;

  function pantallas(dir: string, prefijo = ""): string[] {
    return fs.readdirSync(dir).flatMap((e) => {
      if (fs.statSync(`${dir}/${e}`).isDirectory()) {
        return pantallas(`${dir}/${e}`, `${prefijo}${e}/`);
      }
      return /\.tsx$/.test(e) && !/test\.tsx$/.test(e) && e !== "_layout.tsx"
        ? [`${prefijo}${e}`]
        : [];
    });
  }

  it("ninguna sin clasificar", () => {
    expect(pantallas(RAIZ).sort()).toEqual(Object.keys(PANTALLAS).sort());
  });

  it.each(Object.entries(PANTALLAS).filter(([, c]) => c === "oferta"))(
    "%s pasa por la puerta",
    (ruta) => {
      const src = fs.readFileSync(`${RAIZ}/${ruta}`, "utf8");
      expect(src).toMatch(
        /<PuertaDeTerapia>|if \(!hub \|\| !\(hub\.offer\?\.open \?\? false\)\)/,
      );
    },
  );
});
