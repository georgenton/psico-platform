import { describe, expect, it } from "vitest";
import {
  CircleCatalogError,
  CircleTemplateRegistry,
  PRODUCTION_CIRCLE_TEMPLATES,
  productionCircleTemplateRegistry,
  toCircleTemplatePreview,
  validateCircleActivityDefinition,
} from "@psico/types";
import {
  PUBLISHED_DUO_TEMPLATE,
  REINFORCED_DUO_TEMPLATE,
  VALID_DUO_TEMPLATE,
  templateWith,
  templateWithout,
} from "./circles.fixtures";

/**
 * The Círculos template contract.
 *
 * Most of these assert a REFUSAL. That is the point of a validator: accepting
 * a well-formed template is one line, and every interesting case is a shape
 * that must not get through — an extra key, a reveal strategy nobody approved,
 * a template whose only exit is to disclose, an internal Content Core id
 * riding along in `source`.
 */

describe("circles · template validator", () => {
  it("accepts a well-formed DUO template and freezes it deeply", () => {
    const definition = validateCircleActivityDefinition(VALID_DUO_TEMPLATE);
    expect(definition.templateKey).toBe("fixture-duo-template");
    expect(definition.participants).toEqual({ min: 2, max: 2, required: 2 });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.privatePreparation)).toBe(true);
    expect(Object.isFrozen(definition.sharing.allowedModes)).toBe(true);
    expect(Object.isFrozen(definition.safety)).toBe(true);
  });

  it("never mutates or aliases its input", () => {
    const input = structuredClone(VALID_DUO_TEMPLATE) as Record<
      string,
      unknown
    >;
    const definition = validateCircleActivityDefinition(input);
    expect(Object.isFrozen(input)).toBe(false);
    expect(definition.privatePreparation).not.toBe(input.privatePreparation);
    expect(definition.source).not.toBe(input.source);
  });

  it("refuses an unknown key rather than ignoring it", () => {
    // Metadata smuggling: an extra field is how a private draft would first
    // appear in a contract that "still validates".
    for (const smuggled of [
      { draftText: "algo" },
      { privateResponseText: "algo" },
      { notes: {} },
    ]) {
      expect(
        () => validateCircleActivityDefinition(templateWith(smuggled)),
        JSON.stringify(smuggled),
      ).toThrow(CircleCatalogError);
    }
  });

  it("refuses a Content Core id riding along in the source", () => {
    // `contentUnitId` is internal identity. It is resolved server-side and
    // must never be expressible in a contract the browser can see.
    expect(() =>
      validateCircleActivityDefinition(
        templateWith({
          source: {
            bookSlug: "libro-de-prueba",
            chapterOrder: 2,
            contentUnitId: "cms9j750u003p3mryxi63bmgy",
          },
        }),
      ),
    ).toThrow(CircleCatalogError);
  });

  it("refuses any reveal strategy other than ALL_CONFIRMED", () => {
    for (const strategy of ["ANY_CONFIRMED", "FIRST_CONFIRMED", "", null, 1]) {
      expect(
        () =>
          validateCircleActivityDefinition(
            templateWith({ reveal: { strategy } }),
          ),
        String(strategy),
      ).toThrow(CircleCatalogError);
    }
  });

  it("requires every template to offer a way NOT to share", () => {
    // Stronger than the prose, and documented as such in the ADR: an activity
    // whose only exit is disclosure should not be authorable.
    expect(() =>
      validateCircleActivityDefinition(
        templateWith({
          sharing: { allowedModes: ["SELECTED_FIELDS", "EDITED_SUMMARY"] },
        }),
      ),
    ).toThrow(CircleCatalogError);

    for (const optOut of ["KEEP_PRIVATE", "WITHDRAW"]) {
      expect(
        validateCircleActivityDefinition(
          templateWith({
            sharing: { allowedModes: ["SELECTED_FIELDS", optOut] },
          }),
        ).sharing.allowedModes,
        optOut,
      ).toContain(optOut);
    }
  });

  it("requires a private gate whenever safety is REINFORCED", () => {
    expect(
      validateCircleActivityDefinition(REINFORCED_DUO_TEMPLATE).safety
        .privateGateRequired,
    ).toBe(true);
    expect(() =>
      validateCircleActivityDefinition(
        templateWith({
          safety: {
            level: "REINFORCED",
            privateGateRequired: false,
            doNotSuggestWhen: [],
          },
        }),
      ),
    ).toThrow(CircleCatalogError);
  });

  it("pins DUO_ADULT to exactly two required participants", () => {
    for (const participants of [
      { min: 1, max: 2, required: 2 },
      { min: 2, max: 3, required: 2 },
      { min: 2, max: 2, required: 1 },
      { min: 2, max: 2, required: 3 },
    ]) {
      expect(
        () => validateCircleActivityDefinition(templateWith({ participants })),
        JSON.stringify(participants),
      ).toThrow(CircleCatalogError);
    }
  });

  it("refuses an audience the product has not enabled", () => {
    for (const audience of ["FAMILY", "GROUP", "DUO_MINOR", "", null]) {
      expect(
        () => validateCircleActivityDefinition(templateWith({ audience })),
        String(audience),
      ).toThrow(CircleCatalogError);
    }
  });

  it("refuses missing, empty, oversized and duplicated fields", () => {
    for (const key of [
      "templateKey",
      "templateVersion",
      "status",
      "audience",
      "title",
      "summary",
      "estimatedMinutes",
      "source",
      "participants",
      "privatePreparation",
      "sharing",
      "reveal",
      "conversation",
      "outcome",
      "safety",
      "ecoMode",
    ]) {
      expect(
        () => validateCircleActivityDefinition(templateWithout(key)),
        `missing ${key}`,
      ).toThrow(CircleCatalogError);
    }

    // Empty preparation, duplicated field keys, blank copy, non-positive version.
    expect(() =>
      validateCircleActivityDefinition(
        templateWith({ privatePreparation: [] }),
      ),
    ).toThrow(CircleCatalogError);
    expect(() =>
      validateCircleActivityDefinition(
        templateWith({
          privatePreparation: [
            { fieldKey: "repetido", label: "A", kind: "SHORT_TEXT" },
            { fieldKey: "repetido", label: "B", kind: "SHORT_TEXT" },
          ],
        }),
      ),
    ).toThrow(CircleCatalogError);
    expect(() =>
      validateCircleActivityDefinition(templateWith({ title: "   " })),
    ).toThrow(CircleCatalogError);
    expect(() =>
      validateCircleActivityDefinition(templateWith({ templateVersion: 0 })),
    ).toThrow(CircleCatalogError);
    expect(() =>
      validateCircleActivityDefinition(templateWith({ templateKey: "MAYUS" })),
    ).toThrow(CircleCatalogError);
  });

  it("refuses non-plain objects and exotic prototypes", () => {
    class Weird {}
    for (const value of [
      [],
      "template",
      42,
      null,
      undefined,
      Object.assign(new Weird(), VALID_DUO_TEMPLATE),
    ]) {
      expect(() => validateCircleActivityDefinition(value)).toThrow(
        CircleCatalogError,
      );
    }
  });

  it("carries a code and never the value it rejected", () => {
    try {
      validateCircleActivityDefinition(
        templateWith({ title: "un secreto que no debe aparecer" }),
      );
      // The title is valid, so force a refusal on a different field.
      validateCircleActivityDefinition(
        templateWith({ ecoMode: "un secreto que no debe aparecer" }),
      );
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CircleCatalogError);
      expect((err as CircleCatalogError).message).toBe(
        "CIRCLE_CATALOG_INVALID_DEFINITION",
      );
      expect((err as Error).message).not.toContain("secreto");
    }
  });
});

describe("circles · template registry", () => {
  it("resolves by exact pin and never by a nearby version", () => {
    const registry = new CircleTemplateRegistry([PUBLISHED_DUO_TEMPLATE]);
    expect(registry.getExact("fixture-duo-published", 1).status).toBe(
      "PUBLISHED",
    );
    expect(() => registry.getExact("fixture-duo-published", 2)).toThrow(
      CircleCatalogError,
    );
    expect(() => registry.getExact("no-existe", 1)).toThrow(CircleCatalogError);
  });

  it("refuses a duplicate key@version at construction", () => {
    expect(
      () =>
        new CircleTemplateRegistry([
          PUBLISHED_DUO_TEMPLATE,
          PUBLISHED_DUO_TEMPLATE,
        ]),
    ).toThrow(/DUPLICATE/);
  });

  it("keeps DRAFT and ARCHIVED resolvable but never previewable", () => {
    const archived = {
      ...VALID_DUO_TEMPLATE,
      templateKey: "fixture-duo-archived",
      status: "ARCHIVED" as const,
    };
    const registry = new CircleTemplateRegistry([
      VALID_DUO_TEMPLATE,
      archived,
      PUBLISHED_DUO_TEMPLATE,
    ]);
    // Resolvable: an activity already running on one must keep working.
    expect(registry.getExact("fixture-duo-template", 1).status).toBe("DRAFT");
    expect(registry.getExact("fixture-duo-archived", 1).status).toBe(
      "ARCHIVED",
    );
    // Not instantiable, and the refusal names which problem it is — "not
    // published yet" is a different operator answer from "no such template".
    for (const key of ["fixture-duo-template", "fixture-duo-archived"]) {
      try {
        registry.getPublished(key, 1);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect((err as CircleCatalogError).code, key).toBe(
          "CIRCLE_CATALOG_NOT_PUBLISHED",
        );
      }
    }
    expect(registry.listPublished().map((d) => d.templateKey)).toEqual([
      "fixture-duo-published",
    ]);
  });

  it("ships an EMPTY production catalog at this cut", () => {
    // Deliberate: the two named candidates need verifiable approved copy, which
    // lives outside this repository. The engine ships ready and carrying
    // nothing rather than carrying invented writing.
    expect(PRODUCTION_CIRCLE_TEMPLATES).toEqual([]);
    expect(productionCircleTemplateRegistry.size).toBe(0);
    expect(productionCircleTemplateRegistry.listPublished()).toEqual([]);
  });
});

describe("circles · public preview projection", () => {
  it("carries what the public may see and nothing about an instance", () => {
    const preview = toCircleTemplatePreview(
      validateCircleActivityDefinition(PUBLISHED_DUO_TEMPLATE),
    );
    const serialized = JSON.stringify(preview);

    expect(preview.title).toBe("Plantilla de prueba");
    expect(preview.participants.required).toBe(2);

    // No editorial internals, no instance state, no roster, no preparation
    // fields — a preview that leaked field keys would leak the shape of what
    // the other person is about to answer.
    for (const forbidden of [
      "contentUnitId",
      "activityId",
      "circleId",
      "participantId",
      "status",
      "privatePreparation",
      "campo-a",
      "experiencePin",
      "doNotSuggestWhen",
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });
});
