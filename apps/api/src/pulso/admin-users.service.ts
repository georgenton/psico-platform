import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { revokeAllUserSessions } from "../auth/session-revocation";
import type { Role } from "@prisma/client";

const VALID_ROLES = ["USER", "AUTHOR", "PSYCHOLOGIST", "ADMIN"] as const;
type RoleT = (typeof VALID_ROLES)[number];

/**
 * AdminUsersService — Sprint S72.
 *
 * Ops surface (ADMIN) para buscar usuarios y cambiar su rol sin necesidad
 * de `railway login` + SQL. Cada cambio queda en `RoleChangeLog` para que
 * Pulso pueda responder "quién promovió a quién y cuándo".
 *
 * Reglas de promoción:
 *   - Cualquier admin puede promover/demotar a cualquier rol.
 *   - Un admin NO puede degradarse a sí mismo (evita lock-out accidental).
 *   - Cambiar a "USER" cuando el target ya era USER es noop (no log).
 *   - Recent log queda visible junto al user para audit rápido.
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger("AdminUsersService");

  constructor(private readonly prisma: PrismaService) {}

  // ── List / search ────────────────────────────────────────────────────────

  async listUsers(params: { q?: string; role?: RoleT; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const q = params.q?.trim();

    const where: Record<string, unknown> = {};
    if (params.role) where.role = params.role;
    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }

    const items = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        role: true,
        plan: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    return {
      total: items.length,
      items,
    };
  }

  // ── Recent role changes per user ─────────────────────────────────────────

  async getRecentRoleChanges(targetUserId: string) {
    return this.prisma.roleChangeLog.findMany({
      where: { targetUserId },
      orderBy: { changedAt: "desc" },
      take: 20,
    });
  }

  // ── Change role ──────────────────────────────────────────────────────────

  async changeRole(
    targetUserId: string,
    adminUserId: string,
    nextRole: RoleT,
    reason: string | undefined,
  ) {
    if (!VALID_ROLES.includes(nextRole)) {
      throw new BadRequestException("INVALID_ROLE");
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, email: true },
    });
    if (!target) throw new NotFoundException("USER_NOT_FOUND");

    // Hard guard: no self-demotion to avoid lock-out. Only ADMIN can use
    // this endpoint, so if target === admin and newRole !== ADMIN, reject.
    if (target.id === adminUserId && nextRole !== "ADMIN") {
      throw new ConflictException({
        code: "CANNOT_DEMOTE_SELF",
        message:
          "Un admin no puede quitarse el rol ADMIN a sí mismo. Pídeselo a otro admin.",
      });
    }

    if (target.role === nextRole) {
      // Idempotent — return the current state without logging.
      return { ok: true as const, role: target.role, changed: false as const };
    }

    const oldRole = target.role as Role;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: { role: nextRole as Role },
      });
      await tx.roleChangeLog.create({
        data: {
          targetUserId,
          oldRole,
          newRole: nextRole as Role,
          changedBy: adminUserId,
          reason: reason ?? null,
        },
      });
      // A role change is a sensitive privilege shift: cut every existing
      // session so the new role is re-minted into fresh tokens (ADR 0015).
      await revokeAllUserSessions(tx, targetUserId);
    });

    this.logger.log(
      `[admin-users] role change target=${targetUserId} ${oldRole} → ${nextRole} by admin=${adminUserId}`,
    );

    return {
      ok: true as const,
      role: nextRole,
      changed: true as const,
      oldRole,
    };
  }
}
