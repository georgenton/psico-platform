import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanInfo } from "@psico/types";

import { PurchasesClosedNotice, UpgradeCard } from "./UpgradeCard";

/**
 * La tarjeta de plan, montada en sus DOS estados.
 *
 * ── Qué añade esto a lo que ya había ──────────────────────────────────────
 *
 * El trinquete de fichero comprobaba que el formulario apareciera DESPUÉS de
 * la guarda. Eso atrapa quitar la guarda, y no atrapa **intercambiar las dos
 * ramas**: con `purchasesOpen ? (aviso) : (formulario)` el formulario sigue
 * estando después y sigue habiendo uno solo, así que la prueba aprobaba una
 * pantalla que ofrece contratar exactamente cuando no se puede.
 *
 * Una posición en el texto no sabe qué rama corresponde a qué valor. Montarlo
 * sí: se le pasa `purchasesOpen` y se le pregunta qué ofrece.
 */

// La acción de checkout es un Server Action: importarla de verdad arrastra
// `next/headers`. Lo único que esta prueba necesita de ella es que exista para
// que `.bind` no reviente — lo que se mide es si el formulario se renderiza.
vi.mock("@/actions/subscription", () => ({
  createCheckoutAction: vi.fn(),
}));

const PRO: PlanInfo = {
  plan: "PRO",
  name: "Pro",
  prices: { monthly: 7, currency: "USD" },
  description: "Acceso completo a todos los libros y capítulos.",
  features: ["Acceso ilimitado a todos los libros", "Diario personal"],
};

const ANUAL: PlanInfo = {
  plan: "ANNUAL",
  name: "Pro Anual",
  prices: { yearly: 59, currency: "USD" },
  description: "Plan Pro al mejor precio.",
  features: ["Todo lo incluido en Pro"],
};

/** El control de compra: un botón de envío dentro de un formulario. */
function botonDeCompra(): HTMLElement | null {
  return screen.queryByRole("button", { name: /Actualizar a/i });
}

describe("UpgradeCard · con las compras CERRADAS", () => {
  it("no ofrece ningún control para contratar", () => {
    render(<UpgradeCard plan={PRO} isFeatured purchasesOpen={false} />);
    // La aserción que mata la inversión de ramas: con `purchasesOpen=false`
    // no puede existir el botón, viva donde viva en el fichero.
    expect(botonDeCompra()).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("dice en su lugar que no hay contratación disponible", () => {
    render(<UpgradeCard plan={PRO} isFeatured purchasesOpen={false} />);
    expect(screen.getByText("Sin contratación disponible")).toBeInTheDocument();
  });

  it("conserva el importe y lo marca como propuesta, con el aviso de la landing", () => {
    render(<UpgradeCard plan={PRO} isFeatured purchasesOpen={false} />);
    expect(screen.getByText("$7/mes")).toBeInTheDocument();
    expect(
      screen.getByText("Propuesta de precios · No disponible para compra"),
    ).toBeInTheDocument();
  });

  it("sigue describiendo el plan: nombre, descripción y lo que incluye", () => {
    // Cerrar la puerta no es esconder la información; la tarjeta sigue
    // sirviendo para saber qué habría en ese plan.
    render(<UpgradeCard plan={ANUAL} isFeatured={false} purchasesOpen={false} />);
    expect(screen.getByText("Pro Anual")).toBeInTheDocument();
    expect(screen.getByText("$59/año")).toBeInTheDocument();
    expect(screen.getByText("Todo lo incluido en Pro")).toBeInTheDocument();
  });
});

describe("UpgradeCard · con las compras ABIERTAS", () => {
  it("ofrece el control de compra dentro de un formulario", () => {
    render(<UpgradeCard plan={PRO} isFeatured purchasesOpen />);
    const boton = botonDeCompra();
    expect(boton).not.toBeNull();
    expect(boton).toHaveAttribute("type", "submit");
    expect(boton?.closest("form")).not.toBeNull();
  });

  it("y entonces NO dice que no hay contratación ni marca el importe como propuesta", () => {
    // El control contrario de los dos casos de arriba. Sin él, un componente
    // que renderizara las dos cosas a la vez aprobaría los dos bloques.
    render(<UpgradeCard plan={PRO} isFeatured purchasesOpen />);
    expect(screen.queryByText("Sin contratación disponible")).toBeNull();
    expect(
      screen.queryByText("Propuesta de precios · No disponible para compra"),
    ).toBeNull();
  });
});

describe("PurchasesClosedNotice", () => {
  it("explica que no se puede contratar y que el plan actual no cambia", () => {
    render(<PurchasesClosedNotice />);
    expect(
      screen.getByText("Las compras todavía no están disponibles"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tu plan actual sigue igual/),
    ).toBeInTheDocument();
  });
});
