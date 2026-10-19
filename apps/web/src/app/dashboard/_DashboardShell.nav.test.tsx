import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/mapa",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => {
  // El armazón consulta `matchMedia` para decidir si el carril es permanente
  // o cajón, y jsdom no lo trae.
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

function montar() {
  return render(
    <DashboardShell
      user={
        {
          id: "u1",
          email: "demo@local.test",
          role: "ADMIN",
          plan: "PRO",
        } as never
      }
      cryptoSalt={null}
      showTour={false}
      initialDiaryWrapKey={null}
      initialMood={null}
      initialAmbient={"calma" as never}
    >
      <div />
    </DashboardShell>,
  );
}

/**
 * Lo que la navegación del panel tiene que seguir siendo.
 *
 * El carril se alineó con `FeelVerse Revisión Visual.html`, donde la
 * navegación se sostiene en tipografía y estado, sin iconos. Los que había
 * venían de `redesign-v2`, la dirección descartada el 27-09. Si alguien los
 * devuelve «por comodidad», esto falla.
 *
 * El aspecto —ancho, relleno, color del activo por tema— no se mide aquí: eso
 * depende de CSS que jsdom no resuelve, y se comprueba en el navegador contra
 * el panel autenticado.
 */
describe("la navegación del carril", () => {
  it("no lleva ningún icono en sus ítems", () => {
    const { container } = montar();
    const items = [...container.querySelectorAll("aside.side a.nav-item")];
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(item.querySelectorAll("svg")).toHaveLength(0);
    }
  });

  it("marca el ítem activo con aria-current, no sólo con color", () => {
    const { container } = montar();
    const activos = [...container.querySelectorAll("aside.side a.nav-item.on")];
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveAttribute("aria-current", "page");
    expect(activos[0].textContent?.trim()).toBe("Mapa Emocional");

    // Y los demás NO lo llevan: un `aria-current` en todos no dice nada.
    const inactivos = [
      ...container.querySelectorAll("aside.side a.nav-item:not(.on)"),
    ];
    for (const item of inactivos) {
      expect(item.getAttribute("aria-current")).toBeNull();
    }
  });

  it("conserva los destinos y los rótulos del producto", () => {
    const { container } = montar();
    const porEtiqueta = new Map(
      [...container.querySelectorAll("aside.side a.nav-item")].map((a) => [
        a.textContent?.trim(),
        a.getAttribute("href"),
      ]),
    );
    for (const [etiqueta, destino] of [
      ["Inicio", "/dashboard"],
      ["Mi Evolución", "/dashboard/evolucion"],
      ["Mapa Emocional", "/dashboard/mapa"],
      ["Patrones IA", "/dashboard/patrones"],
      ["Reflexiones", "/dashboard/reflexiones"],
      ["Exploraciones", "/dashboard/exploraciones"],
      ["Biblioteca", "/dashboard/biblioteca"],
      ["Eco", "/dashboard/eco"],
    ] as const) {
      expect(porEtiqueta.get(etiqueta)).toBe(destino);
    }
  });

  it("el chevron del bloque de cuenta se conserva, y es el único glifo suelto", () => {
    const { container } = montar();
    const cuenta = container.querySelector("aside.side button[aria-expanded]");
    expect(cuenta).not.toBeNull();
    // Se conserva porque no decora: dice si el bloque está plegado, que es lo
    // que su etiqueta no puede decir.
    expect(cuenta?.querySelectorAll("svg")).toHaveLength(1);
    expect(cuenta).toHaveAttribute("aria-expanded", "false");
  });

  it("«Cerrar sesión» ya no lleva icono", () => {
    const { container } = montar();
    const salir = [...container.querySelectorAll("aside.side button")].find(
      (b) => b.textContent?.trim() === "Cerrar sesión",
    );
    expect(salir).toBeDefined();
    expect(salir?.querySelectorAll("svg")).toHaveLength(0);
  });
});
