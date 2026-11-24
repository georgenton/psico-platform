import { Pressable, TextInput } from "react-native";
import { render, screen } from "@testing-library/react-native";
import type { UserMeResponse } from "@psico/types";

import { EmailChangeCard } from "./EmailChangeCard";

const me = {
  user: { email: "ana@example.com" },
} as unknown as UserMeResponse;

describe("EmailChangeCard (móvil)", () => {
  it("enseña el correo actual y dice que no se puede cambiar", () => {
    render(<EmailChangeCard me={me} />);

    expect(screen.getByText("ana@example.com")).toBeOnTheScreen();
    expect(
      screen.getByText("Por ahora no se puede cambiar el correo desde la app."),
    ).toBeOnTheScreen();
  });

  it("no ofrece ningún control", () => {
    const { UNSAFE_queryAllByType } = render(<EmailChangeCard me={me} />);

    expect(UNSAFE_queryAllByType(Pressable)).toHaveLength(0);
    expect(UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
    expect(screen.queryByTestId("email-change-toggle")).toBeNull();
  });

  it("no promete fecha, ni soporte, ni un correo que no se envía", () => {
    render(<EmailChangeCard me={me} />);

    expect(
      screen.queryByText(/soporte|pronto|próxim|verificación|enlace|enviar/i),
    ).toBeNull();
  });
});
