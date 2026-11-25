import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Los tres caminos que abren una sesión dejan pendiente la identidad de las
 * demás pestañas en cuanto vuelven, todavía con el formulario montado.
 *
 * Con el formulario montado es la mitad que importa: antes se avisaba al salir,
 * y mientras el destino tardaba la marca seguía siendo la de otra cuenta. Ver
 * `lib/crypto/sesion-vigente.tsx`.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  return {
    default: function Script({ onLoad }: { onLoad?: () => void }) {
      useEffect(() => onLoad?.(), []);
      return null;
    },
  };
});

type Resultado = { error: string } | undefined;
const acciones = vi.hoisted(() => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
  loginWithGoogleAction: vi.fn(),
}));
vi.mock("@/actions/auth", () => acciones);

const LoginForm = (await import("./login/_LoginForm")).default;
const RegisterPage = (await import("./register/page")).default;

const CLAVE = "psico:cuenta";
const MARCA_A = "marca-de-a-000001";
const marcaAhora = () => window.localStorage.getItem(CLAVE);

let volver: (r: Resultado) => void;
let alCredencial: ((r: { credential: string }) => void) | undefined;

beforeEach(() => {
  window.localStorage.clear();
  alCredencial = undefined;
  for (const accion of Object.values(acciones)) {
    accion.mockReset().mockImplementation(
      () =>
        new Promise<Resultado>((r) => {
          volver = r;
        }),
    );
  }
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("google", {
    accounts: {
      id: {
        initialize: (c: { callback: typeof alCredencial }) => {
          alCredencial = c.callback;
        },
        renderButton: vi.fn(),
        disableAutoSelect: vi.fn(),
      },
    },
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 320,
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const escribir = (c: HTMLElement, nombre: string, valor: string) =>
  fireEvent.change(c.querySelector(`input[name="${nombre}"]`)!, {
    target: { value: valor },
  });

const CAMINOS: [string, () => Promise<() => void>][] = [
  [
    "el acceso",
    async () => {
      const { container } = render(<LoginForm />);
      escribir(container, "email", "b@psico.test");
      escribir(container, "password", "una contraseña larga");
      await act(async () => fireEvent.submit(container.querySelector("form")!));
      expect(acciones.loginAction).toHaveBeenCalledTimes(1);
      return () => expect(container.querySelector("form")).not.toBeNull();
    },
  ],
  [
    "el registro",
    async () => {
      const { container } = render(<RegisterPage />);
      escribir(container, "name", "Bea");
      escribir(container, "email", "b@psico.test");
      escribir(container, "password", "una contraseña larga");
      escribir(container, "confirm", "una contraseña larga");
      await act(async () => fireEvent.submit(container.querySelector("form")!));
      expect(acciones.registerAction).toHaveBeenCalledTimes(1);
      return () => expect(container.querySelector("form")).not.toBeNull();
    },
  ],
  [
    "Google",
    async () => {
      vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "prueba.apps.example");
      const { container } = render(<LoginForm />);
      await act(async () => alCredencial!({ credential: "un-token" }));
      expect(acciones.loginWithGoogleAction).toHaveBeenCalledTimes(1);
      return () => expect(container.querySelector("form")).not.toBeNull();
    },
  ],
];

describe.each(CAMINOS)("por %s", (_, enviar) => {
  it("al volver, la marca deja de ser la de A con el formulario aún montado", async () => {
    const sigueMontado = await enviar();
    // Entretanto, en otro formulario entró A y su panel quedó confirmado.
    window.localStorage.setItem(CLAVE, MARCA_A);
    await act(async () => volver(undefined));
    expect(marcaAhora()).toMatch(/^nadie:/);
    sigueMontado();
  });

  it("si se rechaza, A no se entera, y aquí se dice por qué", async () => {
    await enviar();
    window.localStorage.setItem(CLAVE, MARCA_A);
    await act(async () => volver({ error: "No pudo ser." }));
    expect(marcaAhora()).toBe(MARCA_A);
    expect(screen.getByText("No pudo ser.")).toBeInTheDocument();
  });
});

// ─── Trinquetes sobre el código ──────────────────────────────────────────────

const SRC = join(__dirname, "..", "..");

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(n) && !/\.(test|spec)\./.test(n) ? [ruta] : [];
  });
}

const FICHEROS = fuentes(SRC).map((ruta) => ({
  nombre: ruta.slice(SRC.length + 1),
  texto: readFileSync(ruta, "utf8"),
}));

describe("nadie abre una sesión sin avisar", () => {
  it("cada llamada a una acción que la abre va dentro de `enviarAcceso`", () => {
    const llamadas = FICHEROS.filter(
      (f) => f.nombre !== join("actions", "auth.ts"),
    ).flatMap((f) =>
      [
        ...f.texto.matchAll(
          /(enviarAcceso\(\(\) =>\s*)?\b(loginAction|registerAction|loginWithGoogleAction)\(/g,
        ),
      ].map((m) => ({ donde: f.nombre, accion: m[2], avisa: Boolean(m[1]) })),
    );
    // Los tres, y sólo esos: si se añade un camino, se decide aquí.
    expect(llamadas.map((l) => l.accion).sort()).toEqual([
      "loginAction",
      "loginWithGoogleAction",
      "registerAction",
    ]);
    expect(llamadas.filter((l) => !l.avisa)).toEqual([]);
  });
});

describe("una llave y un token sólo se juntan si son de la misma cuenta", () => {
  /** Las que cifran o descifran con una llave y llaman con un token. */
  const JUNTAN = [
    "ActiveComposer",
    "ChangePasswordCard",
    "DiarioShell",
    "EcoShell",
    "EcoTab",
    "EntryDetailView",
    "ReflexionTab",
  ];
  /** Las pantallas por las que se entra a ellas. */
  const PANTALLAS = [
    "ChangePasswordCard",
    "DiarioShell",
    "EcoShell",
    "EntryDetailView",
    "LectorShell",
  ];

  it("son las que se sabe que son", () => {
    const halladas = FICHEROS.filter(
      (f) => /useDiaryKey\(\)/.test(f.texto) && /\btoken\b/.test(f.texto),
    )
      .map((f) => f.nombre.replace(/^.*[\\/]/, "").replace(/\.tsx$/, ""))
      .filter((n) => n !== "diary-key-context" && n !== "UnlockGate");
    expect(halladas.sort()).toEqual(JUNTAN);
  });

  it.each(PANTALLAS)(
    "%s entra siempre por `PantallaDeLaSesion`",
    (pantalla) => {
      const usos = FICHEROS.filter(
        (f) =>
          f.nombre.startsWith("app") &&
          new RegExp(`<${pantalla}[\\s>]`).test(f.texto),
      );
      expect(usos.length).toBeGreaterThan(0);
      for (const f of usos) {
        for (const m of f.texto.matchAll(
          new RegExp(`<${pantalla}[\\s>]`, "g"),
        )) {
          const antes = f.texto.slice(0, m.index);
          const abre = antes.lastIndexOf("<PantallaDeLaSesion>");
          expect([
            f.nombre,
            abre > antes.lastIndexOf("</PantallaDeLaSesion>"),
          ]).toEqual([f.nombre, true]);
        }
      }
    },
  );
});
