import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChapterEditor } from "./[bookSlug]/[chapterOrder]/ChapterEditor";
import { CoverPanel } from "./[bookSlug]/CoverPanel";
import type { ChapterContent } from "./contracts";

/**
 * Administering images — the parts where being wrong ships something broken.
 *
 * The upload endpoints are proven in `content-studio-assets.service.spec.ts`;
 * this is about what the editor refuses to do and what it promises the reader.
 */

const actions = vi.hoisted(() => ({
  saveChapterDraftAction: vi.fn(),
  previewChapterAction: vi.fn(),
  publishBookAction: vi.fn(),
  uploadChapterImageAction: vi.fn(),
  uploadCoverAction: vi.fn(),
}));
vi.mock("./actions", () => actions);
vi.mock("../actions", () => actions);
vi.mock("../../actions", () => actions);

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function chapter(blocks: ChapterContent["blocks"]): ChapterContent {
  return {
    bookSlug: "eec",
    chapterOrder: 1,
    title: "Cap 1",
    summary: null,
    durationMinutes: null,
    revisionId: "rev_6",
    revisionNumber: 6,
    revisionStatus: "DRAFT",
    changedUnitCount: 0,
    blocks,
  } as ChapterContent;
}

const PARAGRAPH = {
  blockKey: "k1",
  kind: "PARAGRAPH",
  order: 0,
  content: "Texto.",
  meta: null,
};

const IMAGE = {
  blockKey: "k2",
  kind: "IMAGE",
  order: 1,
  content: "Figura 1",
  meta: { imageUrl: "https://cdn/old.png", alt: "Un diagrama", credit: "MQ" },
};

function renderEditor(blocks: ChapterContent["blocks"]) {
  return render(
    <ChapterEditor
      bookSlug="eec"
      chapterOrder={1}
      bookTitle="EEC"
      initial={chapter(blocks)}
    />,
  );
}

const png = () =>
  new File([new Uint8Array([1, 2, 3])], "figura.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  actions.saveChapterDraftAction.mockResolvedValue({
    ok: true,
    data: { revisionId: "rev_7", revisionNumber: 7, changedUnitCount: 1 },
  });
  actions.uploadChapterImageAction.mockResolvedValue({
    ok: true,
    data: { imageUrl: "https://cdn/new.png" },
  });
  actions.uploadCoverAction.mockResolvedValue({
    ok: true,
    data: { coverArtUrl: "https://cdn/cover.png" },
  });
});

describe("adding an illustration", () => {
  it("uploads the bytes without writing anything to the chapter", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor([PARAGRAPH]);

    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      png(),
    );

    await waitFor(() =>
      expect(actions.uploadChapterImageAction).toHaveBeenCalled(),
    );
    // The bytes exist; the chapter does not know about them yet.
    expect(actions.saveChapterDraftAction).not.toHaveBeenCalled();
  });

  it("refuses to save an image with no alt text, and says why", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor([PARAGRAPH]);

    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      png(),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Texto alternativo/)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    expect(actions.saveChapterDraftAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /texto alternativo antes de guardar/i,
    );
  });

  it("saves once the alt text is there, with the uploaded URL", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor([PARAGRAPH]);

    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      png(),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Texto alternativo/)).toBeInTheDocument(),
    );
    await user.type(
      screen.getByLabelText(/Texto alternativo/),
      "Un diagrama nuevo",
    );
    await user.type(screen.getByLabelText(/Pie de la imagen/), "Figura 2");
    await user.type(screen.getByLabelText(/Crédito de la imagen/), "MQ");

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );
    const sent = actions.saveChapterDraftAction.mock.calls[0]![2].blocks;
    expect(sent[1]).toEqual({
      kind: "IMAGE",
      content: "Figura 2",
      meta: {
        imageUrl: "https://cdn/new.png",
        alt: "Un diagrama nuevo",
        credit: "MQ",
      },
    });
  });
});

describe("an existing illustration", () => {
  it("shows its alt, caption and credit for editing", () => {
    renderEditor([PARAGRAPH, IMAGE]);

    expect(screen.getByLabelText(/Texto alternativo/)).toHaveValue(
      "Un diagrama",
    );
    expect(screen.getByLabelText(/Pie de la imagen/)).toHaveValue("Figura 1");
    expect(screen.getByLabelText(/Crédito de la imagen/)).toHaveValue("MQ");
  });

  it("replaces the file locally, leaving the old object alone", async () => {
    const user = userEvent.setup();
    renderEditor([PARAGRAPH, IMAGE]);

    await user.upload(
      screen.getByLabelText(/Reemplazar la imagen/) as HTMLInputElement,
      png(),
    );
    await waitFor(() =>
      expect(actions.uploadChapterImageAction).toHaveBeenCalled(),
    );

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );

    const sent = actions.saveChapterDraftAction.mock.calls[0]![2].blocks;
    expect(sent[1].meta).toMatchObject({ imageUrl: "https://cdn/new.png" });
    // Nothing deletes the old object: older revisions still point at it.
    expect(sent[1].meta.alt).toBe("Un diagrama");
  });

  it("removes through the ordinary lifecycle", async () => {
    const user = userEvent.setup();
    renderEditor([PARAGRAPH, IMAGE]);

    await user.click(
      screen.getByRole("button", { name: "Quitar el bloque 2" }),
    );
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() =>
      expect(actions.saveChapterDraftAction).toHaveBeenCalled(),
    );
    expect(
      actions.saveChapterDraftAction.mock.calls[0]![2].blocks.map(
        (b: { kind: string }) => b.kind,
      ),
    ).toEqual(["PARAGRAPH"]);
  });
});

describe("preview", () => {
  it("renders an image through the reader's own renderer", async () => {
    const user = userEvent.setup();
    actions.previewChapterAction.mockResolvedValue({
      ok: true,
      data: {
        bookSlug: "eec",
        chapterOrder: 1,
        revisionId: "rev_7",
        revisionNumber: 7,
        title: "Cap 1",
        summary: null,
        durationMinutes: null,
        blocks: [{ ...IMAGE, order: 0 }],
      },
    });
    renderEditor([PARAGRAPH, IMAGE]);

    await user.click(
      screen.getByRole("button", { name: "Guardar y previsualizar" }),
    );

    await waitFor(() =>
      expect(screen.getByAltText("Un diagrama")).toBeInTheDocument(),
    );
    // The reader's own component, not a CMS-only preview: same figure element.
    const fig = screen
      .getByAltText("Un diagrama")
      .closest("[data-block-kind='IMAGE']");
    expect(fig).toHaveClass("reader-block");
  });
});

describe("CoverPanel", () => {
  it("is labelled as catalog metadata, not as a draft", () => {
    render(
      <CoverPanel
        bookSlug="eec"
        bookTitle="EEC"
        coverArtUrl="https://cdn/c.png"
      />,
    );

    expect(screen.getByText("Portada del catálogo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Actualizar portada" }),
    ).toBeInTheDocument();
    // Calling it a draft would imply a publish step that never comes.
    expect(screen.queryByText(/Guardar borrador/)).not.toBeInTheDocument();
  });

  it("uploads and refreshes", async () => {
    const user = userEvent.setup();
    render(<CoverPanel bookSlug="eec" bookTitle="EEC" coverArtUrl={null} />);

    await user.upload(
      screen.getByLabelText(/Elegir portada/) as HTMLInputElement,
      png(),
    );
    await user.click(
      screen.getByRole("button", { name: "Actualizar portada" }),
    );

    await waitFor(() => expect(actions.uploadCoverAction).toHaveBeenCalled());
    expect(actions.uploadCoverAction.mock.calls[0]![0]).toBe("eec");
    expect(actions.uploadCoverAction.mock.calls[0]![1]).toBeInstanceOf(
      FormData,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("surfaces a rejection instead of claiming success", async () => {
    const user = userEvent.setup();
    actions.uploadCoverAction.mockResolvedValue({
      ok: false,
      error: "INVALID_IMAGE_TYPE",
    });
    render(<CoverPanel bookSlug="eec" bookTitle="EEC" coverArtUrl={null} />);

    await user.upload(
      screen.getByLabelText(/Elegir portada/) as HTMLInputElement,
      png(),
    );
    await user.click(
      screen.getByRole("button", { name: "Actualizar portada" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("INVALID_IMAGE_TYPE"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
