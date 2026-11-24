import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UserMeResponse } from "@psico/types";

import { EmailChangeCard } from "./EmailChangeCard";

const me = {
  user: { email: "ana@example.com" },
} as unknown as UserMeResponse;

describe("EmailChangeCard", () => {
  it("enseña el correo actual y dice que no se puede cambiar", () => {
    render(<EmailChangeCard me={me} />);

    const tarjeta = screen.getByTestId("email-change-card");
    expect(tarjeta).toHaveTextContent(
      "Tu correo actual es ana@example.com. Por ahora no se puede cambiar el correo desde la app.",
    );
  });

  it("no ofrece ningún control: ni botón, ni campo, ni formulario", () => {
    const { container } = render(<EmailChangeCard me={me} />);

    // Cualquier control, no sólo el botón que había: la operación está
    // retirada, así que no hay nada que pulsar ni que rellenar aquí.
    expect(
      container.querySelector("button, a, input, textarea, select, form"),
    ).toBeNull();
  });

  it("no promete fecha, ni soporte, ni un correo que no se envía", () => {
    render(<EmailChangeCard me={me} />);

    expect(screen.getByTestId("email-change-card")).not.toHaveTextContent(
      /soporte|pronto|próxim|verificación|enlace|enviar/i,
    );
  });
});
