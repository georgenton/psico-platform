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
  uploadAudiobookAction: vi.fn(),
  uploadPodcastAction: vi.fn(),
  publishMediaMasterAction: vi.fn(),
  createVideoUploadIntentAction: vi.fn(),
  videoUploadStatusAction: vi.fn(),
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
    stagedMaster: false,
    awaitingUpload: false,
    draftId: null,
    ...over,
  } as MediaCard;
}

const list = (
  media: MediaCard[],
  missingKinds: string[] = [],
  videoUploadAvailable = true,
) => ({
  ok: true,
  data: {
    bookSlug: "eec",
    chapterOrder: 1,
    media,
    missingKinds,
    videoUploadAvailable,
  },
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
  actions.createChapterMediaAction.mockResolvedValue({
    ok: true,
    data: { draftId: "row_new", mediaKey: "eec-c1-video-v1" },
  });
  const uploaded = {
    ok: true,
    data: {
      draftId: "row_up",
      mediaKey: "eec-c1-audiobook-v2",
      mediaVersion: 2,
      sourceReady: true,
    },
  };
  actions.uploadAudiobookAction.mockResolvedValue(uploaded);
  actions.uploadPodcastAction.mockResolvedValue(uploaded);
  actions.publishMediaMasterAction.mockResolvedValue({
    ok: true,
    data: {
      draftId: "row_up",
      mediaKey: "eec-c1-audiobook-v2",
      mediaVersion: 2,
    },
  });
});

/** Spread + enum literal does not type-check; this keeps fixtures readable. */
const patch = (base: MediaCard, over: MediaCardOverrides): MediaCard =>
  ({ ...base, ...over }) as MediaCard;

const m4a = () =>
  new File([new Uint8Array([1, 2, 3])], "master.m4a", { type: "audio/mp4" });

/** Fills the picker and the duration, then submits. */
async function uploadAudio(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
) {
  await user.upload(screen.getByLabelText(label) as HTMLInputElement, m4a());
  await user.type(screen.getByLabelText(/^Duración de/), "600");
  await user.click(
    screen.getByRole("button", { name: /Subir archivo|Añadir episodio$/ }),
  );
}

describe("MediaSection — uploading an audiobook master", () => {
  const audiobook = card({
    kind: "AUDIOBOOK",
    mediaKey: "eec-c1-audiobook-v1",
    title: "Audiolibro · capítulo 1",
  });

  it("offers upload when there is no master yet", async () => {
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        patch(audiobook, {
          sourceReady: false,
          runtimeAvailability: "COMING_SOON",
        }),
      ]),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Subir Audiolibro" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/sin archivo/)).toBeInTheDocument();
  });

  it("offers a NEW VERSION when a master already plays", async () => {
    actions.listChapterMediaAction.mockResolvedValue(list([audiobook]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Subir nueva versión de Audiolibro · capítulo 1",
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/archivo listo/)).toBeInTheDocument();
  });

  it("says the upload will NOT reach readers until published", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([audiobook]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Subir nueva versión/ }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: /Subir nueva versión/ }),
    );

    // The one thing an editor could reasonably misread: a finished upload
    // looking like it went live.
    expect(
      screen.getByText(/seguirán escuchando la versión publicada/),
    ).toBeInTheDocument();
  });

  it("uploads through the audiobook action and reloads", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([audiobook]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Subir nueva versión/ }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: /Subir nueva versión/ }),
    );
    await uploadAudio(user, /^Audiolibro · /);

    await waitFor(() =>
      expect(actions.uploadAudiobookAction).toHaveBeenCalled(),
    );
    const [slug, order, form] = actions.uploadAudiobookAction.mock.calls[0]!;
    expect(slug).toBe("eec");
    expect(order).toBe(1);
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("durationSec")).toBe("600");
    // The browser never names where bytes go.
    expect(form.get("objectKey")).toBeNull();
    expect(actions.listChapterMediaAction).toHaveBeenCalledTimes(2);
  });

  it("publishes a staged master through the master route", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        patch(audiobook, {
          editorialStatus: "DRAFT",
          provenance: "DATABASE",
          draftId: "row_up",
          sourceReady: true,
          stagedMaster: true,
        }),
      ]),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Publicar Audiolibro · capítulo 1",
        }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Publicar Audiolibro · capítulo 1" }),
    );

    await waitFor(() =>
      expect(actions.publishMediaMasterAction).toHaveBeenCalledWith(
        "row_up",
        "eec",
        1,
      ),
    );
  });
});

describe("MediaSection — upload errors an editor can act on", () => {
  const audiobook = card({
    kind: "AUDIOBOOK",
    mediaKey: "eec-c1-audiobook-v1",
  });

  it.each([
    ["INVALID_AUDIO_TYPE", /Usa MP3 o M4A/],
    ["FILE_TOO_LARGE", /supera los 50 MB/],
    ["FILE_EMPTY", /vacío/],
    [
      "AUDIOBOOK_LEGACY_MASTER_REQUIRES_MIGRATION",
      /necesita migrarse antes de poder reemplazar/,
    ],
  ])("translates %s into copy the editor can use", async (code, copy) => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([audiobook]));
    actions.uploadAudiobookAction.mockResolvedValue({ ok: false, code });
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Subir nueva versión/ }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: /Subir nueva versión/ }),
    );
    await uploadAudio(user, /^Audiolibro/);

    await waitFor(() =>
      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(copy),
    );
  });

  it("never shows a storage error to the editor", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([audiobook]));
    actions.uploadAudiobookAction.mockResolvedValue({
      ok: false,
      error: "R2 bucket psico-media-dev objectKey rejected",
    });
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Subir nueva versión/ }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: /Subir nueva versión/ }),
    );
    await uploadAudio(user, /^Audiolibro/);

    await waitFor(() =>
      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
        /No pudimos completar la operación/,
      ),
    );
    // Storage vocabulary is not something an editor can act on.
    expect(screen.queryByText(/bucket|objectKey|R2/)).not.toBeInTheDocument();
  });
});

describe("MediaSection — podcast is 0..N", () => {
  it("offers Añadir episodio even with zero episodes", async () => {
    actions.listChapterMediaAction.mockResolvedValue(list([]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "+ Añadir episodio de podcast" }),
      ).toBeInTheDocument(),
    );
  });

  it("adds an episode without naming its key or version", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "+ Añadir episodio de podcast" }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "+ Añadir episodio de podcast" }),
    );
    await user.type(screen.getByLabelText(/Título del nuevo episodio/), "Ep 3");
    await user.type(
      screen.getByLabelText(/Descripción del nuevo episodio/),
      "Una charla.",
    );
    await uploadAudio(user, /^episodio de podcast$/);

    await waitFor(() => expect(actions.uploadPodcastAction).toHaveBeenCalled());
    const form = actions.uploadPodcastAction.mock.calls[0]![2] as FormData;
    expect(form.get("title")).toBe("Ep 3");
    // Identity is the server's.
    expect(form.get("mediaKey")).toBeNull();
    expect(form.get("mediaVersion")).toBeNull();
  });

  it("keeps every episode visible and keyed by mediaKey", async () => {
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({ mediaKey: "eec-c1-podcast-a", title: "Episodio 1" }),
        card({ mediaKey: "eec-c1-podcast-b", title: "Episodio 2" }),
        card({ mediaKey: "eec-c1-podcast-c", title: "Episodio 3" }),
      ]),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(screen.getByText("Episodio 1")).toBeInTheDocument(),
    );
    expect(screen.getByText("Episodio 2")).toBeInTheDocument();
    expect(screen.getByText("Episodio 3")).toBeInTheDocument();
    // Each episode gets its own replace control, named for the episode.
    expect(
      screen.getByRole("button", { name: "Subir nueva versión de Episodio 2" }),
    ).toBeInTheDocument();
  });

  it("replacing one episode's master names that episode's key", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({ mediaKey: "eec-c1-podcast-a", title: "Episodio 1" }),
        card({ mediaKey: "eec-c1-podcast-b", title: "Episodio 2" }),
      ]),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Subir nueva versión de Episodio 2",
        }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Subir nueva versión de Episodio 2" }),
    );
    await uploadAudio(user, /^Podcast · Episodio 2$/);

    await waitFor(() => expect(actions.uploadPodcastAction).toHaveBeenCalled());
    const form = actions.uploadPodcastAction.mock.calls[0]![2] as FormData;
    // Replacing THIS episode, not adding another one.
    expect(form.get("mediaKey")).toBe("eec-c1-podcast-b");
  });
});

describe("MediaSection — video", () => {
  it("shows video state and now offers the upload C2B deferred", async () => {
    // This assertion was inverted in C3. Under C2B the surface deliberately had
    // no video uploader and said so; the promise it made was that the capability
    // would arrive, not that it never would. What still must not appear is a
    // disabled control or a placeholder that looks like it does something.
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({
          kind: "VIDEO",
          mediaKey: "eec-c1-video-v1",
          title: "Video · capítulo 1",
          runtimeAvailability: "COMING_SOON",
          sourceReady: false,
        }),
      ]),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(screen.getByText("Video · capítulo 1")).toBeInTheDocument(),
    );
    const upload = screen.getByRole("button", { name: /Subir Video/ });
    expect(upload).toBeEnabled();
    expect(
      screen.queryByText(/subida de video llegará en la siguiente etapa/i),
    ).not.toBeInTheDocument();
  });
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

describe("MediaSection — a format the chapter does not have", () => {
  it("offers to create it instead of stating a dead end", async () => {
    actions.listChapterMediaAction.mockResolvedValue(list([], ["VIDEO"]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(screen.getByText("No disponible")).toBeInTheDocument(),
    );
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crear ficha" }),
    ).toBeInTheDocument();
    // The old copy was a statement with nothing to do about it.
    expect(
      screen.queryByText(/todavía no tiene formatos multimedia/),
    ).not.toBeInTheDocument();
  });

  it("creates a definition with no file, and says so", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([], ["PODCAST"]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crear ficha" }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Crear ficha" }));

    // The screen is explicit that nothing is being uploaded.
    expect(
      screen.getByText(/Se crea sin archivo.*«En producción»/),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/Descripción del nuevo Podcast/),
      "Una conversación.",
    );
    await user.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() =>
      expect(actions.createChapterMediaAction).toHaveBeenCalled(),
    );
    const [slug, order, body] = actions.createChapterMediaAction.mock.calls[0]!;
    expect(slug).toBe("eec");
    expect(order).toBe(1);
    expect(body.kind).toBe("PODCAST");
    // The browser never names a media key — that is a completion identity.
    expect(body).not.toHaveProperty("mediaKey");
    expect(body).not.toHaveProperty("source");
  });

  it("will not submit without a description", async () => {
    const user = userEvent.setup();
    actions.listChapterMediaAction.mockResolvedValue(list([], ["PODCAST"]));
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crear ficha" }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Crear ficha" }));

    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();
  });

  it("shows existing formats AND the missing ones together", async () => {
    // A chapter with two podcast episodes and no video: every episode listed,
    // plus one offer to announce the missing format.
    actions.listChapterMediaAction.mockResolvedValue(
      list(
        [
          card({ mediaKey: "eec-c1-podcast-v1", title: "Episodio 1" }),
          card({ mediaKey: "eec-c1-podcast-ep2", title: "Episodio 2" }),
        ],
        ["VIDEO"],
      ),
    );
    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await waitFor(() =>
      expect(screen.getByText("Episodio 1")).toBeInTheDocument(),
    );
    expect(screen.getByText("Episodio 2")).toBeInTheDocument();
    expect(screen.getByText("No disponible")).toBeInTheDocument();
  });
});

describe("chapter video (C3)", () => {
  it("offers to upload a video, which C2B deliberately did not", async () => {
    // The reason this is asserted rather than assumed: the button was gated on
    // `kind !== "VIDEO"` for a whole block, and the gate is exactly what C3
    // removes.
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({
          kind: "VIDEO",
          mediaKey: "eec-c1-video-v1",
          title: "Video",
          sourceReady: false,
          runtimeAvailability: "COMING_SOON",
        }),
      ]),
    );

    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    expect(
      await screen.findByRole("button", { name: /Subir Video/i }),
    ).toBeInTheDocument();
  });

  it("says the file is still missing, not that there is none", async () => {
    // An abandoned upload is a state the editor caused and can resolve. Reading
    // it as "sin archivo" would hide that an attempt is outstanding.
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({
          kind: "VIDEO",
          mediaKey: "eec-c1-video-v1",
          title: "Video",
          sourceReady: false,
          runtimeAvailability: "COMING_SOON",
          editorialStatus: "DRAFT",
          provenance: "DATABASE",
          draftId: "draft-1",
          awaitingUpload: true,
        }),
      ]),
    );

    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    expect(
      await screen.findByText(/esperando el archivo/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reintentar Video/i }),
    ).toBeInTheDocument();
  });

  it("does not offer to publish a video whose file never arrived", async () => {
    // The server refuses this; showing the button would make the editor discover
    // the rule by pressing it and reading an error.
    actions.listChapterMediaAction.mockResolvedValue(
      list([
        card({
          kind: "VIDEO",
          mediaKey: "eec-c1-video-v1",
          title: "Video",
          sourceReady: false,
          runtimeAvailability: "COMING_SOON",
          editorialStatus: "DRAFT",
          provenance: "DATABASE",
          draftId: "draft-1",
          awaitingUpload: true,
        }),
      ]),
    );

    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await screen.findByText(/esperando el archivo/i);
    expect(
      screen.queryByRole("button", { name: /Publicar/i }),
    ).not.toBeInTheDocument();
  });

  it("asks for a destination and never posts the file to our own server", async () => {
    // The whole point of the C3 transport: the bytes go straight to the
    // provider, so no action here may receive a FormData carrying the file.
    actions.listChapterMediaAction.mockResolvedValue(list([], []));
    actions.createVideoUploadIntentAction.mockResolvedValue({
      ok: true,
      data: {
        draftId: "draft-1",
        mediaKey: "eec-c1-video-x-v1",
        mediaVersion: 1,
        uploadUrl: "https://upload.videodelivery.net/one-time",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    });

    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /\+ Añadir video/i }),
    );

    await userEvent.type(
      screen.getByLabelText("Título del video"),
      "Una escena",
    );
    await userEvent.type(
      screen.getByLabelText("Descripción del video"),
      "Sobre el capítulo.",
    );
    await userEvent.upload(
      screen.getByLabelText("Archivo de video"),
      new File(["x"], "v.mp4", { type: "video/mp4" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Añadir video" }));

    await waitFor(() =>
      expect(actions.createVideoUploadIntentAction).toHaveBeenCalled(),
    );
    const [, , input] = actions.createVideoUploadIntentAction.mock.calls[0]!;
    // Metadata only — no file, no FormData.
    expect(input).toEqual({
      mediaKey: undefined,
      title: "Una escena",
      description: "Sobre el capítulo.",
    });
    expect(actions.uploadAudiobookAction).not.toHaveBeenCalled();
    expect(actions.uploadPodcastAction).not.toHaveBeenCalled();
  });
});

describe("video when the provider cannot take uploads", () => {
  const videoCard = () =>
    card({
      kind: "VIDEO",
      mediaKey: "eec-c1-video-v1",
      title: "Video · capítulo 1",
      sourceReady: false,
      runtimeAvailability: "COMING_SOON",
    });

  it("keeps the card visible and says so plainly", async () => {
    // The card is real editorial state and must not vanish because a provider
    // is unprovisioned. What changes is the offer, not the truth.
    actions.listChapterMediaAction.mockResolvedValue(
      list([videoCard()], [], false),
    );

    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    expect(await screen.findByText("Video · capítulo 1")).toBeInTheDocument();
    expect(
      screen.getByText(/Subida de video no disponible todavía/i),
    ).toBeInTheDocument();
  });

  it("offers no upload button an editor could press into an error", async () => {
    actions.listChapterMediaAction.mockResolvedValue(
      list([videoCard()], [], false),
    );

    render(<MediaSection bookSlug="eec" chapterOrder={1} />);
    await screen.findByText("Video · capítulo 1");

    expect(
      screen.queryByRole("button", { name: /Subir Video/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /\+ Añadir video/i }),
    ).not.toBeInTheDocument();
    // Not a disabled button either: a greyed control still reads as "soon,
    // maybe now", and there is nothing to wait for on this screen.
    expect(actions.createVideoUploadIntentAction).not.toHaveBeenCalled();
  });

  it("never names the provider or the reason", async () => {
    // "Cloudflare", "cuota" and "facturación" are our problems, not the
    // editor's, and a screenshot of this page travels further than we expect.
    actions.listChapterMediaAction.mockResolvedValue(
      list([videoCard()], [], false),
    );

    const { container } = render(
      <MediaSection bookSlug="eec" chapterOrder={1} />,
    );
    await screen.findByText("Video · capítulo 1");

    const text = container.textContent ?? "";
    for (const forbidden of [
      "Cloudflare",
      "Stream",
      "cuota",
      "quota",
      "facturación",
      "billing",
      "capacidad",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("still leaves audio uploads alone", async () => {
    // The capability is about video. An unprovisioned video provider must not
    // quietly take the audiobook uploader down with it.
    actions.listChapterMediaAction.mockResolvedValue(
      list(
        [
          videoCard(),
          card({
            kind: "AUDIOBOOK",
            mediaKey: "eec-c1-audiobook-v1",
            title: "Audiolibro",
          }),
        ],
        [],
        false,
      ),
    );

    render(<MediaSection bookSlug="eec" chapterOrder={1} />);

    expect(
      await screen.findByRole("button", {
        name: /Subir nueva versión de Audiolibro/i,
      }),
    ).toBeEnabled();
  });
});
