import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  ChapterExperiencePublicView,
  ContentUnitRead,
  GuideExperienceCardState,
  LectorChapterResponse,
} from "@psico/types";
import { GUIDE_READER_ANCHOR } from "@psico/types";
import { LectorShell } from "./LectorShell";
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";

/**
 * C.1 — which pin the guided surface is RUNNING, and when that choice is
 * abandoned.
 *
 * The panel is stubbed here on purpose. What is under test is the shell's
 * bookkeeping — the pin it hands down and the two fields that must be dropped
 * together — not the panel's own rendering, which has its own suites. The stub
 * shows the pin it was given, so «which journey is running» is readable
 * instead of inferred.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

vi.mock("../guide/ReaderGuidePanel", () => ({
  READER_GUIDE_PANEL_ID: "reader-guide-panel",
  ReaderGuidePanel: (props: {
    bundle: { pin: { guideKey: string; guideVersion: number } };
    onPickAnotherExperience?: () => void;
    onClose: () => void;
  }) => (
    <aside data-testid="reader-guide-panel">
      <span data-testid="running-pin">
        {props.bundle.pin.guideKey}@{props.bundle.pin.guideVersion}
      </span>
      {props.onPickAnotherExperience ? (
        <button type="button" onClick={props.onPickAnotherExperience}>
          Ver otra experiencia
        </button>
      ) : null}
      <button type="button" onClick={props.onClose}>
        Cerrar panel
      </button>
    </aside>
  ),
}));

const getGuideDiscovery = vi.fn();
const getExperienceCardStates = vi.fn();
const listPublishedForChapter = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: (...a: unknown[]) => getGuideDiscovery(...a),
      getExperienceCardStates: (...a: unknown[]) =>
        getExperienceCardStates(...a),
    },
    experienceApi: {
      listPublishedForChapter: (...a: unknown[]) =>
        listPublishedForChapter(...a),
    },
  };
});

import { EEC_EXPERIENCE, EEC_PIN, PQP_PIN } from "../guide/guide-test-fixtures";

/**
 * A second card in the same chapter, pinned to ANOTHER book's guide.
 *
 * Deliberately a pin whose bundle exists but whose anchor belongs to a
 * different chapter — that is what makes «B never borrows A's anchor» a real
 * assertion rather than a coincidence.
 */
const FOREIGN_EXPERIENCE: ChapterExperiencePublicView = {
  ...EEC_EXPERIENCE,
  experienceKey: `${PQP_PIN.guideKey}-visitante`,
  title: "Una travesía de otro libro",
  guidePin: PQP_PIN,
};

const card = (
  pin: { guideKey: string; guideVersion: number },
  status: GuideExperienceCardState["status"] = "START",
): GuideExperienceCardState => ({ guidePin: pin, status, resumePin: pin });

beforeEach(() => {
  vi.clearAllMocks();
  class FakeIO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;
  Range.prototype.getBoundingClientRect = () => ({}) as DOMRect;

  getGuideDiscovery.mockResolvedValue({ available: true, ...EEC_PIN });
  listPublishedForChapter.mockResolvedValue({ items: [EEC_EXPERIENCE] });
  getExperienceCardStates.mockResolvedValue({
    items: [card(EEC_EXPERIENCE.guidePin)],
  });
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
});

function initialFor(order: number): LectorChapterResponse {
  return {
    book: { id: "b", slug: "s", title: "Un libro", totalChapters: 9 },
    chapter: {
      id: `ch-${order}`,
      order,
      title: "Un capítulo",
      description: null,
      durationMinutes: 10,
      audioAvailable: false,
    },
    blocks: [],
    lessons: [],
    preferences: {
      font: "serif",
      fontSize: 18,
      theme: "system",
      lineHeight: 1.6,
    },
    highlights: [],
    annotations: [],
    session: {
      lastBlockId: null,
      progressPct: 0,
      timeSpentSec: 0,
      completedAt: null,
    },
  } as unknown as LectorChapterResponse;
}

function unitWithAnchor(order: number): ContentUnitRead {
  return {
    editionKey: `${GUIDE_READER_ANCHOR.bookSlug}-1e`,
    revisionNumber: 1,
    unitKey: `unit-${order}`,
    title: "Capítulo",
    summary: null,
    order,
    partNumber: null,
    partTitle: null,
    source: "content-core",
    blocks: [
      {
        blockKey: "bk-h",
        legacyBlockId: "b-h",
        blockVersionId: "bv-h",
        kind: "HEADING",
        order: 1,
        content: GUIDE_READER_ANCHOR.sourceHeading,
        meta: null,
      },
      {
        blockKey: "bk-p",
        legacyBlockId: "b-p",
        blockVersionId: "bv-p",
        kind: "PARAGRAPH",
        order: 2,
        content: `Un preámbulo. ${GUIDE_READER_ANCHOR.passageLastSentence}`,
        meta: null,
      },
    ],
  };
}

function renderReader() {
  return render(
    <GuideAvailabilityProvider available>
      <GuideActorScopeProvider scope={"A".repeat(43)}>
        <LectorShell
          apiBase="https://api.example/api"
          token="tok"
          bookSlug={GUIDE_READER_ANCHOR.bookSlug}
          initial={initialFor(1)}
          unit={unitWithAnchor(1)}
          marks={null}
        />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>,
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openChapterHome() {
  fireEvent.click(await screen.findByTestId("reader-open-chapter-home"));
  return screen.findByTestId("chapter-experiences");
}

describe("the pin that runs", () => {
  it("the generic tab, with nothing picked, runs the CHAPTER's pin", async () => {
    renderReader();
    fireEvent.click(await screen.findByTestId("reader-mode-guiada"));

    expect(await screen.findByTestId("running-pin")).toHaveTextContent(
      `${EEC_PIN.guideKey}@${EEC_PIN.guideVersion}`,
    );
  });

  it("a picked card runs ITS pin, and never borrows another guide's anchor", async () => {
    // The foreign journey's anchor belongs to another book's chapter. Running
    // it here would mean narrating this chapter with someone else's passage —
    // so it fails closed instead of falling back to the chapter's own guide.
    listPublishedForChapter.mockResolvedValue({ items: [FOREIGN_EXPERIENCE] });
    getExperienceCardStates.mockResolvedValue({
      items: [card(FOREIGN_EXPERIENCE.guidePin)],
    });
    renderReader();
    await openChapterHome();

    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));
    await settle();

    expect(screen.queryByTestId("reader-guide-panel")).toBeNull();
    // And emphatically NOT the chapter's own guide as a stand-in.
    expect(screen.queryByTestId("running-pin")).toBeNull();
  });
});

describe("abandoning the selection", () => {
  it("«Ver otra experiencia» drops BOTH halves of the pick", async () => {
    /**
     * The bug this pins: clearing only `pickedExperience` left `pickedPin`
     * behind, so the generic guided tab reopened the journey the reader had
     * just walked away from.
     *
     * Made observable by having chapter discovery name NOTHING. Then the
     * guided tab can only exist because of the pick, and a pick that survives
     * abandoning it is visible as a tab that should not be there. With
     * discovery available the two pins would coincide and the bug would hide.
     */
    getGuideDiscovery.mockResolvedValue({ available: false });
    const second: ChapterExperiencePublicView = {
      ...EEC_EXPERIENCE,
      experienceKey: `${EEC_PIN.guideKey}-segunda`,
      title: "La segunda",
      guidePin: { guideKey: EEC_PIN.guideKey, guideVersion: 3 },
    };
    listPublishedForChapter.mockResolvedValue({
      items: [EEC_EXPERIENCE, second],
    });
    getExperienceCardStates.mockResolvedValue({
      items: [card(EEC_EXPERIENCE.guidePin), card(second.guidePin)],
    });
    renderReader();
    await openChapterHome();

    const buttons = await screen.findAllByRole("button", { name: /Empezar/ });
    fireEvent.click(buttons[0]!);
    expect(await screen.findByTestId("running-pin")).toHaveTextContent(
      `${EEC_PIN.guideKey}@${EEC_PIN.guideVersion}`,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Ver otra experiencia/ }),
    );
    await settle();
    expect(screen.queryByTestId("reader-guide-panel")).toBeNull();

    // Back on the text: with the pick abandoned and discovery naming nothing,
    // there is no guided surface left to reopen.
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));
    await settle();
    expect(screen.queryByTestId("reader-mode-guiada")).toBeNull();
    expect(screen.queryByTestId("running-pin")).toBeNull();
  });

  it("closing the panel is NOT abandoning: the same journey reopens", async () => {
    renderReader();
    await openChapterHome();
    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cerrar panel/ }));
    await settle();
    expect(screen.queryByTestId("reader-guide-panel")).toBeNull();

    fireEvent.click(screen.getByTestId("reader-mode-guiada"));
    expect(await screen.findByTestId("running-pin")).toHaveTextContent(
      `${EEC_PIN.guideKey}@${EEC_PIN.guideVersion}`,
    );
  });

  it("a picked pin survives a plain close even when discovery names nothing", async () => {
    // With chapter discovery silent, the ONLY reason the panel can reopen is
    // the pick — so this is what proves a close did not quietly drop it.
    getGuideDiscovery.mockResolvedValue({ available: false });
    renderReader();
    await openChapterHome();
    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cerrar panel/ }));
    await settle();

    fireEvent.click(await screen.findByTestId("reader-mode-guiada"));
    await waitFor(() =>
      expect(screen.getByTestId("running-pin")).toHaveTextContent(
        `${EEC_PIN.guideKey}@${EEC_PIN.guideVersion}`,
      ),
    );
  });
});
