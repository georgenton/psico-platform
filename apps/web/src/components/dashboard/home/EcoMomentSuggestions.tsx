"use client";

import { useRouter } from "next/navigation";
import type { EcoSuggestion } from "@psico/types";
import { setEcoReaderHandoff } from "@/lib/eco/reader-handoff";

/**
 * EcoMomentSuggestions — the adaptive openers on the Home Eco card.
 *
 * Server-rendered `InicioV2` passes the top suggestions down; this small
 * client component turns each into a tappable chip. Picking one stashes the
 * opener (and scope) in the reader→Eco handoff and navigates to Eco, where
 * EcoShell seeds the composer. Nothing is sent automatically.
 */
export function EcoMomentSuggestions({
  suggestions,
}: {
  suggestions: EcoSuggestion[];
}) {
  const router = useRouter();
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {suggestions.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => {
            setEcoReaderHandoff(
              s.prompt,
              s.scope
                ? {
                    bookSlug: s.scope.bookSlug,
                    chapterOrder: s.scope.chapterOrder,
                    kind: "topic",
                  }
                : undefined,
              s.scope ?? undefined,
            );
            router.push("/dashboard/eco");
          }}
          className="er-suggestion"
        >
          <span className="ers-title">{s.title}</span>
          <span className="ers-reason">{s.reason}</span>
        </button>
      ))}
    </div>
  );
}
