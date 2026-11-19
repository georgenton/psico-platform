import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PaywallCard } from "./PaywallCard";

/**
 * El muro de Patrones, montado en sus dos estados.
 *
 * Misma lección que `UpgradeCard.test.tsx`: comprobar que «Hazte Pro» aparece
 * después de la guarda no distingue qué rama le toca a qué valor. Aquí se
 * monta y se pregunta.
 */

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("PaywallCard · con las compras CERRADAS", () => {
  it("no ofrece «Hazte Pro»", () => {
    render(<PaywallCard entryCount={12} purchasesOpen={false} />);
    // Mata la inversión de ramas: con `purchasesOpen=false` ese enlace no
    // puede existir, esté donde esté escrito en el fichero.
    expect(screen.queryByText(/Hazte Pro/)).toBeNull();
  });

  it("explica por qué no se puede activar, y enlaza a Mi plan sin parecer una compra", () => {
    render(<PaywallCard entryCount={12} purchasesOpen={false} />);
    expect(
      screen.getByText(/Las compras todavía no están disponibles/),
    ).toBeInTheDocument();
    const enlace = screen.getByRole("link", { name: "Ver mi plan" });
    expect(enlace).toHaveAttribute("href", "/dashboard/plan");
  });

  it("sigue contando lo que esta persona ya lleva escrito", () => {
    render(<PaywallCard entryCount={12} purchasesOpen={false} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});

describe("PaywallCard · con las compras ABIERTAS", () => {
  it("ofrece «Hazte Pro →» hacia Mi plan", () => {
    render(<PaywallCard entryCount={12} purchasesOpen />);
    const cta = screen.getByRole("link", { name: /Hazte Pro/ });
    expect(cta).toHaveAttribute("href", "/dashboard/plan");
  });

  it("y entonces NO dice que las compras no están disponibles", () => {
    render(<PaywallCard entryCount={12} purchasesOpen />);
    expect(screen.queryByText(/Las compras todavía no están disponibles/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver mi plan" })).toBeNull();
  });
});
