import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma";

export type ActivityFeedItemType = "diary" | "reading" | "eco" | "voice";

export interface ActivityFeedItem {
  /** Stable composite id: `<type>:<row.id>`. Survives interleave dedupe. */
  id: string;
  type: ActivityFeedItemType;
  /** ISO timestamp, used by the client for relative formatting. */
  timestamp: string;
  title: string;
  subtitle: string;
  /** Deep link the Activity row can navigate to. May be null when the
   *  source row has no UI surface yet (e.g. voice transcription). */
  href: string | null;
}

export interface ActivityFeedResponse {
  items: ActivityFeedItem[];
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
/** Pull more from each source than we'll return; merge can drop items
 *  from sources that have a denser timeline. */
const PER_SOURCE_FETCH = 12;

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async feed(userId: string, rawLimit?: number): Promise<ActivityFeedResponse> {
    const limit = clampLimit(rawLimit);

    // Privacy invariant: we only `select` the plaintext metadata. The
    // ciphertext columns are never read — see `activity.privacy.spec.ts`.
    const [diary, reading, eco, voice] = await Promise.all([
      this.prisma.diaryEntry.findMany({
        where: { userId },
        select: { id: true, mood: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_FETCH,
      }),
      this.prisma.readingSession.findMany({
        where: { userId },
        select: {
          id: true,
          lastSeenAt: true,
          progressPct: true,
          chapter: {
            select: {
              order: true,
              title: true,
              book: { select: { id: true, slug: true, title: true } },
            },
          },
        },
        orderBy: { lastSeenAt: "desc" },
        take: PER_SOURCE_FETCH,
      }),
      this.prisma.ecoMessage.findMany({
        where: {
          kind: "USER",
          thread: { userId },
        },
        select: {
          id: true,
          createdAt: true,
          thread: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_FETCH,
      }),
      this.prisma.voiceTranscription.findMany({
        where: { userId },
        select: { id: true, durationSec: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_FETCH,
      }),
    ]);

    const items: ActivityFeedItem[] = [
      ...diary.map(
        (d): ActivityFeedItem => ({
          id: `diary:${d.id}`,
          type: "diary",
          timestamp: d.createdAt.toISOString(),
          title: "Reflexión",
          subtitle: moodLabel(d.mood),
          href: `/dashboard/reflexiones/${d.id}`,
        }),
      ),
      ...reading.map(
        (r): ActivityFeedItem => ({
          id: `reading:${r.id}`,
          type: "reading",
          timestamp: r.lastSeenAt.toISOString(),
          title: r.chapter.book.title,
          subtitle: `Capítulo ${r.chapter.order} · ${Math.round(r.progressPct)}%`,
          href: `/dashboard/biblioteca/${r.chapter.book.slug}/lector/${r.chapter.order}`,
        }),
      ),
      ...eco.map(
        (e): ActivityFeedItem => ({
          id: `eco:${e.id}`,
          type: "eco",
          timestamp: e.createdAt.toISOString(),
          title: "Eco",
          subtitle: "Conversación contigo",
          href: `/dashboard/eco?thread=${e.thread.id}`,
        }),
      ),
      ...voice.map(
        (v): ActivityFeedItem => ({
          id: `voice:${v.id}`,
          type: "voice",
          timestamp: v.createdAt.toISOString(),
          title: "Dictado",
          subtitle: `${Math.round(v.durationSec)}s grabados`,
          href: null,
        }),
      ),
    ];

    items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return { items: items.slice(0, limit) };
  }
}

function clampLimit(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(raw)));
}

/** Human-friendly label for the new wellness vocabulary. Defensively
 *  handles the pre-B6b emotion tokens (calma/foco/…) so legacy entries
 *  still render something meaningful in the feed. */
function moodLabel(mood: string): string {
  const NEW: Record<string, string> = {
    great: "Te sentiste muy bien",
    good: "Te sentiste bien",
    ok: "Te sentiste neutral",
    low: "Te sentiste bajo",
    hard: "Día difícil",
  };
  const LEGACY: Record<string, string> = {
    calma: "Calma",
    foco: "Foco",
    energia: "Energía",
    reflexion: "Reflexión",
    alegria: "Alegría",
    ansiedad: "Ansiedad",
    tristeza: "Tristeza",
  };
  return NEW[mood] ?? LEGACY[mood] ?? "Anotada";
}
