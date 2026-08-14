import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BookStructurePanel,
  type BookStructurePanelProps,
} from "./[bookSlug]/BookStructurePanel";
import type { ChapterRow } from "./contracts";

/**
 * Reordering chapters in Content Studio.
 *
 * The load-bearing claim is that a POSITION IS A LOCATOR. The browser rearranges
 * rows visually, but what it sends is the sequence of orders those rows had in
 * the revision the page loaded — never the slots they now occupy, and never a
 * densified `1..n`. Most of what follows exists to hold that line.
 *
 * The rest is interlocking: while an unsaved arrangement exists, publishing,
 * creating and opening a chapter all address a revision that no longer
 * describes what the editor is looking at.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const reorderChaptersAction = vi.fn();
const publishBookAction = vi.fn();
const createChapterAction = vi.fn();
vi.mock("./actions", () => ({
  reorderChaptersAction: (...a: unknown[]) => reorderChaptersAction(...a),
  publishBookAction: (...a: unknown[]) => publishBookAction(...a),
  createChapterAction: (...a: unknown[]) => createChapterAction(...a),
}));

const chapter = (
  order: number,
  title: string,
  extra: Partial<ChapterRow> = {},
): ChapterRow => ({
  // No cast: the contract type is the generated one, so this object failing to
  // satisfy it — a missing `partNumber`, a renamed field — is a compile error
  // rather than a fixture quietly drifting from the API.
  order,
  title,
  changed: false,
  isNewDraftChapter: false,
  titleEditable: true,
  ingested: true,
  editable: true,
  partNumber: null,
  partTitle: null,
  ...extra,
});

const props = (
  over: Partial<BookStructurePanelProps> = {},
): BookStructurePanelProps => ({
  bookSlug: "libro",
  chapters: [chapter(1, "A"), chapter(2, "B"), chapter(3, "C")],
  editingRevisionId: "rev-10",
  draftRevisionId: null,
  draftRevisionNumber: null,
  changedUnitCount: 0,
  changedTitles: [],
  structureChanged: false,
  chapterCreationAvailable: true,
  reorderAvailable: true,
  reorderBlockedReason: null,
  ...over,
});

const enterReorder = async (u: ReturnType<typeof userEvent.setup>) =>
  u.click(screen.getByRole("button", { name: "Reordenar capítulos" }));

const titlesInOrder = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => within(li).getByText(/^[A-Z]$/).textContent);

const slotsInOrder = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => within(li).getByText(/^Cap\. \d+/).textContent);

beforeEach(() => {
  vi.clearAllMocks();
  reorderChaptersAction.mockResolvedValue({
    ok: true,
    data: { revisionId: "rev-11", revisionNumber: 11, changedUnitCount: 3 },
  });
});

describe("reorder availability is the server's answer", () => {
  it("a legacy-entitlement book explains itself and calls nothing", async () => {
    render(
      <BookStructurePanel
        {...props({
          reorderAvailable: false,
          reorderBlockedReason: "NATIVE_ENTITLEMENT_REQUIRED",
        })}
      />,
    );

    expect(screen.getByText(/modelo de acceso heredado/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reordenar capítulos" }),
    ).toBeDisabled();
    expect(reorderChaptersAction).not.toHaveBeenCalled();
  });

  it("a book pending sync explains itself and calls nothing", () => {
    render(
      <BookStructurePanel
        {...props({
          reorderAvailable: false,
          reorderBlockedReason: "PENDING_SYNC",
        })}
      />,
    );

    expect(
      screen.getByText(/pendientes de sincronizar antes de poder reordenar/i),
    ).toBeInTheDocument();
    expect(reorderChaptersAction).not.toHaveBeenCalled();
  });

  it("blocked with no reason given says so generically rather than guessing", () => {
    render(
      <BookStructurePanel
        {...props({ reorderAvailable: false, reorderBlockedReason: null })}
      />,
    );
    expect(
      screen.getByText(/no puede reordenarse ahora mismo/i),
    ).toBeInTheDocument();
  });

  it("a one-chapter book offers nothing to permute", () => {
    render(<BookStructurePanel {...props({ chapters: [chapter(1, "A")] })} />);
    expect(
      screen.queryByRole("button", { name: "Reordenar capítulos" }),
    ).toBeNull();
  });
});

describe("rearranging locally", () => {
  it("entering reorder mode writes nothing", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await enterReorder(u);

    expect(screen.getByText(/se guardará en el borrador/i)).toBeInTheDocument();
    expect(reorderChaptersAction).not.toHaveBeenCalled();
  });

  it("moving changes the visible order and still writes nothing", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await enterReorder(u);

    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    expect(titlesInOrder()).toEqual(["B", "A", "C"]);
    expect(reorderChaptersAction).not.toHaveBeenCalled();

    await u.click(screen.getByRole("button", { name: "Mover «A» arriba" }));
    expect(titlesInOrder()).toEqual(["A", "B", "C"]);
    expect(reorderChaptersAction).not.toHaveBeenCalled();
  });

  it("Save sends the SOURCE orders and the exact revision it was given", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «C» arriba" }));
    await u.click(screen.getByRole("button", { name: "Mover «C» arriba" }));
    await u.click(screen.getByRole("button", { name: "Guardar orden" }));

    expect(reorderChaptersAction).toHaveBeenCalledTimes(1);
    expect(reorderChaptersAction).toHaveBeenCalledWith("libro", {
      expectedRevisionId: "rev-10",
      orderedChapterOrders: [3, 1, 2],
    });
    // Nothing about placement or identity travels with it.
    const body = reorderChaptersAction.mock.calls[0]![1] as object;
    expect(Object.keys(body).sort()).toEqual([
      "expectedRevisionId",
      "orderedChapterOrders",
    ]);
  });

  it("a gapped manifest keeps its slots and sends its own orders", async () => {
    // The case that makes "position is a locator" concrete. A discard left the
    // book at 1, 3, 4; moving C to the top must not densify it to 1, 2, 3 and
    // must not send the slots back unchanged.
    const u = userEvent.setup();
    render(
      <BookStructurePanel
        {...props({
          chapters: [chapter(1, "A"), chapter(3, "B"), chapter(4, "C")],
        })}
      />,
    );
    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «C» arriba" }));
    await u.click(screen.getByRole("button", { name: "Mover «C» arriba" }));

    expect(titlesInOrder()).toEqual(["C", "A", "B"]);
    expect(slotsInOrder()).toEqual(["Cap. 1", "Cap. 3", "Cap. 4"]);

    await u.click(screen.getByRole("button", { name: "Guardar orden" }));
    expect(reorderChaptersAction).toHaveBeenCalledWith("libro", {
      expectedRevisionId: "rev-10",
      orderedChapterOrders: [4, 1, 3],
    });
  });

  it("Cancel restores the server order and writes nothing", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    expect(titlesInOrder()).toEqual(["B", "A", "C"]);

    await u.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(titlesInOrder()).toEqual(["A", "B", "C"]);
    expect(reorderChaptersAction).not.toHaveBeenCalled();
  });

  it("an unchanged sequence cannot be saved", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await enterReorder(u);

    expect(
      screen.getByRole("button", { name: "Guardar orden" }),
    ).toBeDisabled();
    // And moving back to where it started disables it again.
    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    expect(screen.getByRole("button", { name: "Guardar orden" })).toBeEnabled();
    await u.click(screen.getByRole("button", { name: "Mover «A» arriba" }));
    expect(
      screen.getByRole("button", { name: "Guardar orden" }),
    ).toBeDisabled();
    expect(reorderChaptersAction).not.toHaveBeenCalled();
  });
});

describe("part boundaries", () => {
  const parted = () => [
    chapter(1, "A", { partNumber: 1, partTitle: "Parte I" }),
    chapter(2, "B", { partNumber: 1, partTitle: "Parte I" }),
    chapter(3, "C", { partNumber: 2, partTitle: "Parte II" }),
    chapter(4, "D", { partNumber: 2, partTitle: "Parte II" }),
  ];

  it("allows a move inside a part", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props({ chapters: parted() })} />);
    await enterReorder(u);

    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    expect(titlesInOrder()).toEqual(["B", "A", "C", "D"]);
  });

  it("disables the move that would cross a boundary", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props({ chapters: parted() })} />);
    await enterReorder(u);

    // B is last in Parte I; moving it down would put it in Parte II's slot.
    const down = screen.getByRole("button", { name: "Mover «B» abajo" });
    expect(down).toBeDisabled();
    expect(down).toHaveAttribute(
      "title",
      "Los movimientos entre partes todavía no están disponibles.",
    );
    await u.click(down);
    expect(titlesInOrder()).toEqual(["A", "B", "C", "D"]);
    expect(reorderChaptersAction).not.toHaveBeenCalled();
  });

  it("shows where each part begins", async () => {
    render(<BookStructurePanel {...props({ chapters: parted() })} />);
    expect(screen.getByText("Parte 1 · Parte I")).toBeInTheDocument();
    expect(screen.getByText("Parte 2 · Parte II")).toBeInTheDocument();
  });
});

describe("failures are explained, never retried", () => {
  const saveSomething = async (u: ReturnType<typeof userEvent.setup>) => {
    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    await u.click(screen.getByRole("button", { name: "Guardar orden" }));
  };

  it("a conflict keeps the local arrangement and offers a reload", async () => {
    reorderChaptersAction.mockResolvedValue({ ok: false, conflict: true });
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await saveSomething(u);

    expect(screen.getByText(/cambió en otra pestaña/i)).toBeInTheDocument();
    expect(
      screen.getByText(/descarta el orden que armaste/i),
    ).toBeInTheDocument();
    // Still exactly one call, and the work is still on screen.
    expect(reorderChaptersAction).toHaveBeenCalledTimes(1);
    expect(titlesInOrder()).toEqual(["B", "A", "C"]);

    await u.click(screen.getByRole("button", { name: "Recargar" }));
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    ["CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED", /movimientos entre partes/i],
    [
      "CONTENT_REORDER_REQUIRES_NATIVE_ENTITLEMENT",
      /modelo de acceso heredado/i,
    ],
    ["CONTENT_STRUCTURE_REQUIRES_SYNC", /pendientes de sincronizar/i],
    ["CONTENT_REORDER_INCOMPLETE", /Recarga la página antes de reordenar/i],
  ])("%s gets fixed copy and no retry", async (code, copy) => {
    reorderChaptersAction.mockResolvedValue({
      ok: false,
      code,
      error: "detalle interno del servidor",
    });
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await saveSomething(u);

    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(reorderChaptersAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/detalle interno del servidor/)).toBeNull();
  });

  it("an unknown failure says something generic, not the server's words", async () => {
    reorderChaptersAction.mockResolvedValue({
      ok: false,
      error: 'Prisma P2002 on "RevisionUnit" at rev-10',
    });
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await saveSomething(u);

    expect(
      await screen.findByText(/No pudimos guardar el nuevo orden/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Prisma/)).toBeNull();
    expect(screen.queryByText(/RevisionUnit/)).toBeNull();
    expect(reorderChaptersAction).toHaveBeenCalledTimes(1);
  });
});

describe("success", () => {
  it("says draft, does not publish, and refreshes from the server", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    await u.click(screen.getByRole("button", { name: "Guardar orden" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(publishBookAction).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Aún no está publicado/i),
    ).toBeInTheDocument();
  });

  it("a new revision token rehydrates the rows from the new props", async () => {
    const u = userEvent.setup();
    const { rerender } = render(<BookStructurePanel {...props()} />);
    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    expect(titlesInOrder()).toEqual(["B", "A", "C"]);

    // What a successful save + router.refresh() produces: a new token and the
    // server's own new order. The stale local sourceOrders must not survive it.
    rerender(
      <BookStructurePanel
        {...props({
          editingRevisionId: "rev-11",
          chapters: [chapter(1, "B"), chapter(2, "A"), chapter(3, "C")],
        })}
      />,
    );

    expect(titlesInOrder()).toEqual(["B", "A", "C"]);
    expect(slotsInOrder()).toEqual(["Cap. 1", "Cap. 2", "Cap. 3"]);
    // And it left reorder mode, so editing is reachable again.
    expect(
      screen.getByRole("button", { name: "Reordenar capítulos" }),
    ).toBeInTheDocument();
  });
});

describe("interlocks while an unsaved order exists", () => {
  const withDraft = () =>
    props({
      draftRevisionId: "d-1",
      draftRevisionNumber: 11,
      changedUnitCount: 2,
      changedTitles: ["Cap. 1 · A"],
    });

  it("Publish is disabled, including the confirmation button", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraft()} />);

    // Open the confirmation FIRST, then enter reorder mode: the confirm button
    // must be disabled too, not just the entry point.
    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();

    await enterReorder(u);
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Publicar" }));
    expect(publishBookAction).not.toHaveBeenCalled();
  });

  it("Create is disabled and says why", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraft()} />);
    await enterReorder(u);

    const create = screen.getByRole("button", { name: "+ Crear capítulo" });
    expect(create).toBeDisabled();
    // Said next to the control it blocks, not only in the publish panel.
    expect(
      screen.getAllByText(/Guarda o cancela el reordenamiento/i).length,
    ).toBeGreaterThan(0);
    await u.click(create);
    expect(createChapterAction).not.toHaveBeenCalled();
  });

  it("chapter editing is not navigable", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    expect(
      screen.getAllByRole("link", { name: "Editar capítulo" }),
    ).toHaveLength(3);

    await enterReorder(u);
    // Not merely styled as inert: there is no link to follow, so a locally
    // displayed slot can never be used as an editor route.
    expect(screen.queryByRole("link", { name: "Editar capítulo" })).toBeNull();
  });

  it("ordinary mode keeps Publish, Create and Edit working", async () => {
    render(<BookStructurePanel {...withDraft()} />);
    expect(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "+ Crear capítulo" }),
    ).toBeEnabled();
    expect(
      screen.getAllByRole("link", { name: "Editar capítulo" }),
    ).toHaveLength(3);
  });

  it("a structural draft says so before publishing", async () => {
    const u = userEvent.setup();
    render(
      <BookStructurePanel
        {...props({ ...withDraft(), structureChanged: true })}
      />,
    );
    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    expect(
      screen.getByText(/también cambia el orden o la estructura/i),
    ).toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("every move control is a real button named for its chapter", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await enterReorder(u);

    for (const title of ["A", "B", "C"]) {
      expect(
        screen.getByRole("button", { name: `Mover «${title}» arriba` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Mover «${title}» abajo` }),
      ).toBeInTheDocument();
    }
    // First row cannot go up, last cannot go down — genuinely disabled.
    expect(
      screen.getByRole("button", { name: "Mover «A» arriba" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Mover «C» abajo" }),
    ).toBeDisabled();
  });

  it("moves and saves from the keyboard alone", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await enterReorder(u);

    const down = screen.getByRole("button", { name: "Mover «A» abajo" });
    down.focus();
    await u.keyboard("{Enter}");
    expect(titlesInOrder()).toEqual(["B", "A", "C"]);

    screen.getByRole("button", { name: "Guardar orden" }).focus();
    await u.keyboard("{Enter}");
    expect(reorderChaptersAction).toHaveBeenCalledWith("libro", {
      expectedRevisionId: "rev-10",
      orderedChapterOrders: [2, 1, 3],
    });
  });
});
