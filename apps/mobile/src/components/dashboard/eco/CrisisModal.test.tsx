import { Linking } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { CrisisModal } from "./CrisisModal";

/**
 * El aviso de crisis en móvil, con lo que el servidor emite de verdad: con
 * número acreditado y sin él (`apps/api/src/eco/crisis-notice.spec.ts`).
 */

const TEXTO =
  "Lo que me contaste me preocupa.\n\nBusca a alguien de confianza.";

const abrir = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

beforeEach(() => abrir.mockClear());

function montar(hotline: string, extra: { onMoreHelp?: () => void } = {}) {
  const onClose = jest.fn();
  render(
    <CrisisModal
      text={TEXTO}
      hotline={hotline}
      crisisPath="/terapia/crisis"
      onClose={onClose}
      {...extra}
    />,
  );
  return onClose;
}

describe("CrisisModal (móvil)", () => {
  it("con número, el botón dice de qué país es y marca sólo el número", () => {
    montar("911 (Ecuador)");
    fireEvent.press(screen.getByText("📞 Llamar · 911 (Ecuador)"));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith("tel:911");
  });

  it("sin número no hay botón de llamada, ni nada que se le parezca", () => {
    montar("número de emergencias de tu país");
    expect(screen.queryByText(/📞/)).toBeNull();
    expect(screen.queryByText(/llamar|llama al/i)).toBeNull();
    expect(screen.getByText(TEXTO)).toBeOnTheScreen();
    expect(screen.getByText("Entendido")).toBeOnTheScreen();
  });

  it("lleva a la ayuda si hay cómo llegar, y si no, no lo ofrece", () => {
    const onMoreHelp = jest.fn();
    montar("911 (Ecuador)", { onMoreHelp });
    fireEvent.press(screen.getByText("Ver más recursos de ayuda"));
    expect(onMoreHelp).toHaveBeenCalledTimes(1);

    screen.unmount();
    montar("911 (Ecuador)");
    expect(screen.queryByText("Ver más recursos de ayuda")).toBeNull();
  });

  it("remite a un directorio, dicho como tal y sin suponer el país", () => {
    montar("número de emergencias de tu país");
    expect(screen.getByText(/Si estás en otro país/)).toHaveTextContent(
      "Si estás en otro país, busca una línea de ahí en el directorio findahelpline.com.",
    );
    expect(screen.queryByText(/Ecuador/)).toBeNull();
    fireEvent.press(screen.getByText("findahelpline.com"));
    expect(abrir).toHaveBeenCalledWith("https://findahelpline.com");
  });

  it("se cierra", () => {
    const onClose = montar("911 (Ecuador)");
    fireEvent.press(screen.getByText("Entendido"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
