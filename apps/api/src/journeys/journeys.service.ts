import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type {
  CoverToken,
  JourneyBookSummary,
  JourneyCoverToken,
  JourneyListItem,
  JourneyListResponse,
} from "@psico/types";

const VALID_COVER_TOKENS: JourneyCoverToken[] = ["cool", "warm", "mixed"];
const VALID_BOOK_COVERS: CoverToken[] = ["cool", "warm", "mixed"];

/**
 * JourneysService — Sprint B5.
 *
 * Reads the curated `Journey` catalog and joins each row against the `Book`
 * table on `bookSlugs` so the frontend gets a self-contained payload (no
 * follow-up fetches per journey card).
 *
 * v1 is read-only; ops seed/edit journeys directly in DB. Sprint B6 (or
 * later) can add a small admin endpoint when the catalog needs human
 * curation more often.
 */
@Injectable()
export class JourneysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<JourneyListResponse> {
    const rows = await this.prisma.journey.findMany({
      where: { publishedAt: { not: null } },
      orderBy: [{ order: "asc" }, { publishedAt: "desc" }],
    });

    if (rows.length === 0) {
      return { journeys: [] };
    }

    // Fetch every referenced book in ONE query rather than N. The catalog is
    // small (< 100 rows in v1) so loading the full set is cheaper than
    // multiple round-trips.
    const allSlugs = Array.from(new Set(rows.flatMap((r) => r.bookSlugs)));
    const books = await this.prisma.book.findMany({
      where: { slug: { in: allSlugs }, isPublished: true },
      select: {
        slug: true,
        title: true,
        cover: true,
        durationMinutes: true,
        author: { select: { name: true } },
      },
    });
    const bookBySlug = new Map(books.map((b) => [b.slug, b]));

    const journeys: JourneyListItem[] = rows.map((row) => {
      const summaries: JourneyBookSummary[] = row.bookSlugs
        .map((slug) => {
          const b = bookBySlug.get(slug);
          if (!b) return null;
          return {
            slug: b.slug,
            title: b.title,
            authorName: b.author?.name ?? null,
            cover: VALID_BOOK_COVERS.includes(b.cover as CoverToken)
              ? (b.cover as CoverToken)
              : "mixed",
            durationMinutes: b.durationMinutes,
          } satisfies JourneyBookSummary;
        })
        .filter((b): b is JourneyBookSummary => b !== null);

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        subtitle: row.subtitle,
        description: row.description,
        coverToken: VALID_COVER_TOKENS.includes(
          row.coverToken as JourneyCoverToken,
        )
          ? (row.coverToken as JourneyCoverToken)
          : "mixed",
        durationMinutes: row.durationMinutes,
        books: summaries,
        // Filter above guarantees publishedAt != null.
        publishedAt: row.publishedAt as Date,
      } satisfies JourneyListItem;
    });

    return { journeys };
  }
}
