import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { lectorApi } from "@psico/api-client";

import { readerRoutePath } from "@/components/dashboard/lector/reader-route";
import { Colors, Spacing } from "@/theme";

/**
 * The positional reader route, kept for compatibility.
 *
 * Installed apps and existing deep links still carry a chapter number, and a
 * number is a locator, not an identity — the chapter at position 3 today need
 * not be the one that was there when the link was made. So this route no
 * longer renders: it asks the server what currently sits at that position and
 * replaces itself with the canonical identity route.
 *
 * It calls the READ-ONLY locator, never the reader. Opening the full reader to
 * discover a redirect target would record a `ReadingSession` — passing through
 * a chapter would appear, in the user's own history and in Continue Reading,
 * exactly like having read it.
 */
export default function PositionalLectorRoute() {
  const { slug, chapterOrder } = useLocalSearchParams<{
    slug: string;
    chapterOrder: string;
  }>();
  const order = Number(chapterOrder ?? "1");

  const [href, setHref] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await lectorApi.getLocator(slug ?? "", order);
        if (!cancelled) setHref(readerRoutePath(res.bookSlug, res.readerRef));
      } catch {
        // Nothing at that position any more, or no access. Falling back to the
        // book is honest: its chapter list is built from identities.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, order]);

  if (failed) return <Redirect href={`/books/${slug ?? ""}` as never} />;
  if (href) return <Redirect href={href as never} />;

  return (
    <View style={styles.center}>
      <ActivityIndicator color={Colors.sage[500]} />
      <Text style={styles.note}>Abriendo el capítulo…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.warm[50],
  },
  note: { color: Colors.warm[600], fontSize: 13 },
});
