import { fireEvent, render, screen } from "@testing-library/react";
import { ECO_PRIVACY_CRISIS_NOTE, ECO_PRIVACY_NOTE } from "@psico/types";
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
    expect(dialog).toHaveTextContent(/frase de respaldo de 12 palabras/i);
  });

  // El modal cerraba con «Lo mismo aplica a tus conversaciones con Eco», que es
  // falso, y se abre también junto a la reja de Eco. Las tres variantes dicen
  // ahora en qué se diferencia.
  it.each(["basic", "diario", "eco"] as const)(
    "variante %s: dice lo que pasa con un mensaje a Eco, sin equipararlo",
    (variant) => {
      render(<PrivacyInfoButton variant={variant} />);
      fireEvent.click(screen.getByRole("button", { name: /Eco/i }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent(ECO_PRIVACY_NOTE);
      expect(dialog).toHaveTextContent(ECO_PRIVACY_CRISIS_NOTE);
      expect(dialog).not.toHaveTextContent(/lo mismo aplica/i);
      // Y la llave del diario sigue explicada, en las tres.
      expect(dialog).toHaveTextContent(/nunca sale de tu dispositivo/i);
      expect(dialog).toHaveTextContent(/frase de respaldo de 12 palabras/i);
    },
  );

  it("en la reja de Eco, lo de Eco va primero y el título habla de Eco", () => {
    render(<PrivacyInfoButton variant="eco" />);
    fireEvent.click(screen.getByRole("button", { name: /Eco/i }));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Cómo se guarda lo que hablas con Eco",
    );
    const texto = dialog.textContent ?? "";
    expect(texto.indexOf(ECO_PRIVACY_NOTE)).toBeLessThan(
      texto.indexOf("caja fuerte"),
    );
  });

  it("en el diario, el título sigue siendo del diario", () => {
    render(<PrivacyInfoButton variant="diario" />);
    fireEvent.click(screen.getByRole("button", { name: /Eco/i }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Solo tú puedes leer tu diario",
    );
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
