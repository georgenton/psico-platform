import { lectorApi } from "@psico/api-client";

/**
 * The mobile reader's half of the native-chapter contract.
 *
 * Same claim as the web test: the envelope hands the client a stable
 * `contentUnitId`, and every write carries it back. Position locates a chapter;
 * it must never identify one, because a structural publish can move a chapter
 * while the screen is open.
 *
 * Exercised through the shared API client the screen actually calls, so the
 * payload asserted here is the payload the server receives.
 */

const UNIT_ID = "cu-native-42";

const post = jest.fn();
const patch = jest.fn();

jest.mock("@psico/api-client", () => {
  const actual = jest.requireActual("@psico/api-client");
  return actual;
});

describe("the mobile reader's write identity", () => {
  beforeEach(() => {
    post.mockReset();
    patch.mockReset();
    post.mockResolvedValue({ nextChapter: 4 });
    patch.mockResolvedValue({ ok: true, progressPct: 0.3 });
    // Replace the transport, not the API surface: the assertions are about the
    // body `lectorApi` builds, which is the thing that has to be right.
    const client = (
      actual as unknown as { apiClient: { post: unknown; patch: unknown } }
    ).apiClient;
    client.post = post;
    client.patch = patch;
  });

  it("sends the stable identity when completing a native chapter", async () => {
    await lectorApi.complete("libro-nativo", 3, UNIT_ID);

    const [url, body] = post.mock.calls[0]!;
    expect(String(url)).toContain("/lector/libro-nativo/3/complete");
    expect(body).toEqual({ contentUnitId: UNIT_ID });
  });

  it("sends nothing extra for a legacy chapter", async () => {
    await lectorApi.complete("libro-legacy", 1);

    const [, body] = post.mock.calls[0]!;
    // Legacy chapters keep being resolved by position, exactly as before.
    expect(body).toEqual({});
  });

  it("carries the identity on every heartbeat too", async () => {
    await lectorApi.heartbeat({
      bookId: "book-1",
      chapterOrder: 3,
      contentUnitId: UNIT_ID,
      lastBlockId: null,
      timeSpentDeltaSec: 5,
      progressPct: 0.3,
    } as never);

    const [url, body] = patch.mock.calls[0]!;
    expect(String(url)).toBe("/lector/session");
    expect((body as { contentUnitId?: string }).contentUnitId).toBe(UNIT_ID);
    // The position still travels — it is navigation context, not identity.
    expect((body as { chapterOrder?: number }).chapterOrder).toBe(3);
  });

  it("omits the identity for a legacy heartbeat", async () => {
    await lectorApi.heartbeat({
      bookId: "book-1",
      chapterOrder: 1,
      lastBlockId: null,
      timeSpentDeltaSec: 5,
      progressPct: 0.1,
    } as never);

    const [, body] = patch.mock.calls[0]!;
    expect((body as { contentUnitId?: string }).contentUnitId).toBeUndefined();
  });
});

// Imported after the mock factory so the reference is the real module.
const actual = jest.requireActual("@psico/api-client");
