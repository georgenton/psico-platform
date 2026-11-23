import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AuthLayout from "./layout";

/**
 * El armazón común del acceso, el registro, la recuperación y la verificación:
 * la ayuda se enlaza aquí para que esté en las cuatro sin tocarlas.
 */
describe("las pantallas de acceso enlazan la ayuda", () => {
  it("con un enlace nativo a la página pública", () => {
    render(
      <AuthLayout>
        <p>formulario</p>
      </AuthLayout>,
    );
    const ayuda = screen.getByRole("link", { name: /líneas de ayuda/i });
    expect(ayuda).toHaveAttribute("href", "/ayuda");
  });

  it("después del formulario: no se interpone entre la persona y su cuenta", () => {
    render(
      <AuthLayout>
        <button type="button">Entrar</button>
      </AuthLayout>,
    );
    const ayuda = screen.getByRole("link", { name: /líneas de ayuda/i });
    const entrar = screen.getByRole("button", { name: "Entrar" });
    expect(
      entrar.compareDocumentPosition(ayuda) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
