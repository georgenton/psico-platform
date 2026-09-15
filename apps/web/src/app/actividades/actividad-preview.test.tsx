import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CircleCatalogError,
  CircleTemplateRegistry,
  PRODUCTION_CIRCLE_TEMPLATES,
  productionCircleTemplateRegistry,
  toCircleTemplatePreview,
} from "@psico/types";

import ActividadPreviewPage from "./[templateKey]/page";
import {
  ARCHIVADA,
  BORRADOR,
  PLANTILLA,
} from "@/components/circulos/__fixtures__/actividad";

/**
 * The public preview is the only Círculos page a stranger may read, so what it
 * refuses matters more than what it shows.
 */

describe("the production catalog carries one activity, and the page shows that one", () => {
  it("publishes exactly the approved template", () => {
    // Publishing one is an editorial act with its own approval, not a side
    // effect of building this page. Exactly one has that approval.
    expect(PRODUCTION_CIRCLE_TEMPLATES).toHaveLength(1);
    const published = productionCircleTemplateRegistry.listPublished();
    expect(published).toHaveLength(1);
    expect(published[0].templateKey).toBe("duo-lo-que-me-ayuda");
  });

  it("previews it for a stranger, with copy and never with an instance", () => {
    render(
      <ActividadPreviewPage params={{ templateKey: "duo-lo-que-me-ayuda" }} />,
    );

    expect(
      screen.getByRole("heading", {
        name: /lo que me ayuda cuando estoy así/i,
      }),
    ).toBeInTheDocument();
    // The preview type carries no roster, no state and no ids; assert the page
    // did not find another way to render one.
    expect(document.body.textContent).not.toMatch(
      /participantId|activityId|cmu[a-z0-9]{8}/i,
    );
  });

  it("renders an unavailable state rather than inventing an activity", () => {
    render(<ActividadPreviewPage params={{ templateKey: "cualquiera" }} />);

    expect(
      screen.getByRole("heading", { name: /no está disponible/i }),
    ).toBeInTheDocument();
    // No invented title, no placeholder activity, no sample copy.
    expect(document.body.textContent).not.toMatch(
      /lorem|ejemplo de actividad/i,
    );
  });

  it("still refuses the synthetic fixture by key", () => {
    render(
      <ActividadPreviewPage params={{ templateKey: "e2e-duo-sintetica" }} />,
    );
    expect(
      screen.getByRole("heading", { name: /no está disponible/i }),
    ).toBeInTheDocument();
  });
});

describe("DRAFT and ARCHIVED can never reach a stranger", () => {
  it("refuses to project a DRAFT", () => {
    expect(() => toCircleTemplatePreview(BORRADOR)).toThrow(CircleCatalogError);
  });

  it("refuses to project an ARCHIVED template", () => {
    // An activity already running on an archived template keeps working —
    // `getExact` still resolves it — but it stops being previewable.
    expect(() => toCircleTemplatePreview(ARCHIVADA)).toThrow(
      CircleCatalogError,
    );
  });

  it("lists neither of them as published", () => {
    const registry = new CircleTemplateRegistry([
      PLANTILLA,
      BORRADOR,
      ARCHIVADA,
    ]);
    expect(registry.listPublished().map((d) => d.templateKey)).toEqual([
      "fixture-duo",
    ]);
    // Both still resolve by exact pin, which is what keeps a running activity
    // alive.
    expect(registry.getExact("fixture-draft", 1).status).toBe("DRAFT");
    expect(registry.getExact("fixture-archived", 1).status).toBe("ARCHIVED");
  });
});

describe("the preview carries nothing about any instance", () => {
  it("exposes only template copy — no id, roster, state or participant", () => {
    const preview = toCircleTemplatePreview(PLANTILLA);
    const serialized = JSON.stringify(preview);

    for (const leak of [
      "activityId",
      "circleId",
      "participantId",
      "memberId",
      "invitationId",
      "tokenHash",
      "contentUnitId",
      "privatePreparation",
      "status",
    ]) {
      expect(serialized).not.toContain(leak);
    }

    expect(Object.keys(preview).sort()).toEqual([
      "audience",
      "conversationTurns",
      "estimatedMinutes",
      "outcomeKind",
      "participants",
      "safetyLevel",
      "summary",
      "templateKey",
      "templateVersion",
      "title",
    ]);
  });
});
