import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreateChapterPanel } from "./[bookSlug]/CreateChapterPanel";
import { DiscardChapterPanel } from "./[bookSlug]/[chapterOrder]/DiscardChapterPanel";

/**
 * Creating and discarding a chapter.
 *
 * Both are writes that change what a book IS, so the two things worth pinning
 * are the same in each: the browser decides nothing it is not entitled to
 * decide, and a 409 is never retried.
 */

const actions = vi.hoisted(() => ({
  createChapterAction: vi.fn(),
  discardChapterAction: vi.fn(),
}));
vi.mock("./actions", () => actions);
vi.mock("../actions", () => actions);
vi.mock("../../actions", () => actions);

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("creating a chapter", () => {
  function open(available = true) {
    render(
      <CreateChapterPanel
        bookSlug="eec"
        editingRevisionId="rev_6"
        available={available}
      />,
    );
    return userEvent.setup();
  }

  it("offers nothing at all when the server says the book is not ready", () => {
    open(false);

    expect(
      screen.queryByRole("button", { name: "+ Crear capítulo" }),
    ).toBeNull();
    expect(screen.getByText(/pendientes de sincronizar/i)).toBeInTheDocument();
  });

  it("asks for nothing but a title", async () => {
    const user = open();
    await user.click(screen.getByRole("button", { name: "+ Crear capítulo" }));

    expect(
      screen.getByLabelText("Título del capítulo nuevo"),
    ).toBeInTheDocument();
    // No position, no part, no identity: those are the server's, and a field
    // for them would be inviting a decision the browser cannot make.
    expect(screen.queryByLabelText(/posición|orden|parte/i)).toBeNull();
  });

  it("sends the revision the page was rendered from, and opens the new chapter", async () => {
    actions.createChapterAction.mockResolvedValue({
      ok: true,
      data: {
        chapterOrder: 4,
        revisionId: "rev_7",
        revisionNumber: 7,
        changedUnitCount: 2,
      },
    });
    const user = open();
    await user.click(screen.getByRole("button", { name: "+ Crear capítulo" }));
    await user.type(
      screen.getByLabelText("Título del capítulo nuevo"),
      "  La mente que aprende  ",
    );
    await user.click(screen.getByRole("button", { name: "Crear y editar" }));

    await waitFor(() => {
      expect(actions.createChapterAction).toHaveBeenCalledWith("eec", {
        expectedRevisionId: "rev_6",
        title: "La mente que aprende",
      });
    });
    expect(push).toHaveBeenCalledWith("/dashboard/admin/contenido/eec/4");
  });

  it("cannot be submitted with an empty title", async () => {
    const user = open();
    await user.click(screen.getByRole("button", { name: "+ Crear capítulo" }));

    expect(
      screen.getByRole("button", { name: "Crear y editar" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("Título del capítulo nuevo"), "   ");
    expect(
      screen.getByRole("button", { name: "Crear y editar" }),
    ).toBeDisabled();
    expect(actions.createChapterAction).not.toHaveBeenCalled();
  });

  it("tells the editor to reload on a conflict, and never navigates", async () => {
    actions.createChapterAction.mockResolvedValue({
      ok: false,
      conflict: true,
    });
    const user = open();
    await user.click(screen.getByRole("button", { name: "+ Crear capítulo" }));
    await user.type(
      screen.getByLabelText("Título del capítulo nuevo"),
      "Nuevo",
    );
    await user.click(screen.getByRole("button", { name: "Crear y editar" }));

    expect(await screen.findByText(/Recarga la página/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("discarding a chapter", () => {
  function setup() {
    render(
      <DiscardChapterPanel
        bookSlug="eec"
        chapterOrder={4}
        revisionId="rev_7"
      />,
    );
    return userEvent.setup();
  }

  it("never says 'eliminar', because nothing is deleted", () => {
    setup();
    expect(screen.queryByText(/elimin/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Descartar capítulo" }),
    ).toBeInTheDocument();
  });

  it("asks once before doing it", async () => {
    const user = setup();
    await user.click(
      screen.getByRole("button", { name: "Descartar capítulo" }),
    );

    expect(actions.discardChapterAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Sí, sacarlo del borrador" }),
    ).toBeInTheDocument();
  });

  it("discards and returns to the book", async () => {
    actions.discardChapterAction.mockResolvedValue({
      ok: true,
      data: { revisionId: "rev_8", revisionNumber: 8, changedUnitCount: 1 },
    });
    const user = setup();
    await user.click(
      screen.getByRole("button", { name: "Descartar capítulo" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Sí, sacarlo del borrador" }),
    );

    await waitFor(() => {
      expect(actions.discardChapterAction).toHaveBeenCalledWith(
        "eec",
        4,
        "rev_7",
      );
    });
    expect(push).toHaveBeenCalledWith("/dashboard/admin/contenido/eec");
  });

  it("stops on a conflict rather than retrying", async () => {
    actions.discardChapterAction.mockResolvedValue({
      ok: false,
      conflict: true,
    });
    const user = setup();
    await user.click(
      screen.getByRole("button", { name: "Descartar capítulo" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Sí, sacarlo del borrador" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/Recarga/);
    expect(push).not.toHaveBeenCalled();
    expect(actions.discardChapterAction).toHaveBeenCalledTimes(1);
  });
});
