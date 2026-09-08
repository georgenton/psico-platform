import Link from "next/link";
import type { BookOutlineEntry, ChapterListItem } from "@psico/types";
import { bookOutline, readerChapterPath } from "@psico/types";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function partLabel(n: number): string {
  return `Parte ${ROMAN[n] ?? n}`;
}

/** Group chapters into their book parts, preserving order. Single-part or
 *  part-less books yield one unlabeled group. */
function groupByPart(
  chapters: ChapterListItem[],
): { key: string; heading: string | null; chapters: ChapterListItem[] }[] {
  const hasParts = chapters.some((c) => c.partNumber != null);
  if (!hasParts) return [{ key: "flat", heading: null, chapters }];
  const groups: {
    key: string;
    heading: string | null;
    chapters: ChapterListItem[];
  }[] = [];
  for (const ch of chapters) {
    const n = ch.partNumber ?? 0;
    const heading =
      ch.partNumber != null
        ? `${partLabel(n)}${ch.partTitle ? ` · ${ch.partTitle}` : ""}`
        : "Otros capítulos";
    const last = groups[groups.length - 1];
    if (last && last.key === `p${n}`) last.chapters.push(ch);
    else groups.push({ key: `p${n}`, heading, chapters: [ch] });
  }
  return groups;
}

/**
 * ChaptersList — table of contents for the book detail page.
 *
 * Two shapes, chosen by whether the book declares an editorial structure
 * (`@psico/types/book-structure`):
 *
 *   - DECLARED — front matter, then the numbered chapters, then back matter.
 *     The number comes from the edition, never from `n`: «Parejas que perduran»
 *     keeps its front matter at platform order 1, so printing `n` announced
 *     nine chapters for a book that prints eight.
 *   - UNDECLARED — the list exactly as it was: grouped by book part when the
 *     book defines parts, otherwise flat, and with no number anywhere. A book
 *     that has not declared a structure is not given an invented one.
 *
 * Locked-by-tier rows show a padlock but still navigate (to the paywall flow).
 */
export function ChaptersList({
  chapters,
  bookSlug,
}: {
  chapters: ChapterListItem[];
  bookSlug: string;
}) {
  if (chapters.length === 0) {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-8 text-center text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        Aún no hay capítulos publicados.
      </div>
    );
  }

  const outline = bookOutline(bookSlug, chapters);
  if (outline.declared) {
    return (
      <section>
        {outline.frontMatter.length > 0 ? (
          <OutlineGroup
            heading="Antes de empezar"
            entries={outline.frontMatter}
            bookSlug={bookSlug}
          />
        ) : null}
        <OutlineGroup
          heading="Capítulos"
          entries={outline.chapters}
          bookSlug={bookSlug}
        />
        {outline.backMatter.length > 0 ? (
          <OutlineGroup
            heading="Para cerrar"
            entries={outline.backMatter}
            bookSlug={bookSlug}
          />
        ) : null}
      </section>
    );
  }

  const groups = groupByPart(chapters);
  return (
    <section>
      <h2
        className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Capítulos
      </h2>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.key}>
            {group.heading ? (
              <h3
                className="mb-2 text-[12.5px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-lavender-700)" }}
              >
                {group.heading}
              </h3>
            ) : null}
            <ol
              className="overflow-hidden rounded-2xl border-[1.5px] bg-white"
              style={{ borderColor: "var(--color-warm-200)" }}
            >
              {group.chapters.map((ch, idx) => (
                <li
                  key={`${ch.n}-${idx}`}
                  style={{
                    borderBottom:
                      idx < group.chapters.length - 1
                        ? "1px solid var(--color-warm-100)"
                        : undefined,
                  }}
                >
                  <ChapterRow ch={ch} label={null} bookSlug={bookSlug} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

/** One labelled block of the table of contents. */
function OutlineGroup({
  heading,
  entries,
  bookSlug,
}: {
  heading: string;
  entries: readonly BookOutlineEntry<ChapterListItem>[];
  bookSlug: string;
}) {
  return (
    <div className="mb-5">
      <h2
        className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-warm-500)" }}
      >
        {heading}
      </h2>
      <ol
        className="overflow-hidden rounded-2xl border-[1.5px] bg-white"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        {entries.map((entry, idx) => (
          <li
            key={`${entry.title}-${idx}`}
            style={{
              borderBottom:
                idx < entries.length - 1
                  ? "1px solid var(--color-warm-100)"
                  : undefined,
            }}
          >
            <ChapterRow
              ch={entry.target}
              label={entry.label}
              // A section shows its own name, not the title of the unit that
              // happens to contain it.
              titleOverride={entry.kind === "SECTION" ? entry.title : null}
              bookSlug={bookSlug}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ChapterRow({
  ch,
  label,
  titleOverride,
  bookSlug,
}: {
  ch: ChapterListItem;
  label: string | null;
  titleOverride?: string | null;
  bookSlug: string;
}) {
  return (
    <Link
      // Stable identity, not position: this link survives the chapter moving.
      href={readerChapterPath(bookSlug, ch.readerRef)}
      className="grid grid-cols-[40px_1fr_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--color-warm-50)]"
    >
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-full font-mono text-[12px] font-bold"
        style={{
          background:
            ch.userProgress.status === "completed"
              ? "var(--color-sage-100)"
              : ch.userProgress.status === "started"
                ? "var(--color-lavender-100)"
                : "var(--color-warm-100)",
          color:
            ch.userProgress.status === "completed"
              ? "var(--color-sage-700)"
              : ch.userProgress.status === "started"
                ? "var(--color-lavender-700)"
                : "var(--color-warm-500)",
        }}
        aria-hidden
      >
        {/* Reading status, not a chapter number. `ch.n` is the platform order —
            on a book whose first unit is front matter it is one ahead of the
            editorial number, so printing it here told the reader «2» about the
            chapter the book calls its first. The real number, when the book
            declares one, is the eyebrow below. See `book-structure.ts`. */}
        {ch.userProgress.status === "completed"
          ? "✓"
          : ch.userProgress.status === "started"
            ? "◍"
            : "·"}
      </span>
      <div className="min-w-0">
        {label ? (
          <div
            className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-lavender-700)" }}
          >
            {label}
          </div>
        ) : null}
        <div
          className="truncate text-[13.5px] font-semibold leading-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {titleOverride ?? ch.title}
        </div>
        <div
          className="mt-0.5 text-[11.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          {ch.durationMinutes ? `${ch.durationMinutes} min` : "Sin duración"}
          {ch.userProgress.status === "started"
            ? ` · ${ch.userProgress.progressPct}% leído`
            : ""}
        </div>
      </div>
      {ch.lockedByTier ? (
        <span
          aria-label="Requiere Pro"
          className="text-[14px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          🔒
        </span>
      ) : ch.userProgress.status === "started" ? (
        <span
          aria-label="En curso"
          className="text-[12px] font-semibold"
          style={{ color: "var(--color-lavender-700)" }}
        >
          Continuar →
        </span>
      ) : (
        <span
          aria-hidden
          className="text-[14px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          →
        </span>
      )}
    </Link>
  );
}
