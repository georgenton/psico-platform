import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChapterEditor } from "./[bookSlug]/[chapterOrder]/ChapterEditor";
import type { ChapterContent, RevisionStatus } from "./contracts";

/**
 * The chapter editor — the parts where being wrong loses somebody's writing.
 *
 * Not covered here, on purpose: that the draft reaches Postgres correctly. That
 * is proven against a real database in `content-core-draft.pg-spec.ts`, and
 * re-asserting it through a mocked action would only test the mock.
 */

const actions = vi.hoisted(() => ({
  saveChapterDraftAction: vi.fn(),
  previewChapterAction: vi.fn(),
  publishBookAction: vi.fn(),
}));
vi.mock("./actions", () => actions);
vi.mock("../../actions", () => actions);

type ChapterOverrides = Partial<Omit<ChapterContent, "revisionStatus">> & {
  revisionStatus?: RevisionStatus;
};

function chapter(overrides: ChapterOverrides = {}): ChapterContent {
  return {
    bookSlug: "eec",
    chapterOrder: 1,
    title: "Cuando la calma no llega",
    summary: null,
    durationMinutes: null,
    revisionId: "rev_6",
    revisionNumber: 6,
    revisionStatus: "DRAFT",
    changedUnitCount: 1,
    blocks: [
      {
        blockKey: "k1",
        kind: "PARAGRAPH",
        order: 0,
        content: "Primer párrafo.",
        meta: null,
      },
      {
        blockKey: "k2",
        kind: "IMAGE",
        order: 1,
        content: "Una ilustración",
        meta: { url: "https://cdn/x.png", alt: "gráfico" },
      },
    ],
    ...overrides,
  } as ChapterContent;
}

function renderEditor(initial = chapter()) {
  return render(
    <ChapterEditor
      bookSlug="eec"
      chapterOrder={1}
      bookTitle="Emociones en Construcción"
      initial={initial}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.saveChapterDraftAction.mockResolvedValue({
    ok: true,
    data: { revisionId: "rev_7", revisionNumber: 7, changedUnitCount: 1 },
  });
});

describe("ChapterEditor — the text belongs to whoever typed it", () => {
  it("keeps blank lines, Spanish punctuation and long prose byte for byte", async () => {
    const user = userEvent.setup();
    renderEditor();

    // The failure this guards against is a per-keystroke normaliser: it eats
    // spaces mid-word and silently collapses the blank line between paragraphs.
    const written = [
      "¿Y si la calma no llega? —preguntó.",
      "",
      "Ella respondió: “no pasa nada”, con una sonrisa pequeña, casi imperceptible.",
      "",
      "Añoranza, ñandú, ¡qué más da!",
    ].join("\n");

    const box = screen.getByLabelText("Párrafo 1");
    await user.clear(box);
    await user.paste(written);

    expect((box as HTMLTextAreaElement).value).toBe(written);

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );
    const sent = actions.saveChapterDraftAction.mock.calls[0]![2];
    expect(sent.blocks[0].content).toBe(written);
  });

  it("sends a media block back untouched, metadata and all", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );
    const sent = actions.saveChapterDraftAction.mock.calls[0]![2];
    expect(sent.blocks[1]).toEqual({
      kind: "IMAGE",
      content: "Una ilustración",
      meta: { url: "https://cdn/x.png", alt: "gráfico" },
    });
  });

  it("shows a preserved block read-only and says so", async () => {
    // IMAGE is administered now, so the preserved case is a kind this vertical
    // still cannot edit. "We do not edit this yet" and "we lost this" must never
    // look the same to the person who wrote it.
    renderEditor(
      chapter({
        blocks: [
          {
            blockKey: "k1",
            kind: "PARAGRAPH",
            order: 0,
            content: "Texto.",
            meta: null,
          },
          {
            blockKey: "k3",
            kind: "VIDEO",
            order: 1,
            content: "Una cápsula",
            meta: { videoUrl: "https://cdn/v.mp4" },
          },
        ],
      } as never),
    );

    expect(screen.getByText(/Video · se conserva/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Video 2")).not.toBeInTheDocument();
  });
});

describe("ChapterEditor — editing the block list", () => {
  it("adds each editable kind and sends it", async () => {
    const user = userEvent.setup();
    renderEditor();

    for (const label of ["Título", "Cita", "Pausa"]) {
      await user.click(screen.getByRole("button", { name: `+ ${label}` }));
    }
    await user.type(screen.getByLabelText("Título 3"), "Un título");
    await user.type(screen.getByLabelText("Cita 4"), "Una cita");
    await user.type(screen.getByLabelText("Pausa 5"), "Respira");

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );

    const kinds = actions.saveChapterDraftAction.mock.calls[0]![2].blocks.map(
      (b: { kind: string }) => b.kind,
    );
    expect(kinds).toEqual(["PARAGRAPH", "IMAGE", "HEADING", "QUOTE", "PAUSE"]);
  });

  it("moves a block and removes another", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Mover abajo el bloque 1" }),
    );
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );
    expect(
      actions.saveChapterDraftAction.mock.calls[0]![2].blocks.map(
        (b: { kind: string }) => b.kind,
      ),
    ).toEqual(["IMAGE", "PARAGRAPH"]);

    await user.click(
      screen.getByRole("button", { name: "Quitar el bloque 1" }),
    );
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalledTimes(2),
    );
    expect(
      actions.saveChapterDraftAction.mock.calls[1]![2].blocks.map(
        (b: { kind: string }) => b.kind,
      ),
    ).toEqual(["PARAGRAPH"]);
  });
});

describe("ChapterEditor — the concurrency token", () => {
  it("sends the loaded revision and adopts the one the save returns", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() =>
      expect(screen.getByText("Borrador guardado · r7")).toBeInTheDocument(),
    );
    expect(
      actions.saveChapterDraftAction.mock.calls[0]![2].expectedRevisionId,
    ).toBe("rev_6");

    // A second save must build on r7, not on the revision the page loaded.
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalledTimes(2),
    );
    expect(
      actions.saveChapterDraftAction.mock.calls[1]![2].expectedRevisionId,
    ).toBe("rev_7");
  });

  it("on a conflict keeps the local edits and offers a reload", async () => {
    const user = userEvent.setup();
    actions.saveChapterDraftAction.mockResolvedValue({
      ok: false,
      conflict: true,
    });
    renderEditor();

    await user.type(screen.getByLabelText("Párrafo 1"), " añadido");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() =>
      expect(
        screen.getByText(/El borrador cambió desde que abriste esta pantalla/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Recargar" }),
    ).toBeInTheDocument();
    // Nothing was retried: a retry is how you overwrite work you never saw.
    expect(actions.saveChapterDraftAction).toHaveBeenCalledTimes(1);
  });
});

describe("ChapterEditor — preview", () => {
  it("renders the draft through the reader's own surface", async () => {
    const user = userEvent.setup();
    actions.previewChapterAction.mockResolvedValue({
      ok: true,
      data: {
        bookSlug: "eec",
        chapterOrder: 1,
        revisionId: "rev_7",
        revisionNumber: 7,
        title: "Cuando la calma no llega",
        summary: null,
        durationMinutes: null,
        blocks: [
          {
            blockKey: "k1",
            kind: "PARAGRAPH",
            order: 0,
            content: "Texto del borrador.",
            meta: null,
          },
          {
            blockKey: "k9",
            kind: "QUOTE",
            order: 1,
            content: "Una cita del borrador.",
            meta: null,
          },
        ],
      },
    });
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Guardar y previsualizar" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Texto del borrador.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Una cita del borrador.")).toBeInTheDocument();
    expect(screen.getByText(/Vista previa · borrador r7/)).toBeInTheDocument();
    // The button saves first, so it previews what that save produced.
    expect(actions.previewChapterAction).toHaveBeenCalledWith(
      "eec",
      1,
      "rev_7",
    );
  });

  it("saves the CURRENT text before previewing, and previews what it saved", async () => {
    // Previewing without saving would show the last persisted draft while newer
    // edits sat in a textarea — a preview that lies about what it is previewing.
    const user = userEvent.setup();
    actions.previewChapterAction.mockResolvedValue({
      ok: true,
      data: {
        bookSlug: "eec",
        chapterOrder: 1,
        revisionId: "rev_7",
        revisionNumber: 7,
        title: "T",
        summary: null,
        durationMinutes: null,
        blocks: [
          {
            blockKey: "k1",
            kind: "PARAGRAPH",
            order: 0,
            content: "Texto recién editado.",
            meta: null,
          },
        ],
      },
    });
    renderEditor();

    const box = screen.getByLabelText("Párrafo 1");
    await user.clear(box);
    await user.paste("Texto recién editado.");
    await user.click(
      screen.getByRole("button", { name: "Guardar y previsualizar" }),
    );

    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );
    expect(
      actions.saveChapterDraftAction.mock.calls[0]![2].blocks[0].content,
    ).toBe("Texto recién editado.");
    await waitFor(() =>
      expect(actions.previewChapterAction).toHaveBeenCalledWith(
        "eec",
        1,
        "rev_7",
      ),
    );
    // Scope to the rendered block — the same text is also in the textarea.
    const rendered = document.querySelectorAll(".reader-block");
    expect([...rendered].map((n) => n.textContent)).toContain(
      "Texto recién editado.",
    );
  });

  it("does not preview when the save conflicts, and keeps the local text", async () => {
    const user = userEvent.setup();
    actions.saveChapterDraftAction.mockResolvedValue({
      ok: false,
      conflict: true,
    });
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Guardar y previsualizar" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/El borrador cambió desde que abriste esta pantalla/),
      ).toBeInTheDocument(),
    );
    expect(actions.previewChapterAction).not.toHaveBeenCalled();
    expect(actions.saveChapterDraftAction).toHaveBeenCalledTimes(1);
  });
});

describe("ChapterEditor — the header tells the truth about what is live", () => {
  it("stops saying publicada the moment a save makes it a draft", async () => {
    const user = userEvent.setup();
    renderEditor(
      chapter({
        revisionId: "rev_5",
        revisionNumber: 5,
        revisionStatus: "PUBLISHED",
      }),
    );

    expect(screen.getByText(/revisión r5\s*\(publicada\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() =>
      expect(
        screen.getByText(/revisión r7\s*\(borrador\)/),
      ).toBeInTheDocument(),
    );
    // The old label must be gone, not merely joined by a new one.
    expect(screen.queryByText(/\(publicada\)/)).not.toBeInTheDocument();
  });
});

describe("ChapterEditor — the title is not ours to change yet", () => {
  it("shows the title read-only and never sends it", async () => {
    // Legacy Chapter.title still feeds reader headers and page metadata, so a
    // rename here would appear in some surfaces and not others.
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByText("Cuando la calma no llega")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Título del capítulo"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/se administrarán en una siguiente etapa/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );
    expect(actions.saveChapterDraftAction.mock.calls[0]![2]).not.toHaveProperty(
      "title",
    );
  });
});
