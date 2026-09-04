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

/**
 * These suites are about card machinery — status, pick, handler guards,
 * verdicts — and they use the historical pilot as "some published card in this
 * chapter". Since EEC-C01's five shipped, that pin is no longer OFFERED as a
 * card (one surface per reading); its bundle still resolves so an open session
 * runs. Which pins reach the list is asserted, unmocked, in
 * `ChapterExperienceHome.surfaces.test.tsx`; here we simply say the chapter
 * lists what it is given.
 */
vi.mock("../guide/guide-discovery-surface", () => ({
  guideDiscoverySurface: () => "legacy",
  belongsInLegacyExperienceList: () => true,
}));

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
  resumePin: { guideKey: string; guideVersion: number } = pin,
  applicability: GuideExperienceCardState["applicability"] = "APPLIES",
): GuideExperienceCardState => ({
  guidePin: pin,
  status,
  resumePin,
  // C.3R — the server's verdict travels with the card. `APPLIES` by default
  // because these cases are about status, pick and handler guards; the ones
  // that are about applicability say so explicitly.
  applicability,
  evaluatedPin: resumePin,
});

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

  it("a card whose pin cannot run HERE is never actionable at all", async () => {
    /**
     * The foreign journey's anchor belongs to another book's chapter. Running
     * it here would narrate this chapter with someone else's passage.
     *
     * «Click and nothing opens» used to be the expectation, and that was too
     * weak: the click stored a pick and switched surface before the panel
     * refused, so the button read as broken and left a selection behind. The
     * card is now disabled BEFORE the click, and says why.
     */
    listPublishedForChapter.mockResolvedValue({ items: [FOREIGN_EXPERIENCE] });
    getExperienceCardStates.mockResolvedValue({
      items: [card(FOREIGN_EXPERIENCE.guidePin)],
    });
    renderReader();
    await openChapterHome();

    const cta = await screen.findByRole("button", {
      name: /No disponible aquí/,
    });
    expect(cta).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Empezar/ })).toBeNull();
    expect(
      screen.getByTestId(`experience-note-${FOREIGN_EXPERIENCE.experienceKey}`),
    ).toHaveTextContent(/no puede abrirse en este capítulo/i);

    fireEvent.click(cta);
    await settle();

    // Nothing moved: no panel, no surface change, and emphatically NOT the
    // chapter's own guide as a stand-in.
    expect(screen.queryByTestId("reader-guide-panel")).toBeNull();
    expect(screen.queryByTestId("running-pin")).toBeNull();
    expect(screen.getByTestId("chapter-experiences")).toBeInTheDocument();
  });

  it("CONTINUE on an older version runs THAT version when it exists here", async () => {
    // The catalog moved to `@2`, which this build does not ship; the reader's
    // run is on `@1`, which it does. Executability follows `resumePin`, so the
    // card is live and the panel opens on the run they are in.
    const published = { guideKey: EEC_PIN.guideKey, guideVersion: 2 };
    listPublishedForChapter.mockResolvedValue({
      items: [{ ...EEC_EXPERIENCE, guidePin: published }],
    });
    getExperienceCardStates.mockResolvedValue({
      // Through the builder: the verdict is part of every answer now, and a
      // hand-written item would disable the card for a reason this case is not
      // about.
      items: [card(published, "CONTINUE", EEC_PIN)],
    });
    renderReader();
    await openChapterHome();

    fireEvent.click(await screen.findByRole("button", { name: /Continuar/ }));

    expect(await screen.findByTestId("running-pin")).toHaveTextContent(
      `${EEC_PIN.guideKey}@${EEC_PIN.guideVersion}`,
    );
  });

  it("CONTINUE whose resumePin does NOT exist here is disabled", async () => {
    // Same published pin, but the run is on a version this build never
    // shipped. Offering «Continuar» would open nothing.
    const published = EEC_PIN;
    const resume = { guideKey: EEC_PIN.guideKey, guideVersion: 7 };
    getExperienceCardStates.mockResolvedValue({
      items: [{ guidePin: published, status: "CONTINUE", resumePin: resume }],
    });
    renderReader();
    await openChapterHome();

    expect(
      await screen.findByRole("button", { name: /No disponible aquí/ }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Continuar/ })).toBeNull();
  });

  it("a COMPLETED card that runs here keeps «Ver resumen»", async () => {
    getExperienceCardStates.mockResolvedValue({
      items: [card(EEC_EXPERIENCE.guidePin, "COMPLETED")],
    });
    renderReader();
    await openChapterHome();

    fireEvent.click(await screen.findByRole("button", { name: /Ver resumen/ }));
    expect(await screen.findByTestId("running-pin")).toHaveTextContent(
      `${EEC_PIN.guideKey}@${EEC_PIN.guideVersion}`,
    );
  });

  it("becomes live again when the verdict names a resumePin that runs here", async () => {
    // First answer: a run on a version this build lacks → inert. Then the
    // reader finishes elsewhere and the next answer names the published pin.
    const unavailable = {
      guidePin: EEC_PIN,
      status: "CONTINUE" as const,
      resumePin: { guideKey: EEC_PIN.guideKey, guideVersion: 7 },
    };
    getExperienceCardStates.mockResolvedValue({ items: [unavailable] });
    renderReader();
    await openChapterHome();
    expect(
      await screen.findByRole("button", { name: /No disponible aquí/ }),
    ).toBeDisabled();

    getExperienceCardStates.mockResolvedValue({
      items: [card(EEC_PIN, "START")],
    });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(
      await screen.findByRole("button", { name: /Empezar/ }),
    ).toBeEnabled();
    expect(
      screen.queryByTestId(`experience-note-${EEC_EXPERIENCE.experienceKey}`),
    ).toBeNull();
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
