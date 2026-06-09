import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { TerapiaController } from "./terapia.controller";
import { TerapiaService } from "./terapia.service";

/**
 * Terapia module — Sprint S62 (boundary v1: Crisis + Hub).
 *
 * Sprint S62 ships endpoints públicos (crisis) + Hub para usuarios
 * autenticados. Las pantallas 2–7 del diseño (directorio, perfil,
 * reserva, pre-sesión, mis sesiones, post-sesión) llegan en sprints
 * S63–S66.
 */
@Module({
  imports: [PrismaModule],
  controllers: [TerapiaController],
  providers: [TerapiaService],
  exports: [TerapiaService],
})
export class TerapiaModule {}
