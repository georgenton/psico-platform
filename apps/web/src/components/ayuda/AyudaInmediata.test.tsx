import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CRISIS_COUNTRIES,
  CRISIS_COUNTRY_NAMES,
  getCrisisFor,
  type CrisisCountry,
  type CrisisLine,
} from "@psico/types";

import { AyudaInmediata, Linea } from "./AyudaInmediata";

/**
 * La pantalla de ayuda, por lo que alguien puede HACER con ella.
 *
 * Los `tel:` esperados están escritos a mano y no derivados del catálogo: una
 * prueba que calculase el número con el mismo código que la pantalla no
 * comprobaría nada. Es la tabla de lo que hay que marcar, y cambiar un teléfono
 * obliga a cambiarla a la vista.
 */
const MARCAR: Record<CrisisCountry, ReadonlyArray<[string, string]>> = {
  EC: [
    ["SAS · 911 Salud Mental", "tel:911"],
    ["CETAD · Centro de Escucha Telefónica", "tel:+593-2-3960-100"],
    ["Teléfono de la Amistad Quito", "tel:+593-2-2563-141"],
  ],
  CO: [["Línea 106 · Apoyo Emocional", "tel:106"]],
  MX: [["SAPTEL", "tel:+52-55-5259-8121"]],
};

const VUELTA = { href: "/", texto: "Volver a la portada" };

const montar = (pais: CrisisCountry, desde: "eco" | "terapia" | null = null) =>
  render(<AyudaInmediata pais={pais} desde={desde} vuelta={VUELTA} />);

describe.each(CRISIS_COUNTRIES)("la ayuda en %s", (pais) => {
  const datos = getCrisisFor(pais);

  it("enseña todas sus líneas, en su orden y con el número que se marca", () => {
    const { container } = montar(pais);
    const nombres = [...container.querySelectorAll("h3")].map(
      (h) => h.textContent,
    );
    const llamadas = [...container.querySelectorAll('a[href^="tel:"]')].map(
      (a) => a.getAttribute("href"),
    );
    expect(nombres).toEqual(MARCAR[pais].map(([nombre]) => nombre));
    expect(llamadas).toEqual(MARCAR[pais].map(([, tel]) => tel));
  });

  it("el `tel:` lleva los mismos dígitos que el número escrito, y ninguna letra", () => {
    montar(pais);
    for (const linea of datos.lines) {
      const enlace = screen.getByRole("link", {
        name: `Llamar al ${linea.phone} (${linea.name})`,
      });
      const tel = enlace.getAttribute("href")!.slice("tel:".length);
      const digitos = (s: string) => s.replace(/[^0-9]/g, "");
      expect(digitos(tel)).toBe(digitos(linea.phone));
      expect(tel).toMatch(/^\+?[0-9-]+$/);
    }
  });

  it("dice el horario tal cual y el idioma en palabras", () => {
    montar(pais);
    for (const linea of datos.lines) {
      const tarjeta = screen.getByText(linea.name, {
        selector: "h3",
      }).parentElement!;
      expect(tarjeta).toHaveTextContent(linea.availability);
      expect(tarjeta).toHaveTextContent("español");
    }
  });

  it("conserva los consejos y los pasos, en su orden", () => {
    montar(pais);
    const items = (titulo: RegExp) =>
      within(screen.getByRole("region", { name: titulo }))
        .getAllByRole("listitem")
        .map((li) => li.textContent);
    expect(items(/mientras tanto/i)).toEqual(datos.safetyTipsShort);
    expect(items(/próximos pasos/i)).toEqual(datos.nextSteps);
  });

  it("anuncia el país activo, y no sólo con color", () => {
    const { container } = montar(pais);
    const nav = screen.getByRole("navigation", { name: "Elegir país" });
    const activos = [...nav.querySelectorAll('[aria-current="page"]')];
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveTextContent(CRISIS_COUNTRY_NAMES[pais]);
    // La marca va además del atributo: quien ve la pantalla sin distinguir el
    // color tiene que poder leerla.
    expect(activos[0].textContent).toContain("✓");
    expect(nav.textContent?.match(/✓/g)).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        name: `Líneas en ${CRISIS_COUNTRY_NAMES[pais]}`,
      }),
    ).toBeInTheDocument();
    expect(container.querySelector("#lineas")).toContainElement(nav);
  });

  it("no añade ningún número que el catálogo no traiga", () => {
    const { container } = montar(pais);
    const delCatalogo = JSON.stringify(datos);
    // Secuencias de tres cifras o más. Un número de emergencias escrito aquí
    // «de memoria» sería el primero en aparecer.
    for (const n of container.textContent!.match(/\d{3,}/g) ?? []) {
      expect(delCatalogo).toContain(n);
    }
  });
});

describe("elegir país", () => {
  it("ofrece los del catálogo como enlaces, sin JavaScript de por medio", () => {
    montar("EC");
    const nav = screen.getByRole("navigation", { name: "Elegir país" });
    const enlaces = within(nav).getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual([
      "/ayuda?pais=EC#lineas",
      "/ayuda?pais=CO#lineas",
      "/ayuda?pais=MX#lineas",
    ]);
  });

  it("no pierde por el camino de dónde se venía", () => {
    montar("EC", "eco");
    const nav = screen.getByRole("navigation", { name: "Elegir país" });
    for (const a of within(nav).getAllByRole("link")) {
      expect(a.getAttribute("href")).toContain("desde=eco");
    }
  });

  it("para otro país remite al directorio del catálogo, y no estrena su teléfono", () => {
    const { container } = montar("EC");
    const directorio = screen.getByRole("link", { name: /findahelpline\.com/ });
    expect(directorio).toHaveAttribute("href", "https://findahelpline.com");
    expect(directorio).toHaveAttribute("rel", "noopener noreferrer");
    // La entrada internacional trae un 1-800 que ninguna pantalla ha enseñado.
    expect(container.textContent).not.toContain("273-8255");
    expect(container.innerHTML).not.toContain("273-8255");
  });
});

describe("lo que dice", () => {
  it("que FeelVerse no es un servicio de emergencias, y qué hacer si lo es", () => {
    const { container } = montar("EC");
    expect(container.textContent).toContain(
      "FeelVerse no es un servicio de emergencias.",
    );
    expect(container.textContent).toContain(
      "llama ahora al número de emergencias de tu país",
    );
  });

  it("antes que las líneas, y las líneas antes que lo demás", () => {
    const { container } = montar("EC");
    const t = container.textContent!;
    const orden = [
      "no es un servicio de emergencias",
      "Líneas en Ecuador",
      "Mientras tanto",
      "Próximos pasos",
      "Si estás en otro país",
    ].map((x) => t.indexOf(x));
    expect(orden).not.toContain(-1);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("sin «hub», sin «acá» y sin prometer que alguien responde ahora", () => {
    const { container } = montar("EC");
    const t = container.textContent!.toLowerCase();
    expect(t).not.toMatch(/\bhub\b/);
    expect(t).not.toMatch(/\bacá\b/);
    // Dos de las tres líneas de Ecuador tienen horario.
    expect(t).not.toContain("ahora mismo");
  });

  it("tiene un solo título de página y un solo landmark principal", () => {
    const { container } = montar("EC");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("el «volver» es el que le dan", () => {
    montar("EC");
    expect(
      screen.getByRole("link", { name: /volver a la portada/i }),
    ).toHaveAttribute("href", "/");
  });

  it("no monta scripts, formularios ni recursos de fuera", () => {
    const { container } = montar("EC");
    expect(
      container.querySelectorAll("script, form, img, iframe, link, video"),
    ).toHaveLength(0);
  });
});

describe("una línea", () => {
  const base: CrisisLine = {
    id: "x",
    name: "Línea X",
    phone: "171",
    availability: "24/7",
    languages: ["es", "en", "qu"],
  };

  it("con mnemotecnia marca los dígitos, no las letras", () => {
    // El defecto que ya se corrigió en el modal de Eco: quitar lo que no sea
    // dígito daba `18004180047258`, un número que no existe.
    render(<Linea linea={{ ...base, phone: "1800-4-SALUD (1800-472583)" }} />);
    const a = screen.getByRole("link", { name: /Llamar al 1800-4-SALUD/ });
    expect(a).toHaveAttribute("href", "tel:1800-472583");
  });

  it("sin forma marcable se enseña como texto, nunca como un enlace muerto", () => {
    const { container } = render(
      <Linea linea={{ ...base, phone: "Busca tu línea local" }} />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(
      screen.getByText("Llama al Busca tu línea local"),
    ).toBeInTheDocument();
  });

  it("WhatsApp y chat, si los declara, como antes", () => {
    render(
      <Linea
        linea={{
          ...base,
          whatsapp: "+593 99 000 0000",
          chatUrl: "https://ejemplo.test/chat",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      "https://wa.me/593990000000",
    );
    const chat = screen.getByRole("link", { name: /Chat web/ });
    expect(chat).toHaveAttribute("href", "https://ejemplo.test/chat");
    expect(chat).toHaveAttribute("target", "_blank");
    expect(chat).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("un idioma sin traducción se enseña como viene, no se pierde", () => {
    const { container } = render(<Linea linea={base} />);
    expect(container.textContent).toContain("español, inglés, qu");
  });
});
