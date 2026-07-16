import { describe, expect, it } from "vitest";
import {
  CONTENT_CORE_NAMESPACE_UUID,
  blockKeyFromLegacyId,
  uuidv5,
} from "./block-key";

describe("content-core · block-key (uuidv5, deterministic identity)", () => {
  it("is deterministic — same legacy id ⇒ same key across runs", () => {
    const a = blockKeyFromLegacyId("ckabc123");
    const b = blockKeyFromLegacyId("ckabc123");
    expect(a).toBe(b);
  });

  it("distinct legacy ids ⇒ distinct keys", () => {
    expect(blockKeyFromLegacyId("block-a")).not.toBe(
      blockKeyFromLegacyId("block-b"),
    );
  });

  it("produces a well-formed RFC 4122 v5 UUID (version + variant bits)", () => {
    const key = blockKeyFromLegacyId("some-legacy-id");
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("matches the RFC 4122 v5 reference vector (dns namespace, 'example.org')", () => {
    // Well-known published vector for uuidv5.
    const DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    expect(uuidv5("example.org", DNS)).toBe(
      "aad03681-8b63-5304-89e0-8ca8f49461b5",
    );
  });

  it("namespace is a fixed, valid UUID", () => {
    expect(CONTENT_CORE_NAMESPACE_UUID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("rejects an empty legacy id", () => {
    expect(() => blockKeyFromLegacyId("")).toThrow("EMPTY_LEGACY_BLOCK_ID");
  });
});
