import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the published contract must say about participation (PR3).
 *
 * ── Why the document is read from disk ─────────────────────────────────────
 *
 * `openapi.json` is what CI diffs and what `@psico/api-client` is generated
 * from, so it is the artefact other people consume. The defect it caught was
 * exactly the kind that lives only there: a TypeScript union in `@Body()`
 * compiles, runs, and produces a document with NO `requestBody` for either
 * `share-confirmations` route. Nothing in the service, the DTOs or a unit test
 * would have noticed. The generated client had no idea a body existed.
 *
 * These assertions are a ratchet on that. They do not test behaviour — the
 * behaviour is tested in `circles-confirm-share.e2e-spec.ts` against a real
 * Nest pipeline. They test that the contract still DESCRIBES the behaviour,
 * because the two drifting apart is what happened.
 */

const REPO = join(__dirname, "..", "..");
const SPEC = JSON.parse(
  readFileSync(join(REPO, "openapi.json"), "utf8"),
) as OpenApiDocument;
const CLIENT = readFileSync(
  join(REPO, "..", "..", "packages", "api-client", "src", "generated.ts"),
  "utf8",
);

interface OpenApiSchema {
  oneOf?: { $ref: string }[];
  discriminator?: { propertyName: string; mapping: Record<string, string> };
  properties?: Record<string, { pattern?: string; enum?: string[] }>;
  required?: string[];
}
interface OpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: {
          required?: boolean;
          content: Record<string, { schema: OpenApiSchema }>;
        };
      }
    >
  >;
  components: { schemas: Record<string, OpenApiSchema> };
}

const SHARE_ROUTES = [
  "/api/circles/activities/{activityId}/share-confirmations",
  "/api/circles/guest/activities/{activityId}/share-confirmations",
] as const;

const VARIANTS = [
  "ConfirmSelectedFieldsDto",
  "ConfirmEditedSummaryDto",
  "ConfirmKeepPrivateDto",
] as const;

describe("circles · the published participation contract", () => {
  it.each(SHARE_ROUTES)("%s declares a required request body", (route) => {
    const body = SPEC.paths[route]?.post?.requestBody;
    expect(body, "requestBody present").toBeDefined();
    expect(body?.required, "and required").toBe(true);
  });

  it.each(SHARE_ROUTES)(
    "%s states the closed union with a discriminator",
    (route) => {
      const schema =
        SPEC.paths[route].post.requestBody!.content["application/json"].schema;
      expect(
        schema.oneOf?.map((r) => r.$ref.split("/").pop()),
        "exactly the three variants, in a oneOf",
      ).toEqual([...VARIANTS]);
      expect(schema.discriminator?.propertyName).toBe("mode");
      expect(
        Object.fromEntries(
          Object.entries(schema.discriminator!.mapping).map(([k, v]) => [
            k,
            v.split("/").pop(),
          ]),
        ),
        "every mode maps to its own schema",
      ).toEqual({
        SELECTED_FIELDS: "ConfirmSelectedFieldsDto",
        EDITED_SUMMARY: "ConfirmEditedSummaryDto",
        KEEP_PRIVATE: "ConfirmKeepPrivateDto",
      });
    },
  );

  it("publishes each variant with exactly its own fields", () => {
    const shapes = {
      ConfirmSelectedFieldsDto: ["mode", "fields"],
      ConfirmEditedSummaryDto: ["mode", "summary"],
      // The whole body. There is nowhere in the CONTRACT to put a reason
      // either, which is the point: a client reading this cannot invent one.
      ConfirmKeepPrivateDto: ["mode"],
    };
    for (const [name, keys] of Object.entries(shapes)) {
      const schema = SPEC.components.schemas[name];
      expect(schema, name).toBeDefined();
      expect(Object.keys(schema.properties ?? {}).sort(), name).toEqual(
        [...keys].sort(),
      );
      expect(schema.required?.sort(), `${name} required`).toEqual(
        [...keys].sort(),
      );
    }
  });

  it("publishes the invitation token as base64url, not merely as a length", () => {
    // `@Length(43, 43)` produced `minLength`/`maxLength` and nothing about the
    // alphabet — so the contract described 43 arbitrary characters, which 43
    // spaces satisfy. The pattern is what says "256 bits".
    const token =
      SPEC.components.schemas.CreateDuoDto.properties?.invitationToken;
    expect(token?.pattern).toBe("^[A-Za-z0-9_-]{43}$");
  });

  it("carries the three variants into the generated client", () => {
    for (const variant of VARIANTS) {
      expect(CLIENT, variant).toContain(`${variant}: {`);
    }
    // Both routes, and as a union rather than a widened `unknown`.
    const union = VARIANTS.map((v) => `components["schemas"]["${v}"]`).join(
      " | ",
    );
    const occurrences = CLIENT.split(union).length - 1;
    expect(occurrences, "member route and guest route").toBeGreaterThanOrEqual(
      2,
    );
  });
});
