import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PrivacyInfoButton } from "./PrivacyInfoButton";

describe("PrivacyInfoButton", () => {
  it("renders with the default label and no modal on mount", () => {
    render(<PrivacyInfoButton />);
    expect(
      screen.getByRole("button", { name: /Cómo protegemos tu diario/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("accepts a custom label", () => {
    render(<PrivacyInfoButton label="Más info" />);
    expect(screen.getByText("Más info")).toBeInTheDocument();
  });

  it("opens the modal with the analogy and 3 bullets when clicked", () => {
    render(<PrivacyInfoButton />);
    fireEvent.click(
      screen.getByRole("button", { name: /Cómo protegemos tu diario/i }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/caja fuerte con una llave única/i);
    expect(dialog).toHaveTextContent(/tu llave se crea con tu contraseña/i);
    expect(dialog).toHaveTextContent(
      /ni nuestro equipo puede abrir tu diario/i,
    );
    expect(dialog).toHaveTextContent(/frase de respaldo de 24 palabras/i);
  });

  it("closes the modal with the Entendido button", () => {
    render(<PrivacyInfoButton />);
    fireEvent.click(
      screen.getByRole("button", { name: /Cómo protegemos tu diario/i }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Entendido/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the modal when the backdrop is clicked", () => {
    render(<PrivacyInfoButton />);
    fireEvent.click(
      screen.getByRole("button", { name: /Cómo protegemos tu diario/i }),
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
