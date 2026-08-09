import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChapterMediaCompleteRequestBody } from "@psico/types";

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
 *   - access is a closed union whose branches differ structurally on
 *     `kind` — no OpenAPI `discriminator`, which 3.0 only makes portable with
 *     referenced schemas;
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
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Schema }>;
  };
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
  it("keeps the ADMIN media surface out of the reader contract", () => {
    // C2A administers DEFINITIONS. If an upload route ever appears here it must
    // be a deliberate edit to this list, not a silent addition.
    const adminOps = Object.entries(openapi.paths)
      .filter(([p]) => p.startsWith("/api/pulso/") && p.includes("/media"))
      .flatMap(([p, methods]) =>
        Object.entries(methods).map(
          ([method, op]) => `${method.toUpperCase()} ${p} → ${op.operationId}`,
        ),
      )
      .sort();

    // Methods and operationIds, not just paths: an upload would most likely
    // arrive as a new POST on an existing path, which a path-only list would
    // not notice.
    expect(adminOps).toEqual(
      [
        "GET /api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/media → listContentStudioChapterMedia",
        "POST /api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/media → createContentStudioChapterMedia",
        "POST /api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/media/{mediaKey}/adopt → adoptContentStudioChapterMedia",
        "GET /api/pulso/content/media/drafts/{draftId} → getContentStudioMediaDraft",
        "PUT /api/pulso/content/media/drafts/{draftId} → updateContentStudioMediaDraft",
        "POST /api/pulso/content/media/drafts/{draftId}/publish → publishContentStudioMediaDraft",
        "POST /api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/media/audiobook/upload → uploadContentStudioAudiobook",
        "POST /api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/media/podcast/upload → uploadContentStudioPodcast",
        "POST /api/pulso/content/media/drafts/{draftId}/publish-master → publishContentStudioMediaMaster",
        "POST /api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/media/video/upload-intent → createContentStudioVideoUploadIntent",
        "GET /api/pulso/content/media/drafts/{draftId}/video-status → getContentStudioVideoUploadStatus",
      ].sort(),
    );

    // And the admin projection carries no provider fact either — the reason it
    // is a projection rather than the definition itself.
    const schemas = JSON.stringify(
      (
        openapi as unknown as {
          components: { schemas: Record<string, unknown> };
        }
      ).components.schemas.ContentStudioMediaCardDto,
    );
    for (const forbidden of [
      "objectKey",
      "videoUid",
      "accessPolicy",
      "captionLanguage",
      "posterObjectKey",
      "transcriptObjectKey",
    ]) {
      expect(schemas).not.toContain(forbidden);
    }
  });

  it("never accepts video BYTES, only a request for somewhere to put them", () => {
    // C3 hands the browser a one-time provider URL and stays out of the
    // transfer. A multipart video route appearing here would mean somebody
    // reintroduced proxying — which is the decision this design exists to avoid.
    const paths = openapi.paths as Record<string, Record<string, unknown>>;
    for (const [path, methods] of Object.entries(paths)) {
      if (!/video/i.test(path)) continue;
      const body = JSON.stringify(methods);
      expect(body).not.toContain("multipart/form-data");
      expect(body).not.toContain("binary");
    }
  });

  it("keeps the video upload contract free of provider facts", () => {
    // The browser learns where to send the file and when that expires. The
    // provider's identifier for the video is not its business, and a value in a
    // response body is a value in a screenshot.
    const schemas = (
      openapi as unknown as { components: { schemas: Record<string, unknown> } }
    ).components.schemas;
    for (const name of [
      "ContentStudioVideoUploadIntentDto",
      "ContentStudioVideoUploadStatusDto",
    ]) {
      const schema = JSON.stringify(schemas[name]);
      for (const forbidden of [
        "videoUid",
        "accountId",
        "apiToken",
        "customerCode",
        "accessPolicy",
      ]) {
        expect(schema).not.toContain(forbidden);
      }
    }
  });

  it("keeps the upload response free of provider facts", () => {
    const schema = JSON.stringify(
      (
        openapi as unknown as {
          components: { schemas: Record<string, unknown> };
        }
      ).components.schemas.ContentStudioMediaUploadResponseDto,
    );
    for (const forbidden of [
      "objectKey",
      "bucket",
      "signedUrl",
      "accessPolicy",
      "endpoint",
    ]) {
      expect(schema).not.toContain(forbidden);
    }
  });

  it("types the media draft's durationSec as a number, not an object", () => {
    // Without an explicit `type: Number` on the DTO, Swagger emits an untyped
    // schema and the generated client collapses this to `Record<string, never>`
    // — a type nothing an editor could actually send will satisfy.
    const schema = (
      openapi as unknown as {
        components: { schemas: Record<string, Schema> };
      }
    ).components.schemas.UpdateMediaDraftDto;

    expect(schema.properties?.durationSec).toMatchObject({
      type: "number",
      nullable: true,
    });
  });

  it("publishes exactly three READER operations, with the expected ids", () => {
    // Scoped to `/api/lector` on purpose. C2A added an ADMIN media surface under
    // `/api/pulso/content`, and the claim this ratchet exists to defend is about
    // what a READER can reach: no listing endpoint, no generic media event, no
    // upload. The admin surface gets its own pin below rather than a wider
    // filter here, so neither can grow unnoticed.
    const paths = Object.keys(openapi.paths)
      .filter((p) => p.startsWith("/api/lector/") && p.includes("/media"))
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

  it("access is a closed union whose branches differ structurally on kind", () => {
    const schema = responseOf(ACCESS, "get", "200");
    expect(schema.oneOf).toHaveLength(2);

    // No OpenAPI `discriminator`: the branches are declared inline, and in
    // OpenAPI 3.0 a discriminator is only portable with referenced schemas.
    // `kind` is required and literal in each branch, which is what actually
    // tells the two apart.
    expect(schema.discriminator).toBeUndefined();

    const [audio, video] = schema.oneOf as Schema[];
    for (const branch of [audio, video]) {
      expect(branch.required).toContain("kind");
      expect(branch.properties?.kind?.enum).toBeDefined();
    }

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
      join(
        process.cwd(),
        "..",
        "..",
        "packages",
        "api-client",
        "src",
        "generated.ts",
      ),
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
      for (
        let i = generated.indexOf("{", start);
        i < generated.length;
        i += 1
      ) {
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

    // Access must survive as a TypeScript UNION, not as one merged object: a
    // client has to be able to narrow on `kind` and reach `embedUrl` only on
    // the video branch. The generator hoists each branch's `kind` into its own
    // enum, so the two branches carry DIFFERENT kind types — which is exactly
    // what makes the narrowing work.
    const access = slice("getChapterMediaAccess");
    expect(access).toContain("expiresAt");
    expect(access).toMatch(/\}\s*\|\s*\{/);
    expect(access).toContain("url: string");
    expect(access).toContain("embedUrl");

    const kinds = [...access.matchAll(/kind: (\w+);/g)].map((m) => m[1]);
    expect(kinds).toHaveLength(2);
    expect(kinds[0]).not.toBe(kinds[1]);
    for (const [name, members] of [
      [kinds[0], ['AUDIOBOOK = "AUDIOBOOK"', 'PODCAST = "PODCAST"']],
      [kinds[1], ['VIDEO = "VIDEO"']],
    ] as const) {
      const start = generated.indexOf(`export enum ${name} {`);
      expect(start, name).toBeGreaterThan(-1);
      const body = generated.slice(start, generated.indexOf("}", start));
      for (const member of members) expect(body, name).toContain(member);
    }

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

// ─── Type-level assertions (checked by tsc, not at runtime) ─────────────────

/**
 * The shared type must be as closed as the published schema. An empty
 * `interface` would accept any object — it would document a closed body while
 * typing an open one — so the contract is `Record<string, never>` and these
 * assertions are what proves it.
 */
describe("type-level contract · the completion body carries nothing", () => {
  it("compiles — the assertions below are enforced by the typechecker", () => {
    const valid: ChapterMediaCompleteRequestBody = {};
    void valid;

    // The actor comes from the token; a client claiming one is rejected here,
    // long before the request exists.
    // @ts-expect-error — el cliente no posee este contexto
    const invalidUser: ChapterMediaCompleteRequestBody = { userId: "x" };
    void invalidUser;

    // The version is pinned by `mediaKey`; a client cannot assert another one.
    // @ts-expect-error — la versión la fija el catálogo, no el reproductor
    const invalidVersion: ChapterMediaCompleteRequestBody = { mediaVersion: 1 };
    void invalidVersion;

    expect(true).toBe(true);
  });
});
