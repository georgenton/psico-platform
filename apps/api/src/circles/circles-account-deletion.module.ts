import { Module } from "@nestjs/common";

import { PrismaModule, PrismaService } from "../prisma";
import { CircleActivityRepository } from "./circle-activity.repository";
import { CircleEventRepository } from "./circle-event.repository";
import { CircleParticipantRepository } from "./circle-participant.repository";
import { CirclesAccountDeletionService } from "./circles-account-deletion.service";

/**
 * The smallest module that can end a person's Círculos participation.
 *
 * Deliberately NOT `CirclesModule`. That one carries the controllers, the
 * rollout guards and the AEAD cipher, and the worker needs none of them — a
 * worker that imported it would register three HTTP controllers it will never
 * serve and resolve a cipher it will never use. What deletion needs is Prisma
 * and three repositories.
 *
 * It is also independent of the rollout flag ON PURPOSE. A person who asks for
 * their account to be deleted while Círculos is `off` must still have their
 * membership revoked and their live activities ended — the feature being
 * switched off is not a reason to leave a seat standing.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: CircleActivityRepository,
      useFactory: (prisma: PrismaService) =>
        new CircleActivityRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CircleParticipantRepository,
      useFactory: (prisma: PrismaService) =>
        new CircleParticipantRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CircleEventRepository,
      useFactory: (prisma: PrismaService) => new CircleEventRepository(prisma),
      inject: [PrismaService],
    },
    CirclesAccountDeletionService,
  ],
  exports: [CirclesAccountDeletionService],
})
export class CirclesAccountDeletionModule {}
