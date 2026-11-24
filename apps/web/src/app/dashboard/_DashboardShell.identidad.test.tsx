import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { identidadDeCuenta } from "@/lib/identidad";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

const CORREO = "persona.de.prueba@psico.test";

function montar(identidad?: ReturnType<typeof identidadDeCuenta>) {
  const { container } = render(
    <DashboardShell
      user={
        { userId: "u1", email: CORREO, role: "USER", plan: "FREE" } as never
      }
      {...(identidad ? { identidad } : {})}
      cryptoSalt={null}
      showTour={false}
      initialDiaryWrapKey={null}
      initialMood={null}
      initialAmbient={"calma" as never}
    >
      <div />
    </DashboardShell>,
  );
  const avatar = container.querySelector(".topbar a.tb-ava");
  const cuenta = container.querySelector("aside.side [data-account-block]");
  if (!avatar || !cuenta) throw new Error("faltan el avatar o la cuenta");
  return { container, avatar, cuenta };
}

/**
 * El armazón nombra a la persona que lo está usando.
 *
 * El avatar de la barra decía «AV» a todo el mundo y el carril enseñaba el
 * correo en el sitio del nombre.
 */
describe("la identidad en el armazón", () => {
  it("pinta las iniciales y el nombre de la persona, en los dos sitios", () => {
    const { avatar, cuenta } = montar(
      identidadDeCuenta({ nombre: "María José Ñáñez", iniciales: "MÑ" }),
    );
    expect(avatar.textContent).toBe("MÑ");
    expect(cuenta.textContent).toContain("MÑ");
    expect(cuenta.textContent).toContain("María José Ñáñez");
  });

  it("no escribe el correo en ninguna parte del armazón, con nombre o sin él", () => {
    for (const identidad of [
      identidadDeCuenta({ nombre: "Ana", iniciales: "AN", correo: CORREO }),
      identidadDeCuenta({ nombre: CORREO, iniciales: "PE", correo: CORREO }),
      undefined,
    ]) {
      const { container } = montar(identidad);
      // `outerHTML` y no `textContent`: tampoco en un title ni en un aria-label.
      expect(container.innerHTML).not.toContain(CORREO);
    }
  });

  it("sin nombre hay respaldo: la inicial del correo y «Tu cuenta», nunca «AV» ni vacío", () => {
    const { avatar, cuenta } = montar();
    expect(avatar.textContent).toBe("P");
    expect(cuenta.textContent).toContain("Tu cuenta");
    expect(`${avatar.textContent}${cuenta.textContent}`).not.toContain("AV");
  });

  it("dice de quién es a quien no ve la pantalla", () => {
    const { avatar, cuenta } = montar(
      identidadDeCuenta({ nombre: "Ana Luna", iniciales: "AL" }),
    );
    expect(avatar).toHaveAttribute("aria-label", "Perfil de Ana Luna");
    expect(avatar).toHaveAttribute("href", "/dashboard/perfil");
    expect(cuenta).toHaveAttribute("aria-label", "Cuenta de Ana Luna");
    // El nombre accesible contiene el texto visible (2.5.3).
    expect(cuenta.getAttribute("aria-label")).toContain("Ana Luna");
  });

  it("un nombre largo se corta a la vista pero se puede leer entero", () => {
    const largo = "María Fernanda de los Ángeles Villavicencio Espinosa";
    const { cuenta } = montar(identidadDeCuenta({ nombre: largo }));
    expect(cuenta.querySelector(`[title="${largo}"]`)).not.toBeNull();
  });

  it("el layout la resuelve desde `/user/me`, que es quien sabe el nombre", () => {
    // Un Server Component con cookies no se monta fuera de una petición; lo que
    // se puede perder en un refactor es el cable.
    const layout = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    expect(layout).toMatch(/nombre: me\?\.user\.firstName/);
    expect(layout).toMatch(/iniciales: me\?\.user\.initials/);
    expect(layout).toMatch(/identidad=\{identidad\}/);
  });
});
