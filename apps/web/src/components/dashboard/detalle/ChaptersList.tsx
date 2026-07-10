import Link from "next/link";
import type { ChapterListItem } from "@psico/types";

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
 * Chapters are grouped by book part (e.g. "PARTE I · Deconstruyendo lo que
 * sabíamos") when the book defines them; otherwise a single flat list. Each
 * row shows the chapter number, title, duration, and user status; locked-by-
 * tier rows show a padlock but still navigate (to the paywall flow).
 *
 * Sprint S6-front: rows are anchors to /lector/:order.
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
                  <Link
                    href={`/dashboard/biblioteca/${bookSlug}/lector/${ch.n}`}
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
                      {ch.userProgress.status === "completed" ? "✓" : ch.n}
                    </span>
                    <div className="min-w-0">
                      <div
                        className="truncate text-[13.5px] font-semibold leading-tight"
                        style={{ color: "var(--color-warm-900)" }}
                      >
                        {ch.title}
                      </div>
                      <div
                        className="mt-0.5 text-[11.5px]"
                        style={{ color: "var(--color-warm-500)" }}
                      >
                        {ch.durationMinutes
                          ? `${ch.durationMinutes} min`
                          : "Sin duración"}
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
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
