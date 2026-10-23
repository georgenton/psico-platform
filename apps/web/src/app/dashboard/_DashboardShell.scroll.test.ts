import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * El carril tiene que poder desplazarse por dentro.
 *
 * Reproducido con rol ADMIN a 1440×768 y 1024×768: 954 px de contenido en una
 * caja de 768, y «Cerrar sesión» fuera de alcance. No bastaba con hacer scroll
 * en la página —el carril es `sticky`, así que se queda anclado— ni con el
 * teclado, porque el navegador no desplaza un contenedor que no declara
 * desbordamiento: `scrollTop` se quedaba en 0.
 *
 * Con rol USER el contenido entra justo, y por eso había pasado desapercibido.
 *
 * La prueba ata la exigencia a su CAUSA en vez de al literal. Si algún día el
 * carril deja de ser `sticky` con alto fijo, desaparece el motivo y deja de
 * exigirse; mientras lo sea, un carril sin desbordamiento declarado esconde
 * contenido y esto falla.
 */

const CSS = readFileSync(join(__dirname, "..", "dashboard-design.css"), "utf8");

/** Las declaraciones de la primera regla cuyo selector sea exactamente `sel`. */
function declaraciones(sel: string, desde = 0): Map<string, string> {
  const re = new RegExp(`(^|[\\n}])\\s*${sel.replace(".", "\\.")}\\s*\\{`, "g");
  re.lastIndex = desde;
  const m = re.exec(CSS);
  if (!m) throw new Error(`no se encontró la regla ${sel}`);
  const abre = CSS.indexOf("{", m.index);
  const cierra = CSS.indexOf("}", abre);
  const mapa = new Map<string, string>();
  for (const d of CSS.slice(abre + 1, cierra).split(";")) {
    const i = d.indexOf(":");
    if (i > 0) mapa.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return mapa;
}

describe("el carril del panel no puede esconder contenido", () => {
  it("si es sticky con alto fijo, declara desbordamiento vertical", () => {
    const side = declaraciones(".side");

    // El motivo: ancla la altura al viewport y se queda fijo al hacer scroll.
    expect(side.get("position")).toBe("sticky");
    expect(side.get("height")).toBe("100vh");

    // Entonces lo que sobre tiene que poder alcanzarse DENTRO del carril.
    expect(side.get("overflow-y")).toMatch(/^(auto|scroll)$/);
  });

  it("el cajón móvil conserva el suyo", () => {
    // Ya lo tenía, y es la razón de que a 200 % de zoom —donde el diseño pasa
    // a cajón— el defecto no apareciera. Que la corrección del escritorio no
    // se lo lleve por delante.
    const i = CSS.indexOf("@media (max-width: 1023px)");
    expect(i).toBeGreaterThan(0);
    expect(declaraciones(".side", i).get("overflow-y")).toMatch(
      /^(auto|scroll)$/,
    );
  });

  it("la corrección no toca el ancho ni el ritmo acordados con la referencia", () => {
    const side = declaraciones(".side");
    // Guard the guard: si alguien «arregla» el recorte ensanchando el carril o
    // apretando el ritmo, esto lo delata.
    expect(side.get("padding")).toBe("16px 8px");
    expect(side.get("gap")).toBe("2px");
    expect(CSS).toContain("grid-template-columns: 200px 1fr");
  });
});
