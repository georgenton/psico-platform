import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReaderCompanionDock } from "../ReaderCompanionDock";

/**
 * PL-08 — closing the companion returns the focus to the passage.
 *
 * Keeping the scroll position is half of "you don't lose your place". The
 * other half is the focus: before this, closing left it on `<body>`, so a
 * person reading by keyboard was sent back to the top of the tab order and had
 * to walk the whole chapter again to reach the paragraph they were on.
 *
 * Two destinations, in order: the control that opened the panel when it is
 * still mounted, and the passage's own block when it is not — which is the
 * common case, because the selection popover unmounts as the dock takes over.
 */

// The tabs mount crypto/SSE surfaces that have nothing to do with focus.
vi.mock("../EcoTab", () => ({ EcoTab: () => <div>eco</div> }));
vi.mock("../NotesTab", () => ({ NotesTab: () => <div>notas</div> }));
vi.mock("../ReflexionTab", () => ({
  ReflexionTab: () => <div>reflexión</div>,
  reflexionSeed: () => null,
}));

function montar(extra: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  render(
    <>
      <div data-block-id="bloque-1">El primer bloque del capítulo.</div>
      <div data-block-id="bloque-7">El párrafo que estaba leyendo.</div>
      <ReaderCompanionDock
        open
        tab="eco"
        onTabChange={() => {}}
        onClose={onClose}
        passage={null}
        onPassageConsumed={() => {}}
        annotations={[]}
        focusBlockId="bloque-7"
        pendingBlockId={null}
        onClearPending={() => {}}
        onCreateNote={async () => {}}
        onUpdateNote={async () => {}}
        onDeleteNote={async () => {}}
        apiBase="http://api.test"
        token="t"
        {...extra}
      />
    </>,
  );
  return { onClose };
}

describe("ReaderCompanionDock — el foco vuelve al pasaje", () => {
  it("al cerrar con el botón, el foco aterriza en el bloque del pasaje", async () => {
    const usuario = userEvent.setup();
    const { onClose } = montar();

    await usuario.click(screen.getByLabelText("Cerrar panel"));

    expect(onClose).toHaveBeenCalledTimes(1);
    const bloque = document.querySelector('[data-block-id="bloque-7"]');
    await waitFor(() => expect(document.activeElement).toBe(bloque));
    // Hecho enfocable sólo para este movimiento, sin entrar en el orden de
    // tabulación de quien no lo necesita.
    expect(bloque).toHaveAttribute("tabindex", "-1");
  });

  it("Escape cierra y devuelve el foco igual que el botón", async () => {
    const usuario = userEvent.setup();
    const { onClose } = montar();

    await usuario.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-block-id="bloque-7"]'),
      ),
    );
  });

  it("escribiendo una nota, el destino es el bloque de la nota y no el primero del capítulo", async () => {
    const usuario = userEvent.setup();
    // La ruta de «✎ Nota» del lector limpia `focusBlockId` y llena
    // `pendingBlockId`: si sólo se leyera el primero, el destino sería el
    // primer bloque por casualidad.
    montar({ focusBlockId: null, pendingBlockId: "bloque-7" });

    await usuario.click(screen.getByLabelText("Cerrar panel"));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-block-id="bloque-7"]'),
      ),
    );
  });

  it("sin pasaje registrado, aterriza en el primer bloque del capítulo, nunca en body", async () => {
    const usuario = userEvent.setup();
    montar({ focusBlockId: null });

    await usuario.click(screen.getByLabelText("Cerrar panel"));

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(
        document.querySelector('[data-block-id="bloque-1"]'),
      );
    });
  });
});

/**
 * El caso que la prueba anterior NO cubría.
 *
 * Arriba `onClose` es un espía: el panel sigue montado y nada se vuelve a
 * renderizar. En el lector real, cerrar desmonta el panel, y eso fue
 * exactamente lo que hizo fallar en el navegador una corrección que pasaba en
 * jsdom —el foco se restauraba antes del re-render y el desmontaje lo
 * deshacía—. Este anfitrión sí quita el panel.
 */
function Anfitrion({ focusBlockId = "bloque-7" as string | null }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <>
      {/* Las claves cambian al cerrar, así que React SUSTITUYE estos nodos.
          Es lo que hace el lector de verdad: al cerrar el panel se vuelve a
          renderizar y los bloques son otros elementos del DOM. Sin eso, una
          restauración hecha en el mismo tick pasa en jsdom y falla en el
          navegador, porque enfoca un nodo que el re-render se lleva por
          delante — que es exactamente el fallo que se midió. */}
      <div key={`b1-${abierto}`} data-block-id="bloque-1">
        El primer bloque del capítulo.
      </div>
      <div key={`b7-${abierto}`} data-block-id="bloque-7">
        El párrafo que estaba leyendo.
      </div>
      {abierto ? (
        <ReaderCompanionDock
          open
          tab="eco"
          onTabChange={() => {}}
          onClose={() => setAbierto(false)}
          passage={null}
          onPassageConsumed={() => {}}
          annotations={[]}
          focusBlockId={focusBlockId}
          pendingBlockId={null}
          onClearPending={() => {}}
          onCreateNote={async () => {}}
          onUpdateNote={async () => {}}
          onDeleteNote={async () => {}}
          apiBase="http://api.test"
          token="t"
        />
      ) : null}
    </>
  );
}

describe("ReaderCompanionDock — con desmontaje real", () => {
  it("el panel desaparece y el foco queda en el pasaje, no en body", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);

    await usuario.click(screen.getByLabelText("Cerrar panel"));

    // Desmontado de verdad: no es un espía que deja todo en su sitio.
    await waitFor(() =>
      expect(screen.queryByLabelText("Cerrar panel")).not.toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(
        document.querySelector('[data-block-id="bloque-7"]'),
      );
    });
  });

  it("Escape hace lo mismo cuando el cierre desmonta", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);

    await usuario.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByLabelText("Cerrar panel")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-block-id="bloque-7"]'),
      ),
    );
  });
});
