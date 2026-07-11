import { fireEvent, render, screen } from "@testing-library/react-native";
import { BlockActionsSheet, highlightStyleFor } from "./BlockActionsSheet";

/**
 * Tests for the BlockActionsSheet bottom-sheet menu (Sprint
 * mobile-highlights v1 + Sprint B Eco action).
 *
 * The component is presentational — all state lives in the parent screen.
 * We assert: required actions render, color picks fire the right callback,
 * the destructive row is gated by `hasHighlight`, backdrop tap cancels, and
 * the "Conversar con Eco" row fires onAskEco.
 *
 * jest-expo's Modal doesn't render children inline by default; we use the
 * same react-native mock pattern as TimezoneCard mobile tests to surface
 * the contents.
 */

jest.mock("react-native", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = jest.requireActual("react-native");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = jest.requireActual("react");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RN.Modal = ({ visible, children }: any) => {
    if (visible === false) return null;
    return React.createElement(RN.View, null, children);
  };
  return RN;
});

const noop = () => undefined;

type Props = Parameters<typeof BlockActionsSheet>[0];

function renderSheet(overrides: Partial<Props> = {}) {
  const props: Props = {
    hasHighlight: false,
    onPickColor: noop,
    onAddNote: noop,
    onReflect: noop,
    onAskEco: noop,
    onRemoveHighlights: noop,
    onCancel: noop,
    ...overrides,
  };
  return render(<BlockActionsSheet {...props} />);
}

describe("BlockActionsSheet — renders required actions", () => {
  it("renders title, 3 color swatches, add-note, ask-eco + cancel", () => {
    renderSheet();
    expect(screen.getByText("Acciones del párrafo")).toBeOnTheScreen();
    expect(screen.getByLabelText("Resaltar amarillo")).toBeOnTheScreen();
    expect(screen.getByLabelText("Resaltar azul")).toBeOnTheScreen();
    expect(screen.getByLabelText("Resaltar rosa")).toBeOnTheScreen();
    expect(screen.getByText(/Añadir nota/)).toBeOnTheScreen();
    expect(screen.getByText(/Conversar con Eco/)).toBeOnTheScreen();
    expect(screen.getByText("Cancelar")).toBeOnTheScreen();
  });

  it("does NOT render the 'Quitar resaltado' row when hasHighlight is false", () => {
    renderSheet({ hasHighlight: false });
    expect(screen.queryByText(/Quitar resaltado/)).toBeNull();
  });

  it("renders the destructive 'Quitar resaltado' row when hasHighlight is true", () => {
    renderSheet({ hasHighlight: true });
    expect(screen.getByText(/Quitar resaltado/)).toBeOnTheScreen();
  });
});

describe("BlockActionsSheet — callbacks", () => {
  it("fires onPickColor with the right enum value when a swatch is tapped", () => {
    const onPickColor = jest.fn();
    renderSheet({ onPickColor });
    fireEvent.press(screen.getByLabelText("Resaltar amarillo"));
    expect(onPickColor).toHaveBeenCalledWith("YELLOW");
    fireEvent.press(screen.getByLabelText("Resaltar azul"));
    expect(onPickColor).toHaveBeenLastCalledWith("BLUE");
    fireEvent.press(screen.getByLabelText("Resaltar rosa"));
    expect(onPickColor).toHaveBeenLastCalledWith("PINK");
  });

  it("fires onAddNote when the user picks 'Añadir nota'", () => {
    const onAddNote = jest.fn();
    renderSheet({ onAddNote });
    fireEvent.press(screen.getByText(/Añadir nota/));
    expect(onAddNote).toHaveBeenCalledTimes(1);
  });

  it("fires onReflect when the user picks 'Reflexión'", () => {
    const onReflect = jest.fn();
    renderSheet({ onReflect });
    fireEvent.press(screen.getByText(/Reflexión/));
    expect(onReflect).toHaveBeenCalledTimes(1);
  });

  it("fires onAskEco when the user picks 'Conversar con Eco'", () => {
    const onAskEco = jest.fn();
    renderSheet({ onAskEco });
    fireEvent.press(screen.getByText(/Conversar con Eco/));
    expect(onAskEco).toHaveBeenCalledTimes(1);
  });

  it("fires onRemoveHighlights when the destructive row is tapped", () => {
    const onRemoveHighlights = jest.fn();
    renderSheet({ hasHighlight: true, onRemoveHighlights });
    fireEvent.press(screen.getByText(/Quitar resaltado/));
    expect(onRemoveHighlights).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when 'Cancelar' is tapped", () => {
    const onCancel = jest.fn();
    renderSheet({ onCancel });
    fireEvent.press(screen.getByText("Cancelar"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("BlockActionsSheet — Fase E resonance row (ARC)", () => {
  it("hides the resonance row when the props are absent (pre-Fase-E callers)", () => {
    renderSheet();
    expect(screen.queryByText(/Me resonó/)).toBeNull();
  });

  it("renders the concept label + explicit-confirmation hint and fires onResonar", () => {
    const onResonar = jest.fn();
    renderSheet({
      onResonar,
      resonanceLabel: "El cuerpo sabe antes que la mente",
    });
    expect(
      screen.getByText(/Me resonó «El cuerpo sabe antes que la mente»/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/solo si lo confirmas/i)).toBeOnTheScreen();
    fireEvent.press(screen.getByText(/Me resonó/));
    expect(onResonar).toHaveBeenCalledTimes(1);
  });
});

describe("highlightStyleFor", () => {
  it("returns a tinted style with the right bg + borderLeftColor per color", () => {
    const yellow = highlightStyleFor("YELLOW");
    expect(yellow.backgroundColor).toBe("#FEF3C7");
    expect(yellow.borderLeftColor).toBe("#F59E0B");
    expect(yellow.borderLeftWidth).toBe(4);

    const blue = highlightStyleFor("BLUE");
    expect(blue.backgroundColor).toBe("#DBEAFE");
    expect(blue.borderLeftColor).toBe("#3B82F6");

    const pink = highlightStyleFor("PINK");
    expect(pink.backgroundColor).toBe("#FCE7F3");
    expect(pink.borderLeftColor).toBe("#EC4899");
  });
});
