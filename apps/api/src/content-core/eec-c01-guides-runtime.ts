import type { PrismaClient } from "@prisma/client";
import type { PrismaService } from "../prisma";
import { ExperienceAdminService } from "../experience/experience-admin.service";
import type { DraftCreator } from "./eec-c01-guides-apply";

/**
 * Wiring the CLI needs and the domain does not.
 *
 * `ExperienceAdminService` is a Nest provider, but every dependency it takes is
 * either optional with a production default or constructible from the Prisma
 * client. So the CLI builds it directly instead of booting the whole
 * application: a script that starts Nest to create five rows also starts the
 * schedulers, the queues and the HTTP listener, and an operator running
 * `create-drafts` did not ask for any of that.
 *
 * What it does NOT do is bypass the service. Every validation, the reservation,
 * the lineage rule and the "does this pin resolve to this chapter" check run
 * exactly as they do behind the CMS — that is the whole reason for using it
 * rather than writing rows.
 */
export function buildDraftCreator(prisma: PrismaClient): DraftCreator {
  return new ExperienceAdminService(
    prisma as unknown as PrismaService,
  ) as unknown as DraftCreator;
}

export const OPERATOR_NOT_RESOLVED = "EEC_C01_OPERATOR_NOT_RESOLVED";

/**
 * Whose name the draft is created under.
 *
 * `EEC_C01_OPERATOR_USER_ID` when set; otherwise the first ADMIN. Every draft
 * records a real actor because "who created this" is the first question asked
 * of a row nobody remembers — and a synthetic id would answer it with a lie.
 */
export async function resolveOperatorUserId(
  prisma: Pick<PrismaClient, "user">,
): Promise<string> {
  const declared = process.env.EEC_C01_OPERATOR_USER_ID;
  if (declared) {
    const found = await prisma.user.findUnique({
      where: { id: declared },
      select: { id: true },
    });
    if (!found) throw new Error(OPERATOR_NOT_RESOLVED);
    return found.id;
  }
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error(OPERATOR_NOT_RESOLVED);
  return admin.id;
}
