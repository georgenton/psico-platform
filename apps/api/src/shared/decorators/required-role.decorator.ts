import { SetMetadata } from "@nestjs/common";

export const REQUIRED_ROLE_KEY = "requiredRole";

/**
 * Declares a role required to call a handler. Enforced by `RolesGuard`.
 *
 * Available roles (from Prisma `Role` enum): USER, PSYCHOLOGIST, ADMIN.
 * Will expand to AUTHOR / THERAPIST in Phase 3 (B2B) per ADR 0011.
 *
 * Example:
 * ```ts
 * @Post("ingest/:bookId")
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @RequiredRole("ADMIN")
 * ingestBook(...) { ... }
 * ```
 */
export const RequiredRole = (role: string) =>
  SetMetadata(REQUIRED_ROLE_KEY, role);
