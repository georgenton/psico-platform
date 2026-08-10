import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  AUDIO_MAX_BYTES,
  AUDIO_TRANSPORT_LIMIT,
  assertUploadableAudio,
  audioObjectKey,
} from "./audio-upload";

/**
 * What counts as an uploadable audio master.
 *
 * The limit is the one `/autor` already established for chapter audio. Copying
 * the 5 MB image ceiling here would reject almost every real audiobook, which is
 * why the two live in separate helpers rather than one "upload" module.
 */

const ok = () => ({
  mimetype: "audio/mp4",
  size: 1024,
  buffer: Buffer.alloc(1024, 1),
});

describe("audio limits", () => {
  it("uses the audio product limit, not the image one", () => {
    expect(AUDIO_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(AUDIO_MAX_BYTES).not.toBe(5 * 1024 * 1024);
  });

  it("sets the transport limit one byte above the rule", () => {
    // Multer aborts at OR ABOVE `fileSize`, so passing AUDIO_MAX_BYTES would
    // refuse a file of exactly 50 MB that every other layer accepts.
    expect(AUDIO_TRANSPORT_LIMIT).toBe(AUDIO_MAX_BYTES + 1);
  });

  it("accepts exactly the maximum and refuses one byte more", () => {
    expect(() =>
      assertUploadableAudio({ ...ok(), size: AUDIO_MAX_BYTES }),
    ).not.toThrow();
    expect(() =>
      assertUploadableAudio({ ...ok(), size: AUDIO_MAX_BYTES + 1 }),
    ).toThrow(BadRequestException);
  });
});

describe("what audio is refused", () => {
  it("refuses a missing file", () => {
    expect(() => assertUploadableAudio(undefined)).toThrow(BadRequestException);
  });

  it("refuses an empty file", () => {
    // Passes a MIME check and produces a player that spins forever.
    expect(() =>
      assertUploadableAudio({ ...ok(), size: 0, buffer: Buffer.alloc(0) }),
    ).toThrow(BadRequestException);
  });

  it.each([
    ["audio/wav", "uncompressed — a chapter would blow the size limit"],
    ["audio/ogg", "no Safari support, which is most of the iOS audience"],
    ["audio/webm", "not decoded reliably by both clients"],
    ["video/mp4", "not audio"],
    ["application/octet-stream", "arbitrary binary"],
  ])("refuses %s (%s)", (mimetype) => {
    expect(() => assertUploadableAudio({ ...ok(), mimetype })).toThrow(
      BadRequestException,
    );
  });

  it.each(["audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a"])(
    "accepts %s",
    (mimetype) => {
      expect(() => assertUploadableAudio({ ...ok(), mimetype })).not.toThrow();
    },
  );
});

describe("object keys", () => {
  it("follows the catalog's convention and is server-minted", () => {
    const key = audioObjectKey("eec", 3, "podcast", "audio/mp4");
    expect(key).toMatch(/^media\/eec\/c3\/podcast\/[0-9a-f]{16}\.m4a$/);
  });

  it("never collides, so a new master cannot overwrite an old one's bytes", () => {
    // An older media version still points at the previous key; reusing it would
    // silently change what a completed listen resolves to.
    const keys = new Set(
      Array.from({ length: 50 }, () =>
        audioObjectKey("eec", 1, "audiobook", "audio/mpeg"),
      ),
    );
    expect(keys.size).toBe(50);
  });

  it("never contains the uploader's filename", () => {
    // The filename is attacker-controlled text that would otherwise decide
    // where bytes land.
    const key = audioObjectKey("eec", 1, "audiobook", "audio/mpeg");
    expect(key).not.toContain("..");
    expect(key.startsWith("media/")).toBe(true);
  });
});
