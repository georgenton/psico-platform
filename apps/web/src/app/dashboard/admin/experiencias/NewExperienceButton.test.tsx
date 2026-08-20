import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * CMS V1 (#637) — what the chapter offers, and why.
 *
 * Three states, and each of them refuses to promise something the server would
 * then decline:
 *
 *   no guide      → nothing to bind an experience to;
 *   guide, empty  → the one lineage this chapter may have is still unwritten;
 *   guide, taken  → a second key would SHARE Guide progress with the first, so
 *                   the honest next step is a new version, not a new experience.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const createDraftAction = vi.fn();

vi.mock("@/app/dashboard/admin/experiencias/actions", () => ({
  // A wrapper, not the spy itself: `vi.mock` is hoisted above the `const`, so
  // naming it directly in the factory reads it before it exists.
  createDraftAction: (...a: unknown[]) => createDraftAction(...a),
  createNextDraftAction: vi.fn(),
  saveDraftAction: vi.fn(),
  publishDraftAction: vi.fn(),
  previewDraftAction: vi.fn(),
}));

import { NewExperienceButton } from "./[bookSlug]/[chapterOrder]/NewExperienceButton";

function renderButton(overrides: {
  guideAvailable: boolean;
  lineageExists: boolean;
}) {
  return render(
    <NewExperienceButton
      bookSlug="emociones-en-construccion"
      chapterOrder={1}
      contentUnitId="unit_eec_c1"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NewExperienceButton", () => {
  it("offers a new experience when the chapter has a guide and no lineage yet", () => {
    renderButton({ guideAvailable: true, lineageExists: false });

    expect(screen.getByTestId("new-experience")).toBeInTheDocument();
    expect(screen.queryByTestId("new-experience-lineage-exists")).toBeNull();
  });

  it("explains that the chapter publishes no guide, rather than showing a dead button", () => {
    renderButton({ guideAvailable: false, lineageExists: false });

    expect(screen.queryByTestId("new-experience")).toBeNull();
    expect(
      screen.getByText(/No hay una guía base disponible para este capítulo/i),
    ).toBeInTheDocument();
  });

  it("points at versioning once the chapter's one lineage exists", () => {
    // The button is GONE, not disabled: an editor should not have to click to
    // discover that this chapter cannot hold a second independent experience.
    renderButton({ guideAvailable: true, lineageExists: true });

    expect(screen.queryByTestId("new-experience")).toBeNull();
    expect(
      screen.getByTestId("new-experience-lineage-exists"),
    ).toHaveTextContent(/crea una nueva versión/i);
  });

  it("says nothing about lineage when there is no guide to have one for", () => {
    renderButton({ guideAvailable: false, lineageExists: true });

    expect(screen.queryByTestId("new-experience-lineage-exists")).toBeNull();
    expect(
      screen.getByText(/No hay una guía base disponible/i),
    ).toBeInTheDocument();
  });

  it("echoes the chapter the page was rendered against", async () => {
    // C.3A — a hint, never an authority. The server re-derives the identity and
    // refuses on a mismatch, which is what turns "published from a page opened
    // before a reorder" into something the editor sees.
    createDraftAction.mockResolvedValue({ id: "row_1" });
    renderButton({ guideAvailable: true, lineageExists: false });
    await userEvent.click(screen.getByTestId("new-experience"));
    expect(createDraftAction).toHaveBeenCalledWith(
      expect.objectContaining({ bookSlug: "emociones-en-construccion" }),
      "unit_eec_c1",
    );
  });
});
