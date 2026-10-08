/**
 * What it costs to open the recommended book — read defensively.
 *
 * ── Why this is not just `tier === "pro" ? … : …` ──────────────────────────
 *
 * `OnboardingBookRecommendation.tierRequired` is a required field in the API's
 * own contract, and the API does send it. TypeScript therefore makes a binary
 * ternary look exhaustive, and the first version of this screen used one: pro
 * on one side, «Incluido en tu plan» on the other. That reads "free" out of
 * every value that is not the string "pro" — including the two the web can
 * genuinely receive:
 *
 *   · `undefined`, from an API deployed before the field existed. That is not
 *     hypothetical: the promotion order for this change is API first, Web
 *     second, so a Web that is newer than the API is a state the plan
 *     explicitly passes through, and the rollback path revisits it.
 *   · anything else, from a future tier the server learns to emit before this
 *     client learns to render it.
 *
 * In both the binary version tells someone their first book is included in
 * their plan without having been told so. The cost of being wrong is not
 * symmetric: promising free access and then presenting a paywall two minutes
 * into a first session is exactly the surprise the badge exists to prevent,
 * whereas saying "we are confirming this" is merely unglamorous.
 *
 * So the unknown state is modelled here, at the boundary where the value stops
 * being `unknown` and starts being something the interface renders — and the
 * badge and the CTA are derived from the SAME resolution, so they cannot
 * disagree about what the reader is being offered.
 */

/** Resolved access, including the state the wire cannot promise. */
export type BookAccess = "free" | "pro" | "unknown";

/**
 * The recommendation as it ARRIVES, which is not the same thing as the
 * recommendation as the API promises it. `tierRequired` is `unknown` on
 * purpose: it forces every reader of this value through `resolveBookAccess`.
 */
export interface IncomingRecommendation {
  bookId: string;
  title: string;
  author: string;
  cover: "cool" | "warm" | "mixed";
  chapter1Preview: string;
  why: string;
  tierRequired?: unknown;
}

export function resolveBookAccess(raw: unknown): BookAccess {
  if (raw === "free" || raw === "pro") return raw;
  return "unknown";
}

interface AccessCopy {
  /** Badge text. Short, and never a guess dressed up as a fact. */
  badge: string;
  /** Label on the primary button. `{title}` is substituted by the caller. */
  cta: string;
  /** Which palette the badge borrows. */
  tone: "included" | "pro" | "neutral";
}

const COPY: Record<BookAccess, AccessCopy> = {
  free: {
    badge: "Incluido en tu plan",
    cta: 'Empezar a leer "{title}"',
    tone: "included",
  },
  pro: {
    badge: "Incluido en Pro",
    cta: 'Empezar a leer "{title}"',
    tone: "pro",
  },
  // Neutral on both counts. «Continuar con este libro» promises what we can
  // actually deliver — the same destination as the other two — without
  // claiming the book opens, because we do not know that here. The reader
  // finds out on the book's own screen, which is the surface that knows.
  unknown: {
    badge: "Acceso por confirmar",
    cta: "Continuar con este libro",
    tone: "neutral",
  },
};

export function accessCopy(access: BookAccess, title: string): AccessCopy {
  const c = COPY[access];
  return { ...c, cta: c.cta.replace("{title}", title) };
}
