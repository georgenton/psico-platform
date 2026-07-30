import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GR-2 — ratchet over the PUBLISHED chapter-media contract (`openapi.json` plus
 * the generated client).
 *
 * The shared types and the pure parser are the runtime authority; this spec
 * pins that the DOCUMENTED contract states the same thing:
 *
 *   - exactly three operations — manifest, access, completion. No listing
 *     endpoint, no generic media event, no upload;
 *   - every response object is CLOSED (`additionalProperties: false`) with an
 *     exact `required` list, so the generated client cannot collapse it to
 *     `Record<string, never>` again;
 *   - access is a closed discriminated union on `kind`;
 *   - the completion documents 200 AND 201 with the SAME schema, and its
 *     request body is an empty closed object;
 *   - no provider fact, no storage key, no access policy and no actor id
 *     appears anywhere in the published media schemas.
 *
 * Loosening any of these is a DELIBERATE contract change that must edit this
 * file too.
 */

interface Schema {
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  oneOf?: Schema[];
  discriminator?: { propertyName?: string };
  enum?: unknown[];
  nullable?: boolean;
}

interface Operation {
  operationId?: string;
  requestBody?: { required?: boolean; content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}

const openapi = JSON.parse(
  readFileSync(join(process.cwd(), "openapi.json"), "utf8"),
) as { paths: Record<string, Record<string, Operation>> };

const MANIFEST = "/api/lector/{bookId}/{chapterOrder}/media";
const ACCESS = "/api/lector/media/{mediaKey}/access";
const COMPLETE = "/api/lector/media/{mediaKey}/complete";

const responseOf = (path: string, method: string, status: string): Schema =>
  openapi.paths[path]?.[method]?.responses?.[status]?.content?.[
    "application/json"
  ]?.schema as Schema;

/** Walk every nested object of a schema — including `oneOf` branches. */
function objects(schema: Schema | undefined): Schema[] {
  if (!schema) return [];
  const here = schema.type === "object" ? [schema] : [];
  return [
    ...here,
    ...(schema.oneOf ?? []).flatMap(objects),
    ...Object.values(schema.properties ?? {}).flatMap(objects),
    ...objects(schema.items),
  ];
}

describe("ratchet · chapter media OpenAPI surface", () => {
  it("publishes exactly three operations, with the expected ids", () => {
    const paths = Object.keys(openapi.paths)
      .filter((p) => p.includes("/media"))
      .sort();
    expect(paths).toEqual([ACCESS, COMPLETE, MANIFEST].sort());

    expect(openapi.paths[MANIFEST]?.get?.operationId).toBe(
      "getChapterMediaManifest",
    );
    expect(openapi.paths[ACCESS]?.get?.operationId).toBe(
      "getChapterMediaAccess",
    );
    expect(openapi.paths[COMPLETE]?.post?.operationId).toBe(
      "completeChapterMedia",
    );

    // One verb each: the manifest and the access are reads, the completion is
    // the only write.
    expect(Object.keys(openapi.paths[MANIFEST] ?? {})).toEqual(["get"]);
    expect(Object.keys(openapi.paths[ACCESS] ?? {})).toEqual(["get"]);
    expect(Object.keys(openapi.paths[COMPLETE] ?? {})).toEqual(["post"]);
  });

  it("the manifest success schema is closed, down to the chapter marks", () => {
    const schema = responseOf(MANIFEST, "get", "200");
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required ?? [])].sort()).toEqual([
      "bookSlug",
      "chapterOrder",
      "items",
    ]);

    const item = schema.properties?.items?.items as Schema;
    expect(item.additionalProperties).toBe(false);
    expect([...(item.required ?? [])].sort()).toEqual([
      "availability",
      "chapters",
      "description",
      "durationSec",
      "hasCaptions",
      "hasTranscript",
      "kind",
      "mediaKey",
      "mediaVersion",
      "title",
    ]);
    expect(Object.keys(item.properties ?? {}).sort()).toEqual(
      [...(item.required ?? [])].sort(),
    );

    const mark = item.properties?.chapters?.items as Schema;
    expect(mark.additionalProperties).toBe(false);
    expect([...(mark.required ?? [])].sort()).toEqual(["label", "startSec"]);
  });

  it("access is a closed discriminated union on kind", () => {
    const schema = responseOf(ACCESS, "get", "200");
    expect(schema.discriminator?.propertyName).toBe("kind");
    expect(schema.oneOf).toHaveLength(2);

    const [audio, video] = schema.oneOf as Schema[];
    expect(audio.additionalProperties).toBe(false);
    expect([...(audio.required ?? [])].sort()).toEqual([
      "expiresAt",
      "kind",
      "mediaKey",
      "mediaVersion",
      "posterUrl",
      "transcriptUrl",
      "url",
    ]);
    expect(audio.properties?.kind?.enum).toEqual(["AUDIOBOOK", "PODCAST"]);

    expect(video.additionalProperties).toBe(false);
    expect([...(video.required ?? [])].sort()).toEqual([
      "defaultTextTrack",
      "embedUrl",
      "expiresAt",
      "kind",
      "mediaKey",
      "mediaVersion",
      "posterUrl",
      "transcriptUrl",
    ]);
    expect(video.properties?.kind?.enum).toEqual(["VIDEO"]);
  });

  it("the completion documents 200 and 201 with the SAME closed schema", () => {
    const created = responseOf(COMPLETE, "post", "201");
    const replayed = responseOf(COMPLETE, "post", "200");

    for (const schema of [created, replayed]) {
      expect(schema).toBeDefined();
      expect(schema.additionalProperties).toBe(false);
      expect([...(schema.required ?? [])].sort()).toEqual([
        "created",
        "replayed",
      ]);
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
        "created",
        "replayed",
      ]);
    }
    expect(created).toEqual(replayed);
  });

  it("the completion request body is empty, optional and closed", () => {
    const body = openapi.paths[COMPLETE]?.post?.requestBody;
    expect(body?.required).toBe(false);

    const schema = body?.content?.["application/json"]?.schema as Schema;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required ?? []).toEqual([]);
    expect(Object.keys(schema.properties ?? {})).toEqual([]);
  });

  it("every published media object is closed", () => {
    const schemas = [
      responseOf(MANIFEST, "get", "200"),
      responseOf(ACCESS, "get", "200"),
      responseOf(COMPLETE, "post", "200"),
      responseOf(COMPLETE, "post", "201"),
    ];
    for (const schema of schemas) {
      for (const obj of objects(schema)) {
        expect(obj.additionalProperties).toBe(false);
      }
    }
  });

  it("no provider fact, storage key, policy or actor id is published", () => {
    const forbidden = [
      "objectKey",
      "posterObjectKey",
      "transcriptObjectKey",
      "videoUid",
      "accountId",
      "customerCode",
      "provider",
      "accessPolicy",
      "userId",
      "editionId",
      "unitId",
      "correctOptionKey",
    ];
    for (const path of [MANIFEST, ACCESS, COMPLETE]) {
      const serialized = JSON.stringify(openapi.paths[path]);
      for (const term of forbidden) {
        // `"<term>":` is a contract FIELD; a prose mention in a description is
        // not, and this ratchet is about the shape.
        expect(serialized.includes(`"${term}":`), `${path} → ${term}`).toBe(
          false,
        );
      }
    }
  });

  it("the generated client types the two reads instead of erasing them", () => {
    const generated = readFileSync(
      join(process.cwd(), "..", "..", "packages", "api-client", "src", "generated.ts"),
      "utf8",
    );

    /**
     * Exactly one operation, by brace matching. A fixed-size window would spill
     * into the next operation and make the `Record<string, never>` assertions
     * read someone else's contract.
     */
    const slice = (operationId: string): string => {
      const start = generated.indexOf(`${operationId}: {`);
      expect(start, operationId).toBeGreaterThan(-1);
      let depth = 0;
      for (let i = generated.indexOf("{", start); i < generated.length; i += 1) {
        if (generated[i] === "{") depth += 1;
        else if (generated[i] === "}") {
          depth -= 1;
          if (depth === 0) return generated.slice(start, i + 1);
        }
      }
      throw new Error(`unbalanced braces for ${operationId}`);
    };

    // The two reads must carry real shapes — this is the regression that made
    // the client useless before the schemas were declared.
    for (const id of ["getChapterMediaManifest", "getChapterMediaAccess"]) {
      const seg = slice(id);
      expect(seg.includes("Record<string, never>"), id).toBe(false);
    }
    expect(slice("getChapterMediaManifest")).toContain("bookSlug");
    expect(slice("getChapterMediaAccess")).toContain("expiresAt");

    // The completion carries both statuses. Its ONLY `Record<string, never>` is
    // the deliberately empty request body.
    const complete = slice("completeChapterMedia");
    expect(complete).toMatch(/200: \{/);
    expect(complete).toMatch(/201: \{/);
    expect(complete).toContain("replayed: boolean");
    const emptyObjects = complete.match(/Record<string, never>/g) ?? [];
    expect(emptyObjects).toHaveLength(1);
    expect(complete.slice(0, complete.indexOf("responses:"))).toContain(
      "Record<string, never>",
    );
  });
});
