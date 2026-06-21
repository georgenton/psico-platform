import { describe, it, expect, vi } from "vitest";
import { JourneysService } from "./journeys.service";

function buildPrisma() {
  return {
    journey: { findMany: vi.fn() },
    book: { findMany: vi.fn() },
  };
}

describe("JourneysService.list", () => {
  it("returns empty list when no journeys are published", async () => {
    const prisma = buildPrisma();
    prisma.journey.findMany.mockResolvedValue([]);
    const svc = new JourneysService(prisma as never);

    const result = await svc.list();
    expect(result.journeys).toEqual([]);
    // No follow-up book query needed when there's nothing to enrich.
    expect(prisma.book.findMany).not.toHaveBeenCalled();
  });

  it("joins each journey against the Book catalog and preserves order", async () => {
    const prisma = buildPrisma();
    const publishedAt = new Date("2026-06-01T00:00:00Z");
    prisma.journey.findMany.mockResolvedValue([
      {
        id: "j1",
        slug: "asentar-emociones",
        title: "Asentar emociones",
        subtitle: "Empieza aquí",
        description: "Una intro",
        coverToken: "cool",
        durationMinutes: 96,
        bookSlugs: ["book-a", "book-b"],
        order: 0,
        publishedAt,
      },
    ]);
    prisma.book.findMany.mockResolvedValue([
      // Returned in arbitrary order — the service maps by slug.
      {
        slug: "book-b",
        title: "B",
        cover: "warm",
        durationMinutes: 50,
        author: { name: "Marina" },
      },
      {
        slug: "book-a",
        title: "A",
        cover: "cool",
        durationMinutes: 46,
        author: null,
      },
    ]);

    const svc = new JourneysService(prisma as never);
    const result = await svc.list();

    expect(result.journeys).toHaveLength(1);
    const j = result.journeys[0]!;
    expect(j.id).toBe("j1");
    expect(j.coverToken).toBe("cool");
    // Book order matches the bookSlugs array, not the prisma return order.
    expect(j.books.map((b) => b.slug)).toEqual(["book-a", "book-b"]);
    expect(j.books[0]!.authorName).toBeNull();
    expect(j.books[1]!.authorName).toBe("Marina");
  });

  it("falls back to 'mixed' when an unknown coverToken hits the wire", async () => {
    const prisma = buildPrisma();
    prisma.journey.findMany.mockResolvedValue([
      {
        id: "j2",
        slug: "weird",
        title: "Weird",
        subtitle: "",
        description: null,
        coverToken: "rainbow", // not in the union
        durationMinutes: 0,
        bookSlugs: [],
        order: 0,
        publishedAt: new Date(),
      },
    ]);
    prisma.book.findMany.mockResolvedValue([]);

    const svc = new JourneysService(prisma as never);
    const result = await svc.list();
    expect(result.journeys[0]!.coverToken).toBe("mixed");
  });
});
