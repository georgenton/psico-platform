import type { Metadata } from "next";
import type { LectorChapterResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { readerMetadata, renderReader } from "../../reader-page";

export const dynamic = "force-dynamic";

type Params = { idOrSlug: string; unitId: string };

/**
 * A native chapter, by its STABLE identity (Phase B.A).
 *
 * The `u` discriminator is in the path, not inferred from the id's shape. This
 * URL survives the chapter moving: nothing here mentions a position, and the
 * server derives the current one from the published manifest.
 *
 * The reader itself is `renderReader` — shared with the legacy canonical route
 * and with the compatibility positional one — so all three show the same page.
 */
const fetchChapter = (p: Params) => () =>
  serverFetch<LectorChapterResponse>(
    `/lector/${encodeURIComponent(p.idOrSlug)}/ref/u/${encodeURIComponent(p.unitId)}`,
  );

export function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  return readerMetadata(fetchChapter(params));
}

export default function NativeChapterPage({ params }: { params: Params }) {
  return renderReader(fetchChapter(params));
}
