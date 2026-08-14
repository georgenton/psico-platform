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

/** Scoped to the chapter list: the publish panel renders a list of its own. */
const chapterRows = () =>
  within(screen.getByRole("list", { name: "Capítulos" })).getAllByRole(
    "listitem",
  );

const titlesInOrder = () =>
  chapterRows().map((li) => within(li).getByText(/^[A-Z]$/).textContent);

const slotsInOrder = () =>
  chapterRows().map((li) => within(li).getByText(/^Cap\. \d+/).textContent);

/** The reorder controls, which also have a "Cancelar" button. */
const reorderPanel = () =>
  within(screen.getByRole("group", { name: "Reordenar capítulos" }));

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

describe("the window between a saved reorder and the refreshed props", () => {
  /**
   * The server has taken the reorder; this page has not seen the result.
   *
   * Every row still carries the order it had in the OLD revision while the
   * server has already moved the chapters, so a row can read "Cap. 1" with a
   * `c.order` of 4 behind it. Anything structural offered here acts on that
   * stale hydration — an edit link would open whoever holds 4 NOW.
   */
  const withDraft = () =>
    props({
      draftRevisionId: "d-1",
      draftRevisionNumber: 11,
      changedUnitCount: 2,
      changedTitles: ["Cap. 1 · A"],
    });

  const saveAndStopBeforeRefresh = async (
    u: ReturnType<typeof userEvent.setup>,
  ) => {
    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    await u.click(screen.getByRole("button", { name: "Guardar orden" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  };

  it("stays fully interlocked until the new snapshot arrives", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraft()} />);
    await saveAndStopBeforeRefresh(u);

    // No route can be built from a locally displayed slot.
    expect(screen.queryByRole("link", { name: "Editar capítulo" })).toBeNull();
    // The confirmation was already open before the save; it must be inert too.
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "+ Crear capítulo" }),
    ).toBeDisabled();
    // No way to start a second reorder session against the same stale rows.
    expect(
      screen.queryByRole("button", { name: "Reordenar capítulos" }),
    ).toBeNull();
    expect(
      reorderPanel().getByRole("button", { name: "Guardar orden" }),
    ).toBeDisabled();
    expect(
      reorderPanel().getByRole("button", { name: "Cancelar" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Mover «A» arriba" }),
    ).toBeDisabled();
    expect(
      await screen.findByText(/Aún no está publicado/i),
    ).toBeInTheDocument();
  });

  it("cannot be talked into a second save on the superseded revision", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraft()} />);
    await saveAndStopBeforeRefresh(u);

    await u.click(
      reorderPanel().getByRole("button", { name: "Guardar orden" }),
    );
    await u.click(screen.getByRole("button", { name: "Publicar" }));
    await u.click(screen.getByRole("button", { name: "+ Crear capítulo" }));

    expect(reorderChaptersAction).toHaveBeenCalledTimes(1);
    expect(publishBookAction).not.toHaveBeenCalled();
    expect(createChapterAction).not.toHaveBeenCalled();
  });

  it("unlocks once the server snapshot actually lands", async () => {
    const u = userEvent.setup();
    const { rerender } = render(<BookStructurePanel {...withDraft()} />);
    await saveAndStopBeforeRefresh(u);

    rerender(
      <BookStructurePanel
        {...withDraft()}
        editingRevisionId="rev-11"
        draftRevisionId="rev-11"
        chapters={[chapter(1, "B"), chapter(2, "A"), chapter(3, "C")]}
      />,
    );

    // Rows come from the server, and the stale arrangement is gone.
    expect(titlesInOrder()).toEqual(["B", "A", "C"]);
    expect(
      screen.getAllByRole("link", { name: "Editar capítulo" }),
    ).toHaveLength(3);
    // The confirmation was opened before the save and is still open, so what
    // changed is that its button can act again.
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "+ Crear capítulo" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Reordenar capítulos" }),
    ).toBeEnabled();
    // A draft still exists, so the notice is still true.
    expect(screen.getByText(/Aún no está publicado/i)).toBeInTheDocument();
  });
});

describe("a create form opened before the interlock", () => {
  const openCreateForm = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(screen.getByRole("button", { name: "+ Crear capítulo" }));
    await u.type(screen.getByRole("textbox"), "Capítulo nuevo");
  };

  it("is disabled once reorder mode begins, and says why", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await openCreateForm(u);
    expect(
      screen.getByRole("button", { name: "Crear y editar" }),
    ).toBeEnabled();

    await enterReorder(u);

    const submit = screen.getByRole("button", { name: "Crear y editar" });
    expect(submit).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(
      screen.getAllByText(/Guarda o cancela el reordenamiento/i).length,
    ).toBeGreaterThan(0);

    await u.click(submit);
    // Enter in the field is the path a disabled BUTTON alone would not block.
    await u.type(screen.getByRole("textbox"), "{Enter}");
    expect(createChapterAction).not.toHaveBeenCalled();
  });

  it("stays disabled while a saved reorder waits for the server", async () => {
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await openCreateForm(u);
    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    await u.click(screen.getByRole("button", { name: "Guardar orden" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(
      screen.getByRole("button", { name: "Crear y editar" }),
    ).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Crear y editar" }));
    expect(createChapterAction).not.toHaveBeenCalled();
  });
});

describe("publishing keeps the revision id, so rows must still rehydrate", () => {
  /**
   * Content Core flips the SAME revision from DRAFT to PUBLISHED and points the
   * edition at it, so `editingRevisionId` is identical either side of a
   * publish. Only the draft disappearing tells the page that anything happened.
   */
  const draftProps = () =>
    props({
      editingRevisionId: "rev-11",
      draftRevisionId: "rev-11",
      draftRevisionNumber: 11,
      changedUnitCount: 1,
      changedTitles: ["Cap. 1 · A"],
      chapters: [
        chapter(1, "A", { changed: true, isNewDraftChapter: true }),
        chapter(2, "B"),
        chapter(3, "C"),
      ],
    });

  const publishedProps = () =>
    props({
      editingRevisionId: "rev-11", // unchanged, on purpose
      draftRevisionId: null,
      draftRevisionNumber: null,
      changedUnitCount: 0,
      changedTitles: [],
      chapters: [
        chapter(1, "A", { changed: false, isNewDraftChapter: false }),
        chapter(2, "B"),
        chapter(3, "C"),
      ],
    });

  it("drops the draft badges when the draft is published", () => {
    const { rerender } = render(<BookStructurePanel {...draftProps()} />);
    expect(screen.getByText("Sin publicar")).toBeInTheDocument();

    rerender(<BookStructurePanel {...publishedProps()} />);

    expect(screen.queryByText("Sin publicar")).toBeNull();
    expect(screen.queryByText("Con cambios")).toBeNull();
    expect(slotsInOrder()).toEqual(["Cap. 1", "Cap. 2", "Cap. 3"]);
    expect(titlesInOrder()).toEqual(["A", "B", "C"]);
  });

  it("stops claiming the order is unpublished once it is", async () => {
    const u = userEvent.setup();
    const { rerender } = render(<BookStructurePanel {...draftProps()} />);

    await enterReorder(u);
    await u.click(screen.getByRole("button", { name: "Mover «A» abajo" }));
    await u.click(screen.getByRole("button", { name: "Guardar orden" }));
    // The reorder's own refresh lands: a new draft, so the notice is true.
    rerender(
      <BookStructurePanel
        {...draftProps()}
        editingRevisionId="rev-12"
        draftRevisionId="rev-12"
      />,
    );
    expect(screen.getByText(/Aún no está publicado/i)).toBeInTheDocument();

    // Then it is published — same revision id, draft gone.
    rerender(
      <BookStructurePanel
        {...publishedProps()}
        editingRevisionId="rev-12"
        draftRevisionId={null}
      />,
    );
    expect(screen.queryByText(/Aún no está publicado/i)).toBeNull();

    // And it cannot come back over some later, unrelated draft.
    rerender(
      <BookStructurePanel
        {...draftProps()}
        editingRevisionId="rev-13"
        draftRevisionId="rev-13"
      />,
    );
    expect(screen.queryByText(/Aún no está publicado/i)).toBeNull();
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

/**
 * The interlock runs BOTH ways.
 *
 * A local reorder already blocked Publish and Create. Neither blocked a
 * reorder — and both of them end by moving the page underneath it: publish via
 * `router.refresh()`, create via `router.push`. An editor who started
 * rearranging while one was in flight lost the work with no warning at all.
 *
 * Every case here holds the sibling action open with a deferred promise, so the
 * intermediate state is a real one rather than a timing guess.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const withDraftProps = (over: Partial<BookStructurePanelProps> = {}) =>
  props({
    draftRevisionId: "rev-10",
    draftRevisionNumber: 10,
    changedUnitCount: 1,
    changedTitles: ["Cap. 1 · A"],
    ...over,
  });

const reorderEntry = () =>
  screen.queryByRole("button", { name: "Reordenar capítulos" });

describe("a publish in flight blocks starting a reorder", () => {
  it("stays blocked while the request is open", async () => {
    const gate = deferred<{ ok: boolean }>();
    publishBookAction.mockReturnValue(gate.promise);
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraftProps()} />);

    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await u.click(screen.getByRole("button", { name: "Publicar" }));

    // Mid-flight: the entry exists but must refuse.
    expect(reorderEntry()).toBeDisabled();
    await u.click(reorderEntry()!);
    expect(screen.queryByRole("button", { name: /Mover «A»/ })).toBeNull();
    expect(reorderChaptersAction).not.toHaveBeenCalled();

    gate.resolve({ ok: true });
  });

  it("stays blocked after success, until the new snapshot arrives", async () => {
    const gate = deferred<{ ok: boolean }>();
    publishBookAction.mockReturnValue(gate.promise);
    const u = userEvent.setup();
    const { rerender } = render(<BookStructurePanel {...withDraftProps()} />);

    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await u.click(screen.getByRole("button", { name: "Publicar" }));
    gate.resolve({ ok: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    // The refresh was ASKED for; the props have not arrived. Unlocking here is
    // the exact window where a fresh arrangement gets silently reset.
    expect(reorderEntry()).toBeDisabled();
    await u.click(reorderEntry()!);
    expect(screen.queryByRole("button", { name: /Mover «A»/ })).toBeNull();
    expect(reorderChaptersAction).not.toHaveBeenCalled();

    // Publishing does not mint a revision: same id, draft gone.
    rerender(
      <BookStructurePanel
        {...props({ editingRevisionId: "rev-10", draftRevisionId: null })}
      />,
    );

    expect(reorderEntry()).toBeEnabled();
    await u.click(reorderEntry()!);
    expect(
      screen.getByRole("button", { name: "Mover «A» abajo" }),
    ).toBeInTheDocument();
  });

  it("a failed publish releases the lock", async () => {
    publishBookAction.mockResolvedValue({ ok: false, error: "no" });
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraftProps()} />);

    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await u.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(reorderEntry()).toBeEnabled());
  });

  it("a conflicted publish releases the lock", async () => {
    publishBookAction.mockResolvedValue({ ok: false, conflict: true });
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraftProps()} />);

    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await u.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(reorderEntry()).toBeEnabled());
  });
});

describe("a create in flight blocks starting a reorder", () => {
  const openAndSubmit = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(screen.getByRole("button", { name: "+ Crear capítulo" }));
    await u.type(screen.getByRole("textbox"), "Nuevo");
    await u.click(screen.getByRole("button", { name: /Crear y editar/i }));
  };

  it("stays blocked while the request is open", async () => {
    const gate = deferred<{ ok: boolean }>();
    createChapterAction.mockReturnValue(gate.promise);
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);

    await openAndSubmit(u);

    expect(reorderEntry()).toBeDisabled();
    await u.click(reorderEntry()!);
    expect(screen.queryByRole("button", { name: /Mover «A»/ })).toBeNull();
    expect(reorderChaptersAction).not.toHaveBeenCalled();

    gate.resolve({ ok: true });
  });

  it("stays blocked after success, through the navigation", async () => {
    const gate = deferred<{ ok: boolean; data: { chapterOrder: number } }>();
    createChapterAction.mockReturnValue(gate.promise);
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);

    await openAndSubmit(u);
    gate.resolve({ ok: true, data: { chapterOrder: 4 } });
    await waitFor(() => expect(createChapterAction).toHaveBeenCalledTimes(1));

    // The page is leaving. Re-enabling reorder in the gap would offer work it
    // is about to abandon — and if the navigation never lands, refusing is the
    // better failure, because the chapter already exists.
    expect(reorderEntry()).toBeDisabled();
    await u.click(reorderEntry()!);
    expect(screen.queryByRole("button", { name: /Mover «A»/ })).toBeNull();
    expect(reorderChaptersAction).not.toHaveBeenCalled();
  });

  it("a failed create releases the lock", async () => {
    createChapterAction.mockResolvedValue({ ok: false, error: "no" });
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await openAndSubmit(u);

    await waitFor(() => expect(reorderEntry()).toBeEnabled());
  });

  it("a conflicted create releases the lock", async () => {
    createChapterAction.mockResolvedValue({ ok: false, conflict: true });
    const u = userEvent.setup();
    render(<BookStructurePanel {...props()} />);
    await openAndSubmit(u);

    await waitFor(() => expect(reorderEntry()).toBeEnabled());
  });
});

describe("a sibling operation is not a reorder", () => {
  it("publishing does not put the list into reorder mode", async () => {
    const gate = deferred<{ ok: boolean }>();
    publishBookAction.mockReturnValue(gate.promise);
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraftProps()} />);

    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await u.click(screen.getByRole("button", { name: "Publicar" }));

    // Blocked from STARTING one, but the surface itself is untouched: no arrow
    // controls, and the edit links a publish has no reason to remove.
    expect(screen.queryByRole("button", { name: /Mover «/ })).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "Editar capítulo" }),
    ).toHaveLength(3);

    gate.resolve({ ok: true });
  });
});

/**
 * Two owners, two locks.
 *
 * Publish and Create do not disable each other, so both can be in flight at
 * once. Held in ONE boolean, whichever finished first wrote `false` and
 * re-offered reorder while the other was still running — and a snapshot
 * arriving cleared it wholesale, including a create that was still pending.
 *
 * The page is about to move in both of those situations. Offering a reorder
 * into it is how the work gets silently discarded, which is the whole reason
 * the lock exists.
 */
describe("one structural action cannot release another's lock", () => {
  const startPublish = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await u.click(screen.getByRole("button", { name: "Publicar" }));
  };
  const startCreate = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(screen.getByRole("button", { name: "+ Crear capítulo" }));
    await u.type(screen.getByRole("textbox"), "Nuevo");
    await u.click(screen.getByRole("button", { name: /Crear y editar/i }));
  };

  it("a failed create does not unlock a publish still in flight", async () => {
    const publishGate = deferred<{ ok: boolean }>();
    publishBookAction.mockReturnValue(publishGate.promise);
    createChapterAction.mockResolvedValue({ ok: false, error: "no" });
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraftProps()} />);

    await startPublish(u);
    await startCreate(u);
    await waitFor(() => expect(createChapterAction).toHaveBeenCalledTimes(1));

    // The create is over; the publish is not, and its refresh is still coming.
    expect(reorderEntry()).toBeDisabled();
    await u.click(reorderEntry()!);
    expect(screen.queryByRole("button", { name: /Mover «A»/ })).toBeNull();
    expect(reorderChaptersAction).not.toHaveBeenCalled();

    publishGate.resolve({ ok: true });
  });

  it("a failed publish does not unlock a create still in flight", async () => {
    const createGate = deferred<{ ok: boolean }>();
    createChapterAction.mockReturnValue(createGate.promise);
    publishBookAction.mockResolvedValue({ ok: false, conflict: true });
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraftProps()} />);

    await startCreate(u);
    await startPublish(u);
    await waitFor(() => expect(publishBookAction).toHaveBeenCalledTimes(1));

    // The publish is over; the create is not, and it is about to navigate.
    expect(reorderEntry()).toBeDisabled();
    await u.click(reorderEntry()!);
    expect(screen.queryByRole("button", { name: /Mover «A»/ })).toBeNull();
    expect(reorderChaptersAction).not.toHaveBeenCalled();

    createGate.resolve({ ok: true });
  });

  it("a new server snapshot does not unlock a create still in flight", async () => {
    const createGate = deferred<{ ok: boolean }>();
    createChapterAction.mockReturnValue(createGate.promise);
    const u = userEvent.setup();
    const { rerender } = render(<BookStructurePanel {...withDraftProps()} />);

    await startCreate(u);
    await waitFor(() => expect(createChapterAction).toHaveBeenCalledTimes(1));

    // A snapshot is the fence PUBLISHING is designed around. It says nothing
    // about a create that has not answered yet.
    rerender(
      <BookStructurePanel
        {...props({ editingRevisionId: "rev-10", draftRevisionId: null })}
      />,
    );

    expect(reorderEntry()).toBeDisabled();
    await u.click(reorderEntry()!);
    expect(screen.queryByRole("button", { name: /Mover «A»/ })).toBeNull();
    expect(reorderChaptersAction).not.toHaveBeenCalled();

    createGate.resolve({ ok: true });
  });

  it("both finishing releases it exactly once", async () => {
    // The other half of the claim: per-owner locks must not deadlock the entry
    // when every owner has genuinely finished.
    publishBookAction.mockResolvedValue({ ok: false, error: "no" });
    createChapterAction.mockResolvedValue({ ok: false, error: "no" });
    const u = userEvent.setup();
    render(<BookStructurePanel {...withDraftProps()} />);

    await startPublish(u);
    await startCreate(u);

    await waitFor(() => expect(reorderEntry()).toBeEnabled());
    await u.click(reorderEntry()!);
    expect(
      screen.getByRole("button", { name: "Mover «A» abajo" }),
    ).toBeInTheDocument();
  });
});
