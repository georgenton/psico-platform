import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Landing } from "./Landing";

/**
 * Lo que la cabecera pública tiene que seguir ofreciendo.
 *
 * Existe por un hueco medido, no por gusto: antes de este cambio, de los 77
 * controles de la landing NINGUNO llevaba a `/register`. La única puerta decía
 * «Entrar», que quien no tiene cuenta lee como «ya tengo una». Si alguien
 * vuelve a convertir la adquisición en un acceso, estas pruebas fallan.
 *
 * No comprueban estética. El ancho, el reflujo y la jerarquía visual se miden
 * en el navegador con `scripts/landing/verificar.mjs`, que ya recorre los seis
 * anchos donde la fila de la cabecera cambia.
 */

/**
 * La FILA de la cabecera, no todo el `<header>`.
 *
 * El cajón vive dentro del mismo `<header>` y repite las acciones a propósito,
 * porque por debajo de 1140 px la fila no muestra la navegación. Contar sobre
 * el header entero mezcla las dos presentaciones y da el doble de todo.
 */
function fila(container: HTMLElement) {
  const f = container.querySelector("header.fh-head .fh-head-in");
  if (!f) throw new Error("no se encontró la fila de la cabecera");
  return f;
}

/** El cajón, la otra presentación de la misma navegación. */
function cajon(container: HTMLElement) {
  const c = container.querySelector("header.fh-head .fh-drawer");
  if (!c) throw new Error("no se encontró el cajón");
  return c;
}

describe("la cabecera invita a crear cuenta", () => {
  it("«Crear cuenta» es la llamada PRINCIPAL y lleva al registro", () => {
    const { container } = render(<Landing />);
    const head = fila(container);

    const crear = [...head.querySelectorAll("a")].filter(
      (a) => a.textContent?.trim() === "Crear cuenta",
    );
    expect(crear).toHaveLength(1);
    expect(crear[0]).toHaveAttribute("href", "/register");
    // `fh-btn-1` es el estilo principal; `fh-btn-2`, el secundario.
    expect(crear[0].className).toContain("fh-btn-1");
  });

  it("sólo hay UNA llamada principal en cada presentación", () => {
    const { container } = render(<Landing />);
    for (const zona of [fila(container), cajon(container)]) {
      const principales = [...zona.querySelectorAll(".fh-btn-1")];
      expect(principales).toHaveLength(1);
      expect(principales[0].textContent?.trim()).toBe("Crear cuenta");
    }
  });

  it("quien ya tiene cuenta sigue teniendo «Entrar», y no como botón", () => {
    const { container } = render(<Landing />);
    const head = fila(container);

    const entrar = [...head.querySelectorAll("a")].filter(
      (a) => a.textContent?.trim() === "Entrar",
    );
    expect(entrar).toHaveLength(1);
    expect(entrar[0]).toHaveAttribute("href", "/login");

    // El de la fila es enlace de texto, no botón: no compite con la
    // adquisición. El del cajón sí es botón, porque allí no hay jerarquía de
    // ancho que distinga un enlace de un botón.
    const enLaFila = head.querySelector(".fh-enter .fh-enter-link");
    expect(enLaFila).not.toBeNull();
    expect(enLaFila?.className).not.toContain("fh-btn-1");
  });

  it("la demostración se conserva, en secundaria", () => {
    const { container } = render(<Landing />);
    const ver = [...fila(container).querySelectorAll("a")].filter(
      (a) => a.textContent?.trim() === "Ver una experiencia",
    );
    expect(ver.length).toBeGreaterThanOrEqual(1);
    // Se conserva porque es parte del diseño aprobado y es lo que hace la
    // página explorable; lo que cambia es que ya no es la llamada principal.
    expect(ver[0].className).toContain("fh-btn-2");
  });

  it("la adquisición vive donde sobrevive a todos los anchos", () => {
    // `fh-enter` es el único contenedor que el CSS no esconde: por debajo de
    // 1140 px oculta `.fh-nav` y `.fh-cta-desk`. Si «Crear cuenta» sale de
    // aquí, desaparece en móvil — que es justo donde más importa.
    const { container } = render(<Landing />);
    const dentro = fila(container).querySelector(
      '.fh-enter a[href="/register"]',
    );
    expect(dentro).not.toBeNull();
    expect(dentro?.textContent?.trim()).toBe("Crear cuenta");
  });

  it("no se duplica ni se pierde ninguna de las tres acciones", () => {
    render(<Landing />);
    // Una sola vez cada etiqueta en toda la página contando fila + cajón:
    // «Crear cuenta» y «Ver una experiencia» aparecen en los dos sitios, y
    // «Entrar» también. Lo que no puede pasar es que falte alguna.
    for (const etiqueta of ["Crear cuenta", "Entrar", "Ver una experiencia"]) {
      expect(screen.getAllByText(etiqueta).length).toBeGreaterThanOrEqual(1);
    }
  });
});
