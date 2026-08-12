import { Redirect, useLocalSearchParams } from "expo-router";

import { LectorScreen } from "@/components/dashboard/lector/LectorScreen";
import { readerRefKindFromSegment } from "@/components/dashboard/lector/reader-route";

/**
 * The canonical reader route: a book and a chapter's stable identity.
 *
 * Thin on purpose — it parses the route and hands off. The screen itself lives
 * in `components/` so this route and the positional compatibility route render
 * exactly the same reader.
 */
export default function StableLectorRoute() {
  const { slug, kind, id } = useLocalSearchParams<{
    slug: string;
    kind: string;
    id: string;
  }>();

  const refKind = readerRefKindFromSegment(kind);
  // An unrecognised discriminator is not a chapter to guess at. Back to the
  // book, where every chapter is listed with a link we did generate.
  if (!refKind || !id) {
    return <Redirect href={`/books/${slug ?? ""}` as never} />;
  }

  return <LectorScreen slug={slug ?? ""} readerRef={{ kind: refKind, id }} />;
}
