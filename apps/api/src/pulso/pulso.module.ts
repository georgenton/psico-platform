import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { PulsoController } from "./pulso.controller";
import { PulsoService } from "./pulso.service";

/**
 * PulsoModule — Sprint S42.
 *
 * Admin-only back-office. First slice: Eco message reports inbox. The
 * larger Pulso v2 design (`docs/design/pulso/HANDOFF.md`) has 6 views;
 * the rest land in follow-up sprints.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PulsoController],
  providers: [PulsoService],
  exports: [PulsoService],
})
export class PulsoModule {}
