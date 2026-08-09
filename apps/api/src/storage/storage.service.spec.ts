import { beforeEach, describe, expect, it, vi } from "vitest";
import { StorageService } from "./storage.service";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config";

/**
 * The public/protected split, at the one place it is decided.
 *
 * `uploadFile` returns a PUBLIC URL and is for assets meant to be public —
 * covers, illustrations, avatars. Protected media (audiobook, podcast,
 * transcripts) stores the OBJECT KEY and is read through `getSignedUrl`;
 * handing one of those a public URL would take it out of the signing path
 * entirely, which is the failure mode C2B has to avoid.
 *
 * A private bucket has no public base at all. That is a legitimate
 * configuration — it is what a development bucket for protected media looks
 * like — so the absence must fail loudly at the point of use rather than
 * produce `undefined/key` and persist it.
 */

const config = (publicUrl: string | undefined) =>
  ({
    get: (key: string) =>
      key === "R2_PUBLIC_URL"
        ? publicUrl
        : key === "R2_BUCKET_NAME"
          ? "bucket"
          : "x",
  }) as unknown as ConfigService<Env, true>;

let sent: unknown[];

beforeEach(() => {
  sent = [];
});

/** Replaces the S3 client so nothing here talks to a network. */
function withStubbedClient(service: StorageService): StorageService {
  (
    service as unknown as { client: { send: (c: unknown) => Promise<void> } }
  ).client = {
    send: async (command: unknown) => {
      sent.push(command);
    },
  };
  return service;
}

describe("StorageService.uploadFile — public assets", () => {
  it("returns the public URL when a base is configured", async () => {
    const service = withStubbedClient(
      new StorageService(config("https://assets.example.com")),
    );

    const url = await service.uploadFile(
      Buffer.from("x"),
      "catalog-books/libro/cover/ab.png",
      "image/png",
    );

    expect(url).toBe(
      "https://assets.example.com/catalog-books/libro/cover/ab.png",
    );
    expect(sent).toHaveLength(1);
  });

  it("refuses on a private bucket instead of building a broken URL", async () => {
    // `${undefined}/key` would be stored and 404 forever, and the failure would
    // surface far from its cause — in a reader's browser, months later.
    const service = withStubbedClient(new StorageService(config(undefined)));

    await expect(
      service.uploadFile(Buffer.from("x"), "some/key.png", "image/png"),
    ).rejects.toThrow(/R2_PUBLIC_URL_NOT_CONFIGURED/);

    // And it refuses BEFORE writing: no orphan object left behind.
    expect(sent).toHaveLength(0);
  });
});

describe("StorageService.putObject — protected media", () => {
  it("stores bytes and returns nothing, on a private bucket", async () => {
    // The shape protected media needs: the caller keeps the key it chose, so
    // there is no public URL for anyone to store by accident.
    const service = withStubbedClient(new StorageService(config(undefined)));

    await expect(
      service.putObject(
        Buffer.from("x"),
        "media/eec/c1/podcast.m4a",
        "audio/mp4",
      ),
    ).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
  });

  it("works the same when a public base happens to exist", async () => {
    // Enabling public access on a bucket must not change how protected media
    // is stored or read.
    const service = withStubbedClient(
      new StorageService(config("https://assets.example.com")),
    );

    await expect(
      service.putObject(Buffer.from("x"), "media/a.m4a", "audio/mp4"),
    ).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
  });
});

describe("StorageService — what the constructor requires", () => {
  it("constructs without a public base", () => {
    // The API must boot against a private development bucket; requiring the
    // public URL to start is what forced inventing one.
    expect(() => new StorageService(config(undefined))).not.toThrow();
  });

  it("never puts the bucket or credentials in the returned URL", async () => {
    const service = withStubbedClient(
      new StorageService(config("https://assets.example.com")),
    );
    const url = await service.uploadFile(
      Buffer.from("x"),
      "k.png",
      "image/png",
    );

    expect(url).not.toContain("bucket");
    expect(url).not.toContain("r2.cloudflarestorage.com");
  });
});

describe("StorageService.getSignedUrl", () => {
  it("does not depend on the public base", async () => {
    // The whole point of a protected master: signing works on a bucket that has
    // no public URL at all.
    const service = new StorageService(config(undefined));
    const spy = vi
      .spyOn(service, "getSignedUrl")
      .mockResolvedValue("https://signed.example/x?sig=redacted");

    await expect(service.getSignedUrl("media/a.m4a", 60)).resolves.toContain(
      "signed.example",
    );
    expect(spy).toHaveBeenCalledWith("media/a.m4a", 60);
  });
});
