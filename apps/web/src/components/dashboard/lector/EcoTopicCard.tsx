"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ecoChapterPrompt } from "@psico/types";
import { setEcoReaderHandoff } from "@/lib/eco/reader-handoff";

/**
 * EcoTopicCard — Sprint B (Eco contextual).
 *
 * A small, dismissible invitation shown near the top of a chapter, offering a
 * curated topic to explore with Eco (see ECO_CHAPTER_PROMPTS in @psico/types,
 * with a title-based fallback). Tapping it seeds the Eco composer via the
 * reader→Eco handoff and navigates to /dashboard/eco. Discreet by design — it
 * never blocks reading and can be dismissed for the session.
 */
export function EcoTopicCard({
  bookSlug,
  chapterOrder,
  chapterTitle,
}: {
  bookSlug: string;
  chapterOrder: number;
  chapterTitle: string;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const topic = ecoChapterPrompt(bookSlug, chapterOrder, chapterTitle);

  return (
    <aside
      className="mx-auto mb-6 max-w-3xl rounded-2xl border-[1.5px] px-4 py-3"
      style={{
        background: "var(--color-sage-50)",
        borderColor: "var(--color-sage-200)",
      }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-[18px]">
          🌿
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-sage-700)" }}
          >
            Conversa con Eco
          </div>
          <div
            className="mt-0.5 text-[13.5px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {topic.title}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Ocultar sugerencia"
          className="rounded-full px-1.5 text-[15px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          ×
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          setEcoReaderHandoff(topic.prompt, {
            bookSlug,
            chapterOrder,
            kind: "topic",
          });
          router.push("/dashboard/eco");
        }}
        className="mt-2.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold"
        style={{ background: "var(--color-sage-400)", color: "white" }}
      >
        Explorar este tema →
      </button>
    </aside>
  );
}
