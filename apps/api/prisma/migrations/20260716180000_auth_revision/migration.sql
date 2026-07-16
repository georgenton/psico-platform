-- AlterTable: add the auth-revision counter used by the `ar` JWT claim.
-- Additive + NOT NULL DEFAULT 0, so existing rows get revision 0. The deploy
-- forces a one-time global re-login: any access token minted before this
-- release has no `ar` claim and is rejected by JwtStrategy (fail-closed).
ALTER TABLE "User" ADD COLUMN "authRevision" INTEGER NOT NULL DEFAULT 0;
