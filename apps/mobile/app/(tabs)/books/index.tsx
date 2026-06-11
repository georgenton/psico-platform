import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { booksApi } from "@psico/api-client";
import type { BookCategory, BookListItem, BookListView } from "@psico/types";
import { useAuth } from "@/context/auth";
import { coverColor } from "@/components/dashboard/cover-colors";
import { relativeTime } from "@/lib/relative-time";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Biblioteca — mobile.
 *
 * Mirrors docs/design/biblioteca/mobile.jsx: search input + view tabs +
 * category chips + 2-column grid. The list re-fetches on view/category/q
 * change with a 250ms debounce on search to avoid one request per keystroke.
 */
export default function BooksScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [categories, setCategories] = useState<BookCategory[]>([]);
  const [view, setView] = useState<BookListView>("catalogo");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search → query.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query: Parameters<typeof booksApi.list>[0] = { view };
      if (categoryId) query.categoryId = categoryId;
      if (debouncedSearch.trim()) query.q = debouncedSearch.trim();
      const data = await booksApi.list(query);
      setBooks(data.books);
      if (categories.length === 0) setCategories(data.categories);
    } catch {
      setError("No se pudo cargar la biblioteca.");
    } finally {
      setLoading(false);
    }
  }, [view, categoryId, debouncedSearch, categories.length]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (!user) return null;

  // Categories chip list — prepend "Todas" sentinel.
  const chips = useMemo(
    () => [
      { id: null, label: "Todas", count: books.length } as const,
      ...categories,
    ],
    [categories, books.length],
  );

  return (
    <View style={styles.root}>
      {/* Hero header */}
      <View style={styles.header}>
        <Text style={styles.title}>Biblioteca</Text>
        <Text style={styles.subtitle}>
          {user.plan === "FREE"
            ? "1 libro gratuito · 7 disponibles con Pro."
            : "Acceso completo · Eco lee contigo."}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={Colors.warm[400]} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar libros, autores…"
          placeholderTextColor={Colors.warm[400]}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={Colors.warm[400]} />
          </Pressable>
        ) : null}
      </View>

      {/* View tabs */}
      <View style={styles.tabsRow}>
        {(
          [
            { id: "catalogo", label: "Catálogo" },
            { id: "mis", label: "Mis libros" },
            { id: "favoritos", label: "Favoritos" },
            { id: "guardados", label: "Guardados" },
            { id: "recos", label: "Sugerencias" },
          ] as const
        ).map((tab) => {
          const active = view === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setView(tab.id)}
              style={[
                styles.tab,
                active && { backgroundColor: Colors.warm[900] },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: active ? Colors.white : Colors.warm[600] },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Category chips */}
      <View style={styles.chipsScrollWrap}>
        <FlatList
          data={chips}
          keyExtractor={(c) => c.id ?? "all"}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 8 }}
          renderItem={({ item }) => {
            const active =
              (item.id === null && categoryId === null) ||
              item.id === categoryId;
            return (
              <Pressable
                onPress={() => setCategoryId(item.id ?? null)}
                style={[
                  styles.chip,
                  active && {
                    borderColor: Colors.lavender[500],
                    backgroundColor: Colors.lavender[50],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: active ? Colors.lavender[700] : Colors.warm[700],
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {"count" in item && item.count != null ? (
                  <Text style={styles.chipCount}>{item.count}</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>

      {/* Grid */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.lavender[500]} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              load();
            }}
          >
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : books.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>
            {view === "mis"
              ? "Aún no has empezado ningún libro"
              : view === "favoritos"
                ? "Aún no tienes favoritos"
                : view === "guardados"
                  ? "Aún no tienes libros guardados"
                  : "No encontramos libros"}
          </Text>
          <Text style={styles.emptySub}>
            {view === "mis"
              ? "Cuando abras tu primer capítulo, lo verás aquí."
              : view === "favoritos"
                ? "Marca el corazón en cualquier libro para que aparezca aquí."
                : view === "guardados"
                  ? "Toca Guardar en un libro para leerlo más tarde."
                  : "Intenta sin filtros o cambia la búsqueda."}
          </Text>
        </View>
      ) : (
        <FlatList<BookListItem>
          data={books}
          keyExtractor={(b) => b.id}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <BookGridCard
              book={item}
              userPlan={user.plan}
              onPress={() =>
                router.push(
                  item.tierRequired === "pro" && user.plan === "FREE"
                    ? "/(tabs)/plan"
                    : `/(tabs)/books/${item.slug}`,
                )
              }
            />
          )}
        />
      )}
    </View>
  );
}

// ─── Grid card ───────────────────────────────────────────────────────────────

function BookGridCard({
  book,
  userPlan,
  onPress,
}: {
  book: BookListItem;
  userPlan: string;
  onPress: () => void;
}) {
  const locked = book.tierRequired === "pro" && userPlan === "FREE";
  const started = (book.userProgress?.progressPct ?? 0) > 0;
  const pct = book.userProgress?.progressPct ?? 0;

  const [favorite, setFavorite] = useState(book.isFavorite);
  const [bookmark, setBookmark] = useState(book.isBookmarked);
  const [pending, setPending] = useState<"favorite" | "bookmark" | null>(null);

  // Card list re-fetches from server when filters change — sync local state if
  // the underlying book row swaps (same component instance, different book).
  useEffect(() => {
    setFavorite(book.isFavorite);
    setBookmark(book.isBookmarked);
  }, [book.id, book.isFavorite, book.isBookmarked]);

  async function toggleFavorite() {
    const prev = favorite;
    setFavorite(!prev);
    setPending("favorite");
    try {
      const res = await booksApi.toggleFavorite(book.id);
      setFavorite(res.active);
    } catch {
      setFavorite(prev);
    } finally {
      setPending(null);
    }
  }

  async function toggleBookmark() {
    const prev = bookmark;
    setBookmark(!prev);
    setPending("bookmark");
    try {
      const res = await booksApi.toggleBookmark(book.id);
      setBookmark(res.active);
    } catch {
      setBookmark(prev);
    } finally {
      setPending(null);
    }
  }

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View
        style={[styles.cardCover, { backgroundColor: coverColor(book.cover) }]}
      >
        <Text style={styles.cardCoverGlyph}>📖</Text>
        {locked ? (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={10} color={Colors.white} />
            <Text style={styles.lockBadgeText}>Pro</Text>
          </View>
        ) : null}
        <Pressable
          style={[
            styles.coverIconBtn,
            styles.coverIconFav,
            pending === "favorite" && { opacity: 0.6 },
          ]}
          onPress={toggleFavorite}
          disabled={pending !== null}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: favorite }}
          accessibilityLabel={
            favorite ? "Quitar de favoritos" : "Marcar como favorito"
          }
        >
          <Ionicons
            name={favorite ? "heart" : "heart-outline"}
            size={14}
            color={favorite ? Colors.lavender[600] : Colors.white}
          />
        </Pressable>
        <Pressable
          style={[
            styles.coverIconBtn,
            styles.coverIconBm,
            pending === "bookmark" && { opacity: 0.6 },
          ]}
          onPress={toggleBookmark}
          disabled={pending !== null}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: bookmark }}
          accessibilityLabel={
            bookmark ? "Quitar de guardados" : "Guardar para después"
          }
        >
          <Ionicons
            name={bookmark ? "bookmark" : "bookmark-outline"}
            size={13}
            color={bookmark ? Colors.sage[700] : Colors.white}
          />
        </Pressable>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {book.title}
        </Text>
        {book.authorName ? (
          <Text style={styles.cardAuthor} numberOfLines={1}>
            {book.authorName}
          </Text>
        ) : null}
        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>{book.chapters} caps</Text>
          {book.rating > 0 ? (
            <>
              <Text style={styles.cardMetaSep}>·</Text>
              <Text style={styles.cardMetaText}>
                ★ {book.rating.toFixed(1)}
              </Text>
            </>
          ) : null}
        </View>
        {started && !locked ? (
          <View style={styles.cardProgressBar}>
            <View
              style={[
                styles.cardProgressFill,
                { width: `${Math.max(0, Math.min(100, pct))}%` },
              ]}
            />
          </View>
        ) : null}
        <MarkedAtLabel
          favoritedAt={book.favoritedAt}
          bookmarkedAt={book.bookmarkedAt}
        />
      </View>
    </Pressable>
  );
}

/** Tiny "❤️ hace 3 días" / "🔖 hace 1 mes" label. Picks the more recent of the
 * two markers. Null when the user hasn't marked the book at all. */
function MarkedAtLabel({
  favoritedAt,
  bookmarkedAt,
}: {
  favoritedAt: Date | string | null;
  bookmarkedAt: Date | string | null;
}) {
  const fav = favoritedAt ? new Date(favoritedAt) : null;
  const bm = bookmarkedAt ? new Date(bookmarkedAt) : null;
  const mostRecent = fav && bm ? (fav > bm ? fav : bm) : (fav ?? bm);
  if (!mostRecent) return null;
  const label = relativeTime(mostRecent);
  if (!label) return null;
  const icon = fav && (!bm || fav >= bm) ? "❤️" : "🔖";
  return (
    <View style={styles.markedAtRow}>
      <Text style={styles.markedAtIcon}>{icon}</Text>
      <Text style={styles.markedAtText}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  errorText: {
    fontSize: 14,
    color: Colors.warm[600],
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[900],
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: 4,
  },
  retryBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: "600",
    fontSize: 14,
  },

  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.warm[500],
    marginTop: 4,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.full,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.warm[800],
    padding: 0,
  },

  tabsRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.warm[100],
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
  },

  chipsScrollWrap: {
    marginBottom: Spacing.sm,
    height: 36,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipCount: {
    fontSize: 10.5,
    fontWeight: "700",
    color: Colors.warm[400],
    backgroundColor: Colors.warm[100],
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },

  gridContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  gridRow: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    overflow: "hidden",
  },
  cardCover: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCoverGlyph: {
    fontSize: 36,
    color: "rgba(255,255,255,0.85)",
  },
  lockBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  lockBadgeText: {
    color: Colors.white,
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardBody: {
    padding: Spacing.sm + 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
    lineHeight: 17,
  },
  cardAuthor: {
    fontSize: 11,
    color: Colors.warm[500],
    marginTop: 3,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  cardMetaText: {
    fontSize: 11,
    color: Colors.warm[500],
  },
  cardMetaSep: {
    fontSize: 11,
    color: Colors.warm[300],
  },
  cardProgressBar: {
    height: 3,
    backgroundColor: Colors.warm[200],
    borderRadius: 1.5,
    marginTop: 8,
    overflow: "hidden",
  },
  cardProgressFill: {
    height: "100%",
    backgroundColor: Colors.lavender[500],
  },

  markedAtRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  markedAtIcon: {
    fontSize: 10,
  },
  markedAtText: {
    fontSize: 10.5,
    color: Colors.warm[500],
  },

  coverIconBtn: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14,
  },
  coverIconFav: {
    top: 6,
    right: 6,
  },
  coverIconBm: {
    bottom: 6,
    right: 6,
  },
});
