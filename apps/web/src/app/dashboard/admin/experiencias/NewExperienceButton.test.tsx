import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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

vi.mock("@/app/dashboard/admin/experiencias/actions", () => ({
  createDraftAction: vi.fn(),
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
      {...overrides}
    />,
  );
}

beforeEach(cleanup);

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
});
