import { describe, expect, it, vi } from "vitest";
import { PUBLISH_NOT_AUTHORISED, publishGuides } from "./eec-c01-guides-apply";
import type { GuideManifest } from "./eec-c01-guides-cli";

/**
 * `publish-guides` — what it refuses, and what it never does twice.
 *
 * The interesting cases are all the ones where it must NOT publish: an
 * unconfirmed call, a suite with a row missing, and a rerun over rows that are
 * already live. Publishing the happy path is one line; refusing correctly is
 * the reason the command exists as code rather than as a loop in a terminal.
 */

const manifest = (n: number): GuideManifest =>
  ({
    manifestId: `PQP-C0X-MG0${n}`,
    experienceKey: `k${n}`,
    experienceVersion: 1,
  }) as unknown as GuideManifest;

const MANIFESTS = [manifest(1), manifest(2), manifest(3)];

function prismaWith(rows: Record<string, { id: string; status: string }>) {
  return {
    chapterExperienceVersion: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { experienceKey_experienceVersion: { experienceKey: string } };
        }) => rows[where.experienceKey_experienceVersion.experienceKey] ?? null,
      ),
    },
  } as never;
}

const allDraft = {
  k1: { id: "id1", status: "DRAFT" },
  k2: { id: "id2", status: "DRAFT" },
  k3: { id: "id3", status: "DRAFT" },
};

describe("publishGuides", () => {
  it("refuses without --confirm-publish, before reading anything", async () => {
    const prisma = prismaWith(allDraft);
    const publisher = { publish: vi.fn() };
    await expect(
      publishGuides(prisma, publisher, MANIFESTS, "production", true, false),
    ).rejects.toThrow(PUBLISH_NOT_AUTHORISED);
    expect(prisma.chapterExperienceVersion.findUnique).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("publishes the whole suite through the governed service", async () => {
    const publisher = {
      publish: vi.fn(async (id: string) => ({ id, publishedAt: "now" })),
    };
    const r = await publishGuides(
      prismaWith(allDraft),
      publisher,
      MANIFESTS,
      "production",
      true,
      true,
    );
    expect(r).toMatchObject({ ok: true, outcome: "APPLIED", blocked: [] });
    expect(r.published.map((p) => p.action)).toEqual([
      "PUBLISHED",
      "PUBLISHED",
      "PUBLISHED",
    ]);
    expect(publisher.publish.mock.calls.map((c) => c[0])).toEqual([
      "id1",
      "id2",
      "id3",
    ]);
  });

  it("writes nothing on a dry run", async () => {
    const publisher = { publish: vi.fn() };
    const r = await publishGuides(
      prismaWith(allDraft),
      publisher,
      MANIFESTS,
      "production",
      false,
      true,
    );
    expect(r.outcome).toBe("DRY_RUN");
    expect(r.ok).toBe(true);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("refuses the whole suite when one draft is missing — never half-publishes", async () => {
    const publisher = { publish: vi.fn() };
    const rows = { ...allDraft };
    delete (rows as Record<string, unknown>).k2;
    const r = await publishGuides(
      prismaWith(rows),
      publisher,
      MANIFESTS,
      "production",
      true,
      true,
    );
    expect(r.outcome).toBe("REFUSED");
    expect(r.ok).toBe(false);
    expect(r.blocked).toEqual([
      { manifestId: "PQP-C0X-MG02", reason: "NO_DRAFT" },
    ]);
    // The two rows that DID exist were left alone.
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("refuses a row that is neither DRAFT nor PUBLISHED", async () => {
    const publisher = { publish: vi.fn() };
    const r = await publishGuides(
      prismaWith({ ...allDraft, k3: { id: "id3", status: "ARCHIVED" } }),
      publisher,
      MANIFESTS,
      "production",
      true,
      true,
    );
    expect(r.outcome).toBe("REFUSED");
    expect(r.blocked).toEqual([
      { manifestId: "PQP-C0X-MG03", reason: "ARCHIVED" },
    ]);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("is idempotent — a rerun finishes the job and republishes nothing", async () => {
    const publisher = {
      publish: vi.fn(async (id: string) => ({ id, publishedAt: "now" })),
    };
    const r = await publishGuides(
      prismaWith({
        k1: { id: "id1", status: "PUBLISHED" },
        k2: { id: "id2", status: "DRAFT" },
        k3: { id: "id3", status: "PUBLISHED" },
      }),
      publisher,
      MANIFESTS,
      "production",
      true,
      true,
    );
    expect(r.ok).toBe(true);
    expect(r.published.map((p) => p.action)).toEqual([
      "ALREADY_PUBLISHED",
      "PUBLISHED",
      "ALREADY_PUBLISHED",
    ]);
    // Only the one that was still a draft was touched.
    expect(publisher.publish.mock.calls.map((c) => c[0])).toEqual(["id2"]);
  });
});
