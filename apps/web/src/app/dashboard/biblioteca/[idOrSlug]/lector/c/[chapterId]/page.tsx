import type { Metadata } from "next";
import type { LectorChapterResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { readerMetadata, renderReader } from "../../reader-page";

export const dynamic = "force-dynamic";

type Params = { idOrSlug: string; chapterId: string };

/**
 * A legacy-backed chapter, by its STABLE identity (Phase B.A).
 *
 * The `c` discriminator is in the path, not inferred from the id's shape. This
 * URL survives the chapter moving: nothing here mentions a position, and the
 * server derives the current one from the published manifest.
 *
 * Still served by the legacy path: this route changes which identity the URL
 * carries, not which store answers. The chapter's `Chapter` row remains its
 * content source and its write identity.
 */
const fetchChapter = (p: Params) => () =>
  serverFetch<LectorChapterResponse>(
    `/lector/${encodeURIComponent(p.idOrSlug)}/ref/c/${encodeURIComponent(p.chapterId)}`,
  );

export function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  return readerMetadata(fetchChapter(params));
}

export default function LegacyChapterPage({ params }: { params: Params }) {
  return renderReader(fetchChapter(params));
}
