import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma";
import type {
  AvailabilitySlot,
  CreateBookingRequest,
  CreateBookingResponse,
  CrisisResponse,
  CrisisTrigger,
  SessionPrepResponse,
  TherapistAvailabilityResponse,
  TherapistDetail,
  TherapistListItem,
  TherapistListResponse,
  TherapistReviewsResponse,
  TherapistSummary,
  TherapyFilters,
  TherapyHubResponse,
  UpdateSessionPrepRequest,
} from "@psico/types";
import { getCrisisFor } from "./crisis-catalog";

type SortKey = "rating" | "price-asc" | "price-desc" | "popular";

interface TherapistFilterParams {
  motivo?: string;
  modalidad?: "INDIVIDUAL" | "COUPLE" | "FAMILY";
  genero?: string;
  language?: string;
  priceMin?: number;
  priceMax?: number;
}

@Injectable()
export class TerapiaService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Crisis (Sprint S62) ─────────────────────────────────────────────────

  getCrisis(countryCode: string | undefined): CrisisResponse {
    return getCrisisFor(countryCode);
  }

  async logCrisis(
    userId: string | null,
    trigger: CrisisTrigger,
    contactedLineId: string | undefined,
    country: string | undefined,
  ): Promise<{ ok: true }> {
    await this.prisma.crisisLog.create({
      data: { userId, trigger, contactedLineId, country },
    });
    return { ok: true };
  }

  // ── Hub (Sprint S62) ────────────────────────────────────────────────────

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

  // ── Directorio (Sprint S63) ─────────────────────────────────────────────

  /**
   * GET /api/terapia/therapists — paginado + filtros + sort.
   *
   * Devuelve solo therapists `isActive=true`. `isFavorite` se computa
   * por user al final con una sola query agregada.
   *
   * `nextSlotIso` queda null en este sprint — se llena en S64 cuando se
   * proyecten los TherapistAvailability sobre los próximos 14 días.
   */
  async listTherapists(
    userId: string,
    params: TherapistFilterParams & {
      sort?: SortKey;
      page?: number;
      pageSize?: number;
    },
  ): Promise<TherapistListResponse> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const where = this.buildTherapistWhere(params);
    const orderBy = this.buildOrderBy(params.sort);

    const [items, total, favorites] = await Promise.all([
      this.prisma.therapist.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.therapist.count({ where }),
      this.prisma.therapistFavorite.findMany({
        where: { userId },
        select: { therapistId: true },
      }),
    ]);

    const favoriteSet = new Set(favorites.map((f) => f.therapistId));

    return {
      items: items.map((t) => this.toListItem(t, favoriteSet.has(t.id))),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * GET /api/terapia/therapists/filters — opciones de filtros con conteos.
   *
   * Counts se computan sobre therapists activos. Los catálogos vacíos
   * (no aparecen specialties en BD) se omiten; el frontend renderiza
   * solo lo que llega.
   */
  async getFilters(): Promise<TherapyFilters> {
    const all = await this.prisma.therapist.findMany({
      where: { isActive: true },
      select: {
        specialties: true,
        modalities: true,
        genderId: true,
        languages: true,
        priceUsd: true,
        currency: true,
      },
    });

    // Counts categóricos en aplicación porque PostgreSQL no agrega arrays
    // de string nativamente sin unnest + group by.
    const motivoCount = new Map<string, number>();
    const modalidadCount = new Map<string, number>();
    const generoCount = new Map<string, number>();
    const languageCount = new Map<string, number>();
    let priceMin = Number.POSITIVE_INFINITY;
    let priceMax = 0;
    let currency = "USD";

    for (const t of all) {
      for (const s of t.specialties)
        motivoCount.set(s, (motivoCount.get(s) ?? 0) + 1);
      for (const m of t.modalities)
        modalidadCount.set(m, (modalidadCount.get(m) ?? 0) + 1);
      if (t.genderId)
        generoCount.set(t.genderId, (generoCount.get(t.genderId) ?? 0) + 1);
      for (const lang of t.languages)
        languageCount.set(lang, (languageCount.get(lang) ?? 0) + 1);
      if (t.priceUsd < priceMin) priceMin = t.priceUsd;
      if (t.priceUsd > priceMax) priceMax = t.priceUsd;
      currency = t.currency;
    }

    if (priceMin === Number.POSITIVE_INFINITY) priceMin = 0;

    return {
      motivo: Array.from(motivoCount.entries())
        .map(([id, count]) => ({ id, label: id, count }))
        .sort((a, b) => b.count - a.count),
      modalidad: Array.from(modalidadCount.entries()).map(([id, count]) => ({
        id: id as "INDIVIDUAL" | "COUPLE" | "FAMILY",
        label: id,
        count,
      })),
      genero: Array.from(generoCount.entries()).map(([id, count]) => ({
        id,
        label: id,
        count,
      })),
      precio: { min: priceMin, max: priceMax, currency },
      language: Array.from(languageCount.entries()).map(([id, count]) => ({
        id,
        label: id,
        count,
      })),
    };
  }

  /**
   * GET /api/terapia/therapists/:id — detalle.
   */
  async getTherapist(
    userId: string,
    therapistId: string,
  ): Promise<TherapistDetail> {
    const [therapist, favorite] = await Promise.all([
      this.prisma.therapist.findUnique({
        where: { id: therapistId },
        include: { availability: { orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }] } },
      }),
      this.prisma.therapistFavorite.findUnique({
        where: { userId_therapistId: { userId, therapistId } },
      }),
    ]);

    if (!therapist || !therapist.isActive) {
      throw new NotFoundException("THERAPIST_NOT_FOUND");
    }

    return {
      ...this.toListItem(therapist, !!favorite),
      bioLong: therapist.bioLong,
      approach: therapist.approach,
      firstSessionPolicy: therapist.firstSessionPolicy,
      cancellationPolicy: therapist.cancellationPolicy,
      videoPresentationUrl: therapist.videoPresentationUrl,
      availability: therapist.availability.map((a) => ({
        dayOfWeek: a.dayOfWeek,
        startMin: a.startMin,
        endMin: a.endMin,
        timezone: a.timezone,
      })),
    };
  }

  /**
   * GET /api/terapia/therapists/:id/reviews — paginado.
   * `userInitials` para anonimizar al reviewer.
   */
  async listReviews(
    therapistId: string,
    page: number,
    pageSize: number,
  ): Promise<TherapistReviewsResponse> {
    // Confirm therapist exists (else 404)
    const exists = await this.prisma.therapist.findUnique({
      where: { id: therapistId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("THERAPIST_NOT_FOUND");

    const [items, total] = await Promise.all([
      this.prisma.therapistReview.findMany({
        where: { therapistId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { firstName: true, name: true } },
        },
      }),
      this.prisma.therapistReview.count({ where: { therapistId } }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        userInitials: this.computeInitials(r.user.firstName ?? r.user.name),
        rating: r.rating,
        text: r.text,
        tags: r.tags,
        createdAt: r.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * POST /api/terapia/therapists/:id/favorite — toggle.
   */
  async toggleFavorite(
    userId: string,
    therapistId: string,
  ): Promise<{ isFavorite: boolean }> {
    const exists = await this.prisma.therapist.findUnique({
      where: { id: therapistId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("THERAPIST_NOT_FOUND");

    const existing = await this.prisma.therapistFavorite.findUnique({
      where: { userId_therapistId: { userId, therapistId } },
    });

    if (existing) {
      await this.prisma.therapistFavorite.delete({
        where: { userId_therapistId: { userId, therapistId } },
      });
      return { isFavorite: false };
    }

    await this.prisma.therapistFavorite.create({
      data: { userId, therapistId },
    });
    return { isFavorite: true };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private buildTherapistWhere(
    params: TherapistFilterParams,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = { isActive: true };
    if (params.motivo) where.specialties = { has: params.motivo };
    if (params.modalidad) where.modalities = { has: params.modalidad };
    if (params.genero) where.genderId = params.genero;
    if (params.language) where.languages = { has: params.language };
    if (params.priceMin !== undefined || params.priceMax !== undefined) {
      where.priceUsd = {
        ...(params.priceMin !== undefined && { gte: params.priceMin }),
        ...(params.priceMax !== undefined && { lte: params.priceMax }),
      };
    }
    return where;
  }

  private buildOrderBy(sort?: SortKey): Record<string, "asc" | "desc">[] {
    switch (sort) {
      case "price-asc":
        return [{ priceUsd: "asc" }, { popularity: "desc" }];
      case "price-desc":
        return [{ priceUsd: "desc" }, { popularity: "desc" }];
      case "popular":
        return [{ popularity: "desc" }, { avgRating: "desc" }];
      case "rating":
      default:
        return [{ avgRating: "desc" }, { popularity: "desc" }];
    }
  }

  private toListItem(
    t: {
      id: string;
      name: string;
      initials: string;
      title: string;
      avatarUrl: string | null;
      coverToken: string;
      licenseNumber: string;
      licenseVerified: boolean;
      bioShort: string;
      specialties: string[];
      modalities: ("INDIVIDUAL" | "COUPLE" | "FAMILY")[];
      languages: string[];
      genderId: string | null;
      priceUsd: number;
      currency: string;
      avgRating: number;
      reviewsCount: number;
      acceptsInsurance: boolean;
    },
    isFavorite: boolean,
  ): TherapistListItem {
    return {
      id: t.id,
      name: t.name,
      initials: t.initials,
      title: t.title,
      avatarUrl: t.avatarUrl,
      coverToken: t.coverToken,
      licenseNumber: t.licenseNumber,
      licenseVerified: t.licenseVerified,
      bioShort: t.bioShort,
      specialties: t.specialties,
      modalities: t.modalities,
      languages: t.languages,
      genderId: t.genderId,
      priceUsd: t.priceUsd,
      currency: t.currency,
      avgRating: t.avgRating,
      reviewsCount: t.reviewsCount,
      nextSlotIso: null, // S64: proyectado desde availability
      acceptsInsurance: t.acceptsInsurance,
      isFavorite,
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

  private computeInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }

  // ── Reserva + Pre-sesión (Sprint S64) ───────────────────────────────────

  /**
   * GET /api/terapia/therapists/:id/availability?days=14
   *
   * Projects the therapist's recurring weekly availability onto the next
   * `days` UTC days starting today, then subtracts slots overlapping with
   * existing SCHEDULED/IN_PROGRESS sessions of that therapist.
   *
   * Slot cadence is 60 min from `startMin` to `endMin - 60`. The booking
   * step picks 30 or 50 min duration; this only declares "you can START
   * a session at iso X".
   */
  async getAvailability(
    therapistId: string,
    days: number,
  ): Promise<TherapistAvailabilityResponse> {
    const therapist = await this.prisma.therapist.findUnique({
      where: { id: therapistId },
      include: { availability: true },
    });
    if (!therapist || !therapist.isActive) {
      throw new NotFoundException("THERAPIST_NOT_FOUND");
    }

    const horizon = new Date();
    const endHorizon = new Date(
      horizon.getTime() + days * 24 * 60 * 60 * 1000,
    );

    const booked = await this.prisma.therapySession.findMany({
      where: {
        therapistId,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        scheduledAt: { gte: horizon, lt: endHorizon },
      },
      select: { scheduledAt: true, durationMin: true },
    });
    const bookedKeys = new Set(
      booked.map((b) => this.slotKey(b.scheduledAt, b.durationMin)),
    );

    const slots: AvailabilitySlot[] = [];
    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const day = new Date(horizon.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dow = day.getUTCDay();
      const todaysSlots = therapist.availability.filter(
        (a) => a.dayOfWeek === dow,
      );
      for (const a of todaysSlots) {
        // Cadence: 60 min from startMin to endMin (inclusive of last full hour)
        for (let m = a.startMin; m + 60 <= a.endMin; m += 60) {
          const slotStart = new Date(
            Date.UTC(
              day.getUTCFullYear(),
              day.getUTCMonth(),
              day.getUTCDate(),
              Math.floor(m / 60),
              m % 60,
            ),
          );
          // Skip past slots
          if (slotStart.getTime() < horizon.getTime()) continue;
          const isAvailable = !bookedKeys.has(this.slotKey(slotStart, 50));
          slots.push({
            iso: slotStart.toISOString(),
            durationMin: 50,
            priceUsd: therapist.priceUsd,
            currency: therapist.currency,
            available: isAvailable,
          });
        }
      }
    }

    slots.sort((a, b) => a.iso.localeCompare(b.iso));

    return {
      therapistId,
      days,
      timezone:
        therapist.availability[0]?.timezone ?? "America/Guayaquil",
      slots,
    };
  }

  /**
   * POST /api/terapia/bookings
   *
   * Creates a TherapySession in SCHEDULED + PENDING. Stripe Checkout
   * wiring lands in S65 — for now the response sends `checkoutUrl: null`
   * + paymentStatus: PENDING. The session row exists so the front can
   * navigate to /sessions/:id/preparar; the therapist sees it as
   * "pendiente de pago" until S65 wires the webhook.
   *
   * Race detection: re-query `findFirst` for an overlapping SCHEDULED
   * session right before insert. Returns 409 with code SLOT_TAKEN.
   */
  async createBooking(
    userId: string,
    req: CreateBookingRequest,
  ): Promise<CreateBookingResponse> {
    const therapist = await this.prisma.therapist.findUnique({
      where: { id: req.therapistId },
    });
    if (!therapist || !therapist.isActive) {
      throw new NotFoundException("THERAPIST_NOT_FOUND");
    }
    if (!therapist.modalities.includes(req.modality)) {
      throw new BadRequestException("MODALITY_NOT_OFFERED");
    }

    const slot = new Date(req.slotIso);
    if (isNaN(slot.getTime())) {
      throw new BadRequestException("INVALID_SLOT");
    }
    if (slot.getTime() < Date.now()) {
      throw new BadRequestException("SLOT_IN_THE_PAST");
    }

    const durationMin = req.durationMin ?? 50;

    // Race detection
    const collision = await this.prisma.therapySession.findFirst({
      where: {
        therapistId: req.therapistId,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        scheduledAt: slot,
      },
      select: { id: true },
    });
    if (collision) {
      throw new ConflictException("SLOT_TAKEN");
    }

    const created = await this.prisma.therapySession.create({
      data: {
        userId,
        therapistId: req.therapistId,
        scheduledAt: slot,
        durationMin,
        modality: req.modality,
        status: "SCHEDULED",
        paymentStatus: "PENDING",
        priceUsd: therapist.priceUsd,
        currency: therapist.currency,
        firstReasonId: req.firstReasonId,
      },
    });

    return {
      sessionId: created.id,
      paymentStatus: created.paymentStatus,
      // S65 wires Stripe Checkout. For now the front sees null and shows
      // a "pendiente de pago" badge.
      checkoutUrl: null,
      scheduledAt: created.scheduledAt.toISOString(),
    };
  }

  /**
   * GET /api/terapia/sessions/:id/prep — only the owner can read.
   * `joinUrl` stays null until S65 wires Daily.co token issuance.
   */
  async getSessionPrep(
    userId: string,
    sessionId: string,
  ): Promise<SessionPrepResponse> {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
      include: { therapist: true },
    });
    if (!session) throw new NotFoundException("SESSION_NOT_FOUND");
    if (session.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_SESSION");
    }

    return {
      session: {
        id: session.id,
        therapist: this.toTherapistSummary(session.therapist),
        scheduledAt: session.scheduledAt.toISOString(),
        durationMin: session.durationMin,
        modality: session.modality,
        joinUrl: null,
        paymentStatus: session.paymentStatus,
      },
      prep: {
        intentionCiphertext: session.intentionCiphertext,
        intentionNonce: session.intentionNonce,
        checkInMood: session.checkInMood,
        sharedEntryIds: session.sharedEntryIds,
      },
    };
  }

  /**
   * PATCH /api/terapia/sessions/:id/prep — owner only.
   * Pairing: (intentionCiphertext, intentionNonce) must travel together.
   */
  async updateSessionPrep(
    userId: string,
    sessionId: string,
    body: UpdateSessionPrepRequest,
  ): Promise<SessionPrepResponse> {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true },
    });
    if (!session) throw new NotFoundException("SESSION_NOT_FOUND");
    if (session.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_SESSION");
    }
    if (session.status !== "SCHEDULED") {
      throw new BadRequestException("PREP_LOCKED");
    }

    // Pairing enforcement (ADR 0007 §C)
    const ctextProvided = body.intentionCiphertext !== undefined;
    const nonceProvided = body.intentionNonce !== undefined;
    if (ctextProvided !== nonceProvided) {
      throw new BadRequestException("CIPHER_NONCE_PAIRING");
    }

    const data: Record<string, unknown> = {};
    if (body.intentionCiphertext !== undefined) {
      data.intentionCiphertext = body.intentionCiphertext || null;
      data.intentionNonce = body.intentionNonce || null;
    }
    if (body.checkInMood !== undefined) data.checkInMood = body.checkInMood;
    if (body.sharedEntryIds !== undefined)
      data.sharedEntryIds = body.sharedEntryIds;

    await this.prisma.therapySession.update({
      where: { id: sessionId },
      data,
    });

    return this.getSessionPrep(userId, sessionId);
  }

  private slotKey(date: Date, durationMin: number): string {
    return `${date.toISOString()}::${durationMin}`;
  }
}
