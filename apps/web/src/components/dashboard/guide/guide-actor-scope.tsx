"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * CC-7.5 — the Guide actor scope, provided ONCE by the dashboard layout.
 *
 * The layout already resolves the authenticated user through `/user/me` and
 * derives the opaque `actorScope` server-side. It publishes that scope here so
 * the Guide pages never fetch identity again — they render client mounts that
 * read this context.
 *
 * The value is the OPAQUE scope, never the raw user id. `null` means the
 * authenticated identity could not be resolved this render, and the Guide
 * surface fails closed on it (no recovery read, no START).
 */
const GuideActorScopeContext = createContext<string | null>(null);

export function GuideActorScopeProvider({
  scope,
  children,
}: {
  scope: string | null;
  children: ReactNode;
}) {
  return (
    <GuideActorScopeContext.Provider value={scope}>
      {children}
    </GuideActorScopeContext.Provider>
  );
}

/** The layout-provided opaque scope, or null when it could not be resolved. */
export function useGuideActorScope(): string | null {
  return useContext(GuideActorScopeContext);
}
