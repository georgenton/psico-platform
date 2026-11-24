import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { act, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MASTER_KEY_LEN } from "@psico/crypto";

import { useDiaryKey } from "@/lib/crypto/diary-key-context";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/actions/diary-session", () => ({
  saveDiaryWrapKey: vi.fn(async () => undefined),
  clearDiaryWrapKey: vi.fn(async () => undefined),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

const { DashboardShell } = await import("./_DashboardShell");

const SAL = "YWJjZGVmZ2hpamtsbW5vcA";

function Pantalla() {
  const { key, isLegacyAccount, adoptMasterKey } = useDiaryKey();
  return (
    <div>
      <p data-testid="estado">
        {isLegacyAccount ? "sin cifrado" : key ? "abierto" : "cerrado"}
      </p>
      <button
        type="button"
        onClick={() => adoptMasterKey(new Uint8Array(MASTER_KEY_LEN).fill(1))}
      >
        abrir
      </button>
    </div>
  );
}

const armazon = (sal: string | null | undefined) => (
  <DashboardShell
    user={
      {
        userId: "u1",
        email: "demo@psico.test",
        role: "USER",
        plan: "FREE",
      } as never
    }
    cryptoSalt={sal}
    showTour={false}
    initialDiaryWrapKey={null}
    initialMood={null}
    initialAmbient={"calma" as never}
  >
    <Pantalla />
  </DashboardShell>
);

const estado = () => screen.getByTestId("estado").textContent;

/**
 * «No se sabe» no es «no tiene cifrado».
 *
 * `/user/me` puede fallar en un refresco —límite de peticiones, un 500— y el
 * layout se quedaba con `null`, que es lo que significa una cuenta sin cifrado.
 * Cerrar las claves al cambiar de cuenta convertiría ese fallo pasajero en un
 * Diario cerrado y en la pérdida de lo que se esté escribiendo.
 */
describe("un refresco en el que no se supo la cuenta", () => {
  it("no cierra el Diario ni dice que la cuenta no tiene cifrado", async () => {
    const vista = render(armazon(SAL));
    await act(async () => screen.getByText("abrir").click());
    expect(estado()).toBe("abierto");

    await act(async () => vista.rerender(armazon(undefined)));
    expect(estado()).toBe("abierto");
    await act(async () => vista.rerender(armazon(SAL)));
    expect(estado()).toBe("abierto");
  });

  it("control contrario: `null` sí es una cuenta sin cifrado, y cierra", async () => {
    const vista = render(armazon(SAL));
    await act(async () => screen.getByText("abrir").click());
    await act(async () => vista.rerender(armazon(null)));
    expect(estado()).toBe("sin cifrado");
    await act(async () => vista.rerender(armazon(SAL)));
    expect(estado()).toBe("cerrado");
  });

  it("en la primera carga no hay nada que recordar", () => {
    render(armazon(undefined));
    expect(estado()).toBe("sin cifrado");
  });
});

/**
 * Los cables que una prueba no puede montar: el layout es un Server Component
 * con cookies, y la retirada de la marca depende de en qué rutas se pinta.
 */
describe("los cables del cambio de cuenta", () => {
  const leer = (ruta: string) =>
    readFileSync(join(__dirname, "..", ruta), "utf8");

  it("el layout monta un panel por cuenta, y no por sal", () => {
    const layout = leer("dashboard/layout.tsx");
    expect(layout).toMatch(
      /<SesionVigenteProvider\s+key=\{user\?\.userId\}\s+marca=\{marcaDeCuenta\(user\?\.userId\)\}\s*>\s*<DashboardShell/,
    );
    // La sal cambia al cambiar la contraseña: con ella de clave, se cerraría.
    expect(layout).not.toMatch(/key=\{[^}]*[sS]alt[^}]*\}/);
    // Y «no se supo» llega como `undefined`.
    expect(layout).toMatch(/let cryptoSalt: string \| null \| undefined;/);
  });

  it("la marca se retira en el acceso y el registro, y en ninguna otra", () => {
    // `verify-email`, `forgot-password` y `reset-password` también se abren CON
    // sesión: retirarla ahí cerraría el Diario de las demás pestañas.
    const auth = join(__dirname, "..", "(auth)");
    const quien = (readdirSync(auth, { recursive: true }) as string[])
      .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f))
      .filter((f) =>
        readFileSync(join(auth, f), "utf8").includes("<RetirarMarcaDeCuenta"),
      )
      .sort();
    expect(quien).toEqual(["login/page.tsx", "register/page.tsx"]);

    const middleware = leer("../middleware.ts");
    expect(middleware).toContain(
      'const AUTH_PREFIXES = ["/login", "/register"];',
    );
  });
});
