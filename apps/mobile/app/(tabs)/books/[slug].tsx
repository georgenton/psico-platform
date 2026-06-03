import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { booksApi } from "@psico/api-client";
import type { BookDetailResponse } from "@psico/types";
import { useAuth } from "@/context/auth";
import { coverColor } from "@/components/dashboard/cover-colors";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Book detail — mobile.
 *
 * Mirrors the web's BookHero + ChaptersList + ReviewsSection layout, stacked
 * vertically for mobile. POST /books/:idOrSlug/start fires when the user hits
 * "Empezar" (only when not locked).
 *
 * The reader page does not exist yet; tapping a chapter row navigates back
 * to the detail (placeholder behavior). Sprint S?-reader will wire it.
 */
export default function BookDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<BookDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setError(null);
    try {
      const data = await booksApi.getDetail(slug);
      setDetail(data);
    } catch {
      setError("No se pudo cargar el libro.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.lavender[500]} />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Libro no encontrado."}</Text>
      </View>
    );
  }

  const book = detail.book;
  const isLocked = book.tierRequired === "pro" && user.plan === "FREE";
  const userProgress = detail.userProgress;
  const pct = userProgress?.progressPct ?? 0;
  const started = pct > 0;

  async function handleStart() {
    if (!slug || isLocked) return;
    setStarting(true);
    try {
      await booksApi.start(slug);
      await load();
    } catch {
      // Stays on the same screen; user can retry.
    } finally {
      setStarting(false);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Cover hero */}
      <View
        style={[styles.coverWrap, { backgroundColor: Colors.lavender[100] }]}
      >
        <View
          style={[styles.cover, { backgroundColor: coverColor(book.cover) }]}
        >
          <Text style={styles.coverGlyph}>📖</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Category badge */}
        {book.categoryLabel ? (
          <Text style={styles.eyebrow}>{book.categoryLabel}</Text>
        ) : null}

        {/* Title */}
        <Text style={styles.title}>{book.title}</Text>
        {book.subtitle ? (
          <Text style={styles.subtitle}>{book.subtitle}</Text>
        ) : null}

        {/* Author */}
        {detail.author ? (
          <View style={styles.authorRow}>
            <View style={styles.authorAvatar}>
              <Text style={styles.authorAvatarText}>
                {detail.author.initials}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.authorName}>{detail.author.name}</Text>
                {detail.author.isVerified ? (
                  <Text style={styles.verifiedTick}> ✓</Text>
                ) : null}
              </View>
              {detail.author.title ? (
                <Text style={styles.authorTitle}>{detail.author.title}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatItem value={book.chapters} label="Capítulos" />
          {book.durationMinutes > 0 ? (
            <StatItem value={`${book.durationMinutes}m`} label="Lectura" />
          ) : null}
          {book.pages ? <StatItem value={book.pages} label="Páginas" /> : null}
          <StatItem
            value={detail.rating.count > 0 ? detail.rating.avg.toFixed(1) : "—"}
            label="★ Rating"
          />
        </View>

        {/* Progress */}
        {started && pct < 100 ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressMeta}>
              <Text style={styles.progressLabel}>
                Tu progreso ·{" "}
                <Text style={styles.progressLabelBold}>{pct}%</Text>
              </Text>
              <Text style={styles.progressMetaText}>
                {Math.round((book.chapters * pct) / 100)} de {book.chapters}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
            </View>
          </View>
        ) : null}

        {/* CTA primary */}
        <Pressable
          style={[
            styles.ctaPrimary,
            {
              backgroundColor: isLocked ? Colors.warm[900] : Colors.sage[400],
            },
          ]}
          onPress={isLocked ? () => router.push("/(tabs)/plan") : handleStart}
          disabled={starting}
        >
          <Ionicons
            name={isLocked ? "lock-closed" : "play"}
            size={14}
            color={Colors.white}
          />
          <Text style={styles.ctaPrimaryText}>
            {starting
              ? "Abriendo…"
              : isLocked
                ? "Hazte Pro para leer"
                : started
                  ? `Continuar capítulo ${Math.max(1, Math.ceil((pct / 100) * book.chapters))}`
                  : "Empezar capítulo 1"}
          </Text>
        </Pressable>

        {/* About */}
        {book.summary || book.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sobre este libro</Text>
            <View style={styles.card}>
              {book.summary ? (
                <Text style={styles.aboutText}>{book.summary}</Text>
              ) : null}
              {book.description && book.description !== book.summary ? (
                <Text style={[styles.aboutText, styles.aboutSecondary]}>
                  {book.description}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Chapters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Capítulos</Text>
          {detail.chaptersList.length === 0 ? (
            <View style={[styles.card, styles.cardEmpty]}>
              <Text style={styles.emptyText}>
                Aún no hay capítulos publicados.
              </Text>
            </View>
          ) : (
            <View style={styles.chaptersCard}>
              {detail.chaptersList.map((ch, idx) => {
                const isLast = idx === detail.chaptersList.length - 1;
                return (
                  <Pressable
                    key={`${ch.n}-${idx}`}
                    onPress={() =>
                      router.push(
                        `/books/${detail.book.slug}/lector/${ch.n}` as never,
                      )
                    }
                    style={[
                      styles.chapterRow,
                      !isLast && styles.chapterDivider,
                    ]}
                  >
                    <View
                      style={[
                        styles.chapterBadge,
                        {
                          backgroundColor:
                            ch.userProgress.status === "completed"
                              ? Colors.sage[100]
                              : ch.userProgress.status === "started"
                                ? Colors.lavender[100]
                                : Colors.warm[100],
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chapterBadgeText,
                          {
                            color:
                              ch.userProgress.status === "completed"
                                ? Colors.sage[600]
                                : ch.userProgress.status === "started"
                                  ? Colors.lavender[700]
                                  : Colors.warm[500],
                          },
                        ]}
                      >
                        {ch.userProgress.status === "completed" ? "✓" : ch.n}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.chapterTitle} numberOfLines={2}>
                        {ch.title}
                      </Text>
                      <Text style={styles.chapterMeta}>
                        {ch.durationMinutes
                          ? `${ch.durationMinutes} min`
                          : "Sin duración"}
                        {ch.userProgress.status === "started"
                          ? ` · ${ch.userProgress.progressPct}%`
                          : ""}
                      </Text>
                    </View>
                    {ch.lockedByTier ? (
                      <Ionicons
                        name="lock-closed"
                        size={13}
                        color={Colors.warm[400]}
                      />
                    ) : ch.userProgress.status === "started" ? (
                      <Text style={styles.chapterCta}>Continuar →</Text>
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={Colors.warm[400]}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Rating + reviews */}
        <View style={styles.section}>
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionTitle}>Reseñas</Text>
            <Pressable
              disabled={!userProgress?.completedAt}
              style={[
                styles.reviewWriteBtn,
                {
                  backgroundColor: userProgress?.completedAt
                    ? Colors.lavender[100]
                    : Colors.warm[100],
                  opacity: userProgress?.completedAt ? 1 : 0.6,
                },
              ]}
            >
              <Text
                style={[
                  styles.reviewWriteText,
                  {
                    color: userProgress?.completedAt
                      ? Colors.lavender[700]
                      : Colors.warm[500],
                  },
                ]}
              >
                ✎ Escribir
              </Text>
            </Pressable>
          </View>

          <View style={styles.ratingSummary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ratingValue}>
                {detail.rating.count > 0 ? detail.rating.avg.toFixed(1) : "—"}
                <Text style={styles.ratingDenom}> / 5</Text>
              </Text>
              <Text style={styles.ratingCount}>
                {detail.rating.count} reseña
                {detail.rating.count === 1 ? "" : "s"}
              </Text>
              <View style={{ marginTop: Spacing.sm, gap: 4 }}>
                {([5, 4, 3, 2, 1] as const).map((star) => {
                  const count = detail.rating.breakdown[star];
                  const ratingPct =
                    detail.rating.count > 0
                      ? Math.round((count / detail.rating.count) * 100)
                      : 0;
                  return (
                    <View key={star} style={styles.ratingBarRow}>
                      <Text style={styles.ratingStarLabel}>{star}★</Text>
                      <View style={styles.ratingBar}>
                        <View
                          style={[
                            styles.ratingBarFill,
                            { width: `${ratingPct}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.ratingBarCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {detail.reviews.length === 0 ? (
            <View
              style={[styles.card, styles.cardEmpty, { marginTop: Spacing.sm }]}
            >
              <Text style={styles.emptyText}>
                Aún no hay reseñas. Sé el primero en compartir cómo te resonó.
              </Text>
            </View>
          ) : (
            detail.reviews.map((r) => (
              <View key={r.id} style={[styles.card, { marginTop: Spacing.sm }]}>
                <View style={styles.reviewHead}>
                  <View style={styles.reviewAvatar}>
                    <Text style={styles.reviewAvatarText}>
                      {r.userInitials}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.reviewMeta}>
                      {r.userCity ?? "Lector"} ·{" "}
                      {new Date(r.createdAt).toLocaleDateString("es-EC", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                    <View style={{ flexDirection: "row", marginTop: 2 }}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Text
                          key={i}
                          style={{
                            color:
                              i <= r.rating
                                ? Colors.lavender[500]
                                : Colors.warm[200],
                            fontSize: 12,
                          }}
                        >
                          ★
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
                <Text style={styles.reviewBody}>{r.text}</Text>
              </View>
            ))
          )}
        </View>

        {/* Paywall block */}
        {isLocked ? (
          <View style={styles.paywall}>
            <Text style={styles.paywallTitle}>
              Este libro está disponible con Pro
            </Text>
            <Text style={styles.paywallSub}>
              Por $7/mes accedes a todos los libros, audios guiados y Eco dentro
              del capítulo.
            </Text>
            <Pressable
              style={styles.paywallCta}
              onPress={() => router.push("/(tabs)/plan")}
            >
              <Text style={styles.paywallCtaText}>Hazte Pro →</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

// ─── StatItem ────────────────────────────────────────────────────────────────

function StatItem({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    paddingBottom: Spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.warm[50],
  },
  errorText: {
    fontSize: 14,
    color: Colors.warm[600],
    textAlign: "center",
  },

  coverWrap: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  cover: {
    width: 160,
    height: 220,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.lavender[950],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  coverGlyph: {
    fontSize: 56,
    color: "rgba(255,255,255,0.85)",
  },

  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.lavender[700],
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.warm[500],
    lineHeight: 19,
  },

  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  authorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.lavender[500],
    alignItems: "center",
    justifyContent: "center",
  },
  authorAvatarText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 13,
  },
  authorName: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  verifiedTick: {
    fontSize: 13,
    color: Colors.sage[500],
  },
  authorTitle: {
    fontSize: 11.5,
    color: Colors.warm[500],
    marginTop: 1,
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
  },
  statItem: {
    minWidth: 56,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Colors.warm[500],
    marginTop: 4,
  },

  progressWrap: {
    marginTop: Spacing.sm,
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.warm[500],
  },
  progressLabelBold: {
    fontWeight: "700",
    color: Colors.warm[800],
  },
  progressMetaText: {
    fontSize: 12,
    color: Colors.warm[500],
  },
  progressBar: {
    height: 5,
    backgroundColor: Colors.warm[200],
    borderRadius: 2.5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.lavender[500],
  },

  ctaPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: Spacing.sm + 2,
    paddingVertical: 14,
    borderRadius: Radius.md,
  },
  ctaPrimaryText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: "700",
  },

  section: {
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.warm[500],
    marginBottom: Spacing.sm,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
  },
  cardEmpty: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.warm[500],
    textAlign: "center",
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.warm[800],
  },
  aboutSecondary: {
    marginTop: Spacing.sm,
    fontSize: 13,
    color: Colors.warm[600],
  },

  chaptersCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    overflow: "hidden",
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  chapterDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.warm[100],
  },
  chapterBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chapterBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  chapterTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
    lineHeight: 17,
  },
  chapterMeta: {
    fontSize: 11,
    color: Colors.warm[500],
    marginTop: 2,
  },
  chapterCta: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.lavender[700],
  },

  reviewsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  reviewWriteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  reviewWriteText: {
    fontSize: 11,
    fontWeight: "700",
  },
  ratingSummary: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    flexDirection: "row",
  },
  ratingValue: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.warm[900],
    letterSpacing: -1,
  },
  ratingDenom: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.warm[400],
    letterSpacing: 0,
  },
  ratingCount: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: 2,
  },
  ratingBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingStarLabel: {
    fontSize: 10,
    width: 18,
    color: Colors.warm[500],
  },
  ratingBar: {
    flex: 1,
    height: 5,
    backgroundColor: Colors.warm[200],
    borderRadius: 2.5,
    overflow: "hidden",
  },
  ratingBarFill: {
    height: "100%",
    backgroundColor: Colors.lavender[400],
  },
  ratingBarCount: {
    fontSize: 10.5,
    color: Colors.warm[500],
    width: 22,
    textAlign: "right",
  },
  reviewHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reviewAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.lavender[500],
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 12,
  },
  reviewMeta: {
    fontSize: 11,
    color: Colors.warm[500],
  },
  reviewBody: {
    marginTop: Spacing.sm,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.warm[700],
  },

  paywall: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.lavender[700],
  },
  paywallTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.white,
  },
  paywallSub: {
    fontSize: 12.5,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 17,
    marginTop: 6,
  },
  paywallCta: {
    marginTop: Spacing.sm + 2,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    backgroundColor: Colors.sage[400],
    borderRadius: Radius.md,
  },
  paywallCtaText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 13,
  },
});
