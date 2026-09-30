/**
 * Which commit this process is running, asked of the platform rather than of one
 * vendor's variable.
 *
 * It lived inside `emotional-map/cache-identity.ts` because that is where it was
 * first needed, and that made it awkward: the CC-6F backfill CLI wants the SHA to
 * record which commit to roll back to, and importing it from the emotional map
 * would have coupled the marks code path to a subsystem it must stay clear of
 * (the CC-6C invariant, which caught exactly that). A build identity is not an
 * emotional-map concern, so it lives here and the map re-exports it.
 *
 * The order is deliberate: the platform that is serving today comes first, and
 * each entry is a documented variable of the platform it names. ADR 0024 keeps
 * Railway listed while Railway stays up as rollback.
 */
export function releaseSha(): string | null {
  const raw =
    // Railway.
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    // Coolify injects SOURCE_COMMIT into the build and the container.
    process.env.SOURCE_COMMIT ??
    // Ours, for a platform that offers nothing: set it from the build.
    process.env.RELEASE_SHA ??
    process.env.GIT_COMMIT_SHA ??
    // Heroku-style builders.
    process.env.SOURCE_VERSION;
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  // A commit SHA is public information; we still truncate it for log hygiene.
  return trimmed.slice(0, 12);
}
