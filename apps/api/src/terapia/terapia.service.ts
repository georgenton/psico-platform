import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma";
import type {
  CrisisResponse,
  CrisisTrigger,
  TherapyHubResponse,
  TherapistSummary,
} from "@psico/types";
import { getCrisisFor } from "./crisis-catalog";

@Injectable()
export class TerapiaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/terapia/crisis — PÚBLICO (sin auth). Devuelve la lista de
   * líneas de crisis para el país pedido o un fallback internacional.
   *
   * Decisión ética del diseño (docs/design/handoff/11-terapia.md §Crisis):
   * "alguien en crisis no debería tener que loguearse para ver el número
   * de la línea local". Por eso este path NO va por JwtAuthGuard.
   */
  getCrisis(countryCode: string | undefined): CrisisResponse {
    return getCrisisFor(countryCode);
  }

  /**
   * POST /api/terapia/crisis/log — opcional. Audita uso del flujo sin
   * contenido sensible. userId es opcional porque el endpoint se llama
   * desde la misma ruta pública; si el cliente está autenticado el
   * interceptor lo agrega; si no, se persiste anónimo.
   */
  async logCrisis(
    userId: string | null,
    trigger: CrisisTrigger,
    contactedLineId: string | undefined,
    country: string | undefined,
  ): Promise<{ ok: true }> {
    await this.prisma.crisisLog.create({
      data: {
        userId,
        trigger,
        contactedLineId,
        country,
      },
    });
    return { ok: true };
  }

  /**
   * GET /api/terapia/hub — landing del usuario. v1 boundary devuelve:
   *  - intro: copy editorial estática hasta que ops la haga editable.
   *  - activeTherapist: la última sesión completada nos dice con quién
   *    trabaja actualmente. null si todavía no tuvo ninguna.
   *  - nextSession: la próxima SCHEDULED del usuario.
   *  - recentPrescriptions: hasta 3 más recientes, completadas o no.
   *
   * Esto cierra la pantalla 1 del design. Las siguientes pantallas
   * (directorio, reserva, etc) aterrizan en sprints siguientes.
   */
  async getHub(userId: string): Promise<TherapyHubResponse> {
    const [lastCompleted, nextSession, prescriptions] = await Promise.all([
      this.prisma.therapySession.findFirst({
        where: { userId, status: "COMPLETED" },
        orderBy: { scheduledAt: "desc" },
        include: { therapist: true },
      }),
      this.prisma.therapySession.findFirst({
        where: {
          userId,
          status: "SCHEDULED",
          scheduledAt: { gte: new Date() },
        },
        orderBy: { scheduledAt: "asc" },
        include: { therapist: true },
      }),
      this.prisma.therapyPrescription.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

    return {
      intro:
        "Aquí encuentras espacios para hablar con un terapeuta cuando lo necesites. Hablar es un acto valiente — empezar es el paso más grande.",
      activeTherapist: lastCompleted
        ? this.toTherapistSummary(lastCompleted.therapist)
        : null,
      nextSession: nextSession
        ? {
            id: nextSession.id,
            therapist: this.toTherapistSummary(nextSession.therapist),
            scheduledAt: nextSession.scheduledAt.toISOString(),
            durationMin: nextSession.durationMin,
            modality: nextSession.modality,
          }
        : null,
      recentPrescriptions: prescriptions.map((p) => ({
        id: p.id,
        kind: p.kind,
        targetId: p.targetId,
        dosage: p.dosage,
        note: p.note,
        dueBy: p.dueBy?.toISOString() ?? null,
        completedAt: p.completedAt?.toISOString() ?? null,
      })),
    };
  }

  private toTherapistSummary(t: {
    id: string;
    name: string;
    initials: string;
    title: string;
    avatarUrl: string | null;
    coverToken: string;
    modalities: ("INDIVIDUAL" | "COUPLE" | "FAMILY")[];
    specialties: string[];
    priceUsd: number;
    currency: string;
    avgRating: number;
    reviewsCount: number;
  }): TherapistSummary {
    return {
      id: t.id,
      name: t.name,
      initials: t.initials,
      title: t.title,
      avatarUrl: t.avatarUrl,
      coverToken: t.coverToken,
      modalities: t.modalities,
      specialties: t.specialties,
      priceUsd: t.priceUsd,
      currency: t.currency,
      avgRating: t.avgRating,
      reviewsCount: t.reviewsCount,
    };
  }
}
