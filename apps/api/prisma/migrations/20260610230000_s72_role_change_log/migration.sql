-- Sprint S72 — Audit del cambio de rol del usuario por admin.

CREATE TABLE "RoleChangeLog" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "oldRole" "Role" NOT NULL,
    "newRole" "Role" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoleChangeLog_targetUserId_changedAt_idx" ON "RoleChangeLog"("targetUserId", "changedAt");
CREATE INDEX "RoleChangeLog_changedBy_changedAt_idx" ON "RoleChangeLog"("changedBy", "changedAt");
