import { describe, expect, it } from "vitest";
import {
  readDirectUpload,
  readStatus,
} from "./cloudflare-stream-upload.service";

/**
 * Reading the provider, defensively.
 *
 * These parsers are the only place a Cloudflare response shape is trusted, and
 * both of them guard something that costs real money or real credibility to get
 * wrong: a UID we cannot store is an asset we allocated and lost, and a state we
 * read too optimistically is an unplayable video presented to readers.
 */

const ok = (result: unknown) => ({ success: true, result });

describe("readDirectUpload", () => {
  it("reads the allocated video and its one-time URL", () => {
    expect(
      readDirectUpload(
        ok({
          uid: "abcdef0123456789abcdef",
          uploadURL: "https://upload.videodelivery.net/abc",
        }),
      ),
    ).toEqual({
      uid: "abcdef0123456789abcdef",
      uploadURL: "https://upload.videodelivery.net/abc",
    });
  });

  it("rejects a UID the catalog could not store", () => {
    // Discovering this at write time would mean the cleanup no longer knows
    // which asset to delete, so it is caught while we still hold the value.
    expect(
      readDirectUpload(
        ok({ uid: "SHOUTING", uploadURL: "https://upload.example/x" }),
      ),
    ).toBeNull();
  });

  it("rejects a non-https upload URL", () => {
    expect(
      readDirectUpload(
        ok({ uid: "abcdef0123456789abcdef", uploadURL: "http://insecure/x" }),
      ),
    ).toBeNull();
  });

  it("rejects an unsuccessful envelope", () => {
    expect(readDirectUpload({ success: false, errors: [] })).toBeNull();
    expect(readDirectUpload(null)).toBeNull();
  });
});

describe("readStatus", () => {
  it("reports a finished video as ready, with the duration it measured", () => {
    expect(
      readStatus(ok({ status: { state: "ready" }, duration: 91.4 })),
    ).toEqual({ state: "READY", durationSec: 91 });
  });

  it("separates 'no file yet' from 'still working'", () => {
    // Both are non-ready, but only one of them is a state the editor caused and
    // can fix by actually picking a file.
    expect(readStatus(ok({ status: { state: "pendingupload" } }))).toEqual({
      state: "AWAITING_UPLOAD",
      durationSec: null,
    });
    expect(readStatus(ok({ status: { state: "inprogress" } }))).toEqual({
      state: "PROCESSING",
      durationSec: null,
    });
  });

  it("treats an unrecognized state as still processing, never as ready", () => {
    // Guessing "working" costs one more poll. Guessing "ready" publishes a video
    // that does not play.
    expect(readStatus(ok({ status: { state: "somethingnew" } }))).toEqual({
      state: "PROCESSING",
      durationSec: null,
    });
  });

  it("drops the provider's sentinel duration", () => {
    // Stream reports -1 for a duration it does not know yet; storing that would
    // draw a negative timeline.
    expect(
      readStatus(ok({ status: { state: "inprogress" }, duration: -1 })),
    ).toEqual({ state: "PROCESSING", durationSec: null });
  });

  it("reports an encoding failure as an error", () => {
    expect(
      readStatus(ok({ status: { state: "error" }, duration: 12 })),
    ).toEqual({ state: "ERROR", durationSec: null });
  });

  it("rejects a body with no state at all", () => {
    expect(readStatus(ok({ status: {} }))).toBeNull();
    expect(readStatus({ success: true })).toBeNull();
  });
});
