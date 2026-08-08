import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MediaSection } from "./[bookSlug]/[chapterOrder]/MediaSection";
import type { MediaCard, MediaCardOverrides } from "./contracts";

/**
 * The media cards.
 *
 * The thing most worth guarding is the COPY: two different states share this
 * surface — what a reader sees, and where the definition lives — and an editor
 * who reads "Borrador" as "readers lost the audiobook" would panic for nothing.
 */

const actions = vi.hoisted(() => ({
  listChapterMediaAction: vi.fn(),
  adoptChapterMediaAction: vi.fn(),
  publishMediaDraftAction: vi.fn(),
  updateMediaDraftAction: vi.fn(),
  createChapterMediaAction: vi.fn(),
}));
vi.mock("./actions", () => actions);
vi.mock("../../actions", () => actions);

function card(over: MediaCardOverrides = {}): MediaCard {
  return {
    kind: "PODCAST",
    mediaKey: "eec-c1-podcast-v1",
    mediaVersion: 1,
    title: "Podcast · capítulo 1",
    description: "Una conversación.",
    durationSec: 52,
    chapters: [],
    runtimeAvailability: "AVAILABLE",
    sourceReady: true,
    hasTranscript: false,
    hasPoster: false,
    hasCaptions: false,
    provenance: "CODE",
    editorialStatus: "CODE_OWNED",
    draftId: null,
    ...over,
  } as MediaCard;
}

const list = (media: MediaCard[]) => ({
  ok: true,
  data: { bookSlug: "eec", chapterOrder: 1, media },
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.listChapterMediaAction.mockResolvedValue(list([card()]));
  actions.adoptChapterMediaAction.mockResolvedValue({
    ok: true,
    data: { draftId: "row_9", mediaKey: "eec-c1-podcast-v1" },
  });
  actions.publishMediaDraftAction.mockResolvedValue({
    ok: true,
    data: { draftId: "row_9", mediaKey: "eec-c1-podcast-v1", mediaVersion: 1 },
  });
  actions.updateMediaDraftAction.mockResolvedValue({ ok: true, data: card() });
});

describe("MediaSection — reading the state", () => {
  it("says what the reader sees AND where the definition lives", async () => {
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByText(/Disponible · En código · v1/),
      ).toBeInTheDocument(),
    );
  });

  it("marks an announced-but-unproduced format honestly", async () => {
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({
          kind: "VIDEO",
          mediaKey: "eec-c1-video-v1",
          runtimeAvailability: "COMING_SOON",
          sourceReady: false,
        }),
      ]),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(screen.getByText(/En producción/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/sin archivo/)).toBeInTheDocument();
  });

  it("a CMS draft never reads as if readers lost the media", async () => {
    // The definition inside is fully playable; only its editorial row is private.
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({
          provenance: "DATABASE",
          editorialStatus: "DRAFT",
          draftId: "row_9",
          runtimeAvailability: "AVAILABLE",
        }),
      ]),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(screen.getByText(/Disponible · Borrador/)).toBeInTheDocument(),
    );
  });
});

describe("MediaSection — adoption", () => {
  it("offers Administrar en CMS only for a code-owned definition", async () => {
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Administrar en CMS" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Publicar definición" }),
    ).not.toBeInTheDocument();
  });

  it("adopts by media key and reloads", async () => {
    const user = userEvent.setup();
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Administrar en CMS" }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Administrar en CMS" }),
    );

    await waitFor(() =>
      expect(actions.adoptChapterMediaAction).toHaveBeenCalledWith(
        "eec",
        1,
        "eec-c1-podcast-v1",
      ),
    );
    expect(actions.listChapterMediaAction).toHaveBeenCalledTimes(2);
  });

  it("surfaces a refusal instead of pretending it worked", async () => {
    const user = userEvent.setup();
    actions.adoptChapterMediaAction.mockResolvedValue({
      ok: false,
      error: "MEDIA_ALREADY_ADMINISTERED",
    });
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Administrar en CMS" }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Administrar en CMS" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "MEDIA_ALREADY_ADMINISTERED",
      ),
    );
  });
});

describe("MediaSection — the draft editor", () => {
  const draft = card({
    provenance: "DATABASE",
    editorialStatus: "DRAFT",
    draftId: "row_9",
    chapters: [{ startSec: 0, label: "Apertura" }],
  });

  it("edits copy and chapter marks, and sends nothing else", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([draft]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(screen.getByLabelText(/Título de Podcast/)).toBeInTheDocument(),
    );
    await user.clear(screen.getByLabelText(/Título de Podcast/));
    await user.type(screen.getByLabelText(/Título de Podcast/), "Nuevo título");
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));

    await waitFor(() =>
      expect(actions.updateMediaDraftAction).toHaveBeenCalled(),
    );
    const [id, body] = actions.updateMediaDraftAction.mock.calls[0]!;
    expect(id).toBe("row_9");
    expect(body.title).toBe("Nuevo título");
    expect(body.chapters).toEqual([{ startSec: 0, label: "Apertura" }]);
    // Identity and provider state are the server's, and are not even sendable.
    expect(body).not.toHaveProperty("mediaKey");
    expect(body).not.toHaveProperty("source");
    expect(body).not.toHaveProperty("accessPolicy");
    expect(body).not.toHaveProperty("status");
  });

  it("adds and removes a chapter mark", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([draft]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(screen.getByLabelText(/Título de la marca 1/)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "+ Marca" }));
    await user.type(screen.getByLabelText(/Título de la marca 2/), "Cierre");
    await user.click(screen.getByRole("button", { name: /Quitar la marca 1/ }));
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));

    await waitFor(() =>
      expect(actions.updateMediaDraftAction).toHaveBeenCalled(),
    );
    expect(actions.updateMediaDraftAction.mock.calls[0]![1].chapters).toEqual([
      { startSec: 0, label: "Cierre" },
    ]);
  });

  it("publishes the draft", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([draft]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Publicar definición" }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Publicar definición" }),
    );

    await waitFor(() =>
      expect(actions.publishMediaDraftAction).toHaveBeenCalledWith(
        "row_9",
        "eec",
        1,
      ),
    );
  });
});

describe("MediaSection — a published definition", () => {
  it("is read-only and says when a new version becomes possible", async () => {
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({
          provenance: "DATABASE",
          editorialStatus: "PUBLISHED",
          draftId: "row_9",
        }),
      ]),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByText(/nueva versión estará disponible/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByLabelText(/Título de Podcast/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publicar definición" }),
    ).not.toBeInTheDocument();
  });
});
