import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExportButton } from "./ExportButton";

describe("ExportButton", () => {
  it("renders with the default label", () => {
    render(<ExportButton />);
    expect(
      screen.getByRole("button", { name: /Exportar/i }),
    ).toBeInTheDocument();
  });

  it("renders with a custom label when provided", () => {
    render(<ExportButton label="Descargar PDF" />);
    expect(
      screen.getByRole("button", { name: /Descargar PDF/i }),
    ).toBeInTheDocument();
  });

  it("calls window.print() on click", async () => {
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    render(<ExportButton />);
    await userEvent.click(screen.getByRole("button"));
    expect(printSpy).toHaveBeenCalledOnce();
    printSpy.mockRestore();
  });
});
