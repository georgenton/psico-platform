"use client";

import { useEffect, useState } from "react";
import type { EcoSuggestion, EcoSuggestionsResponse } from "@psico/types";

/**
 * EcoSuggestions — adaptive conversation openers on the standalone Eco screen.
 *
 * Fetches `/eco/suggestions` (rule-based, read-only) and renders them as
 * tappable chips above the chat. Picking one seeds the composer (and, for a
 * chapter-anchored opener, the reading scope) — it never sends automatically,
 * so the user always edits before Eco replies.
 *
 * We fetch client-side with the same explicit apiBase + token the rest of the
 * Eco screen uses (cookies live server-side; the api-client singleton isn't
 * configured on web).
 */
export function EcoSuggestions({
  apiBase,
  token,
  onPick,
}: {
  apiBase: string;
  token: string | null;
  onPick: (suggestion: EcoSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<EcoSuggestion[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/eco/suggestions`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) =>
        res.ok ? (res.json() as Promise<EcoSuggestionsResponse>) : null,
      )
      .then((data) => {
        if (active && data) setSuggestions(data.suggestions);
      })
      .catch(() => {
        // Suggestions are a nicety — a fetch failure just hides the strip.
      });
    return () => {
      active = false;
    };
  }, [apiBase, token]);

  if (suggestions.length === 0) return null;

  return (
    <div className="mb-4">
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-warm-500)" }}
      >
        Para empezar
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-2xl px-4 py-2.5 text-left transition-colors"
            style={{
              background: "var(--color-sage-50)",
              border: "1.5px solid var(--color-sage-200)",
              maxWidth: "20rem",
            }}
          >
            <span
              className="block text-sm font-semibold"
              style={{ color: "var(--color-sage-700)" }}
            >
              {s.title}
            </span>
            <span
              className="mt-0.5 block text-xs"
              style={{ color: "var(--color-warm-500)" }}
            >
              {s.reason}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
