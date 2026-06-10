import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma";
import { PaymentService } from "../subscription";
import { VIDEO_PROVIDER } from "./tokens";
import type { IVideoProvider } from "./providers/video-provider.interface";
import type {
  AvailabilitySlot,
  CreateBookingRequest,
  CreateBookingResponse,
  CrisisResponse,
  CrisisTrigger,
  RetryCheckoutResponse,
  SessionFeedbackRequest,
  SessionFeedbackResponse,
  SessionJoinResponse,
  SessionPrepResponse,
  TechnicalReportRequest,
  TechnicalReportResponse,
  TherapistAvailabilityResponse,
  TherapistDetail,
  TherapistListItem,
  TherapistListResponse,
  TherapistReviewsResponse,
  TherapistSummary,
  TherapyFilters,
  TherapyHubResponse,
  TherapyNotificationItem,
  TherapyNotificationsListResponse,
  TherapyPrescriptionItem,
  TherapySessionListItem,
  TherapySessionsListResponse,
  TherapyTechnicalIssue,
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(VIDEO_PROVIDER) private readonly video: IVideoProvider,
    private readonly payments: PaymentService,
  ) {}

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

    // Sprint S66.A — Stripe Checkout one-time. If the front didn't pass
    // successUrl/cancelUrl the booking still exists in PENDING; the front
    // can request a checkout later (deferred-to-S66.B endpoint), or just
    // tell the user the session is reserved pending payment.
    if (!req.successUrl || !req.cancelUrl) {
      return {
        sessionId: created.id,
        paymentStatus: created.paymentStatus,
        checkoutUrl: null,
        scheduledAt: created.scheduledAt.toISOString(),
      };
    }

    try {
      const checkout = await this.payments.createTherapyCheckout({
        userId,
        sessionId: created.id,
        priceUsd: created.priceUsd,
        currency: created.currency,
        productName: `Sesión con ${therapist.name} · ${created.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
        successUrl: req.successUrl,
        cancelUrl: req.cancelUrl,
      });
      await this.prisma.therapySession.update({
        where: { id: created.id },
        data: { stripeCheckoutSessionId: checkout.stripeCheckoutSessionId },
      });
      return {
        sessionId: created.id,
        paymentStatus: created.paymentStatus,
        checkoutUrl: checkout.url,
        scheduledAt: created.scheduledAt.toISOString(),
      };
    } catch (err) {
      // Checkout failed — return the session anyway so the user sees their
      // reservation. They can retry the checkout via a follow-up endpoint
      // (S66.B). Cancel sweeper deals with abandoned PENDING rows.
      return {
        sessionId: created.id,
        paymentStatus: created.paymentStatus,
        checkoutUrl: null,
        scheduledAt: created.scheduledAt.toISOString(),
      };
    }
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
        status: session.status,
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

  // ── Lifecycle (Sprint S66.B) ────────────────────────────────────────────

  /**
   * GET /api/terapia/sessions?status=upcoming|past|all
   *
   * Devuelve siempre el envelope {upcoming, past}. El filtro `status`
   * solo limita qué bucket se popula — el otro queda vacío. Esto le
   * permite al front renderizar dos tabs sin segundo round-trip.
   */
  async listSessions(
    userId: string,
    status: "upcoming" | "past" | "all" = "all",
  ): Promise<TherapySessionsListResponse> {
    const now = new Date();
    const upcomingWhere = {
      userId,
      status: { in: ["SCHEDULED", "IN_PROGRESS"] as ("SCHEDULED" | "IN_PROGRESS")[] },
      scheduledAt: { gte: now },
    };
    const pastWhere = {
      userId,
      OR: [
        { status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW", "MISSED"] as ("COMPLETED" | "CANCELLED" | "NO_SHOW" | "MISSED")[] } },
        { scheduledAt: { lt: now } },
      ],
    };

    const upcomingPromise =
      status === "past"
        ? null
        : this.prisma.therapySession.findMany({
            where: upcomingWhere,
            orderBy: { scheduledAt: "asc" },
            include: { therapist: true },
            take: 20,
          });
    const pastPromise =
      status === "upcoming"
        ? null
        : this.prisma.therapySession.findMany({
            where: pastWhere,
            orderBy: { scheduledAt: "desc" },
            include: { therapist: true },
            take: 30,
          });

    const upcoming = upcomingPromise ? await upcomingPromise : [];
    const past = pastPromise ? await pastPromise : [];

    return {
      upcoming: upcoming.map((s) => this.toSessionListItem(s)),
      past: past.map((s) => this.toSessionListItem(s)),
    };
  }

  /**
   * GET /api/terapia/prescriptions
   */
  async listPrescriptions(userId: string): Promise<TherapyPrescriptionItem[]> {
    const items = await this.prisma.therapyPrescription.findMany({
      where: { userId },
      orderBy: [
        // Active (uncompleted) primero. Among them, due-soon first.
        { completedAt: "asc" },
        { dueBy: "asc" },
        { createdAt: "desc" },
      ],
      take: 50,
    });
    return items.map((p) => ({
      id: p.id,
      kind: p.kind,
      targetId: p.targetId,
      dosage: p.dosage,
      note: p.note,
      dueBy: p.dueBy?.toISOString() ?? null,
      completedAt: p.completedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      sessionId: p.sessionId,
    }));
  }

  /**
   * PATCH /api/terapia/prescriptions/:id { completed: true|false }
   */
  async updatePrescription(
    userId: string,
    prescriptionId: string,
    completed: boolean | undefined,
  ): Promise<TherapyPrescriptionItem> {
    const existing = await this.prisma.therapyPrescription.findUnique({
      where: { id: prescriptionId },
      select: { id: true, userId: true },
    });
    if (!existing) throw new NotFoundException("PRESCRIPTION_NOT_FOUND");
    if (existing.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_PRESCRIPTION");
    }

    const updated = await this.prisma.therapyPrescription.update({
      where: { id: prescriptionId },
      data: {
        completedAt: completed ? new Date() : completed === false ? null : undefined,
      },
    });

    return {
      id: updated.id,
      kind: updated.kind,
      targetId: updated.targetId,
      dosage: updated.dosage,
      note: updated.note,
      dueBy: updated.dueBy?.toISOString() ?? null,
      completedAt: updated.completedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      sessionId: updated.sessionId,
    };
  }

  /**
   * GET /api/terapia/notifications?unread=true&limit=20
   */
  async listNotifications(
    userId: string,
    unread: boolean | undefined,
    limit: number,
  ): Promise<TherapyNotificationsListResponse> {
    const where: Record<string, unknown> = { userId };
    if (unread) where.readAt = null;

    const [items, unreadCount] = await Promise.all([
      this.prisma.therapyNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.therapyNotification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      items: items.map((n): TherapyNotificationItem => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        actionUrl: n.actionUrl,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
        sessionId: n.sessionId,
      })),
      unreadCount,
    };
  }

  /**
   * PATCH /api/terapia/notifications/:id/read — idempotent.
   */
  async markNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<{ ok: true }> {
    const existing = await this.prisma.therapyNotification.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true },
    });
    if (!existing) throw new NotFoundException("NOTIFICATION_NOT_FOUND");
    if (existing.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_NOTIFICATION");
    }
    await this.prisma.therapyNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * POST /api/terapia/notifications/read-all
   */
  async markAllNotificationsRead(
    userId: string,
  ): Promise<{ ok: true; updated: number }> {
    const res = await this.prisma.therapyNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: res.count };
  }

  /**
   * PATCH /api/terapia/sessions/:id/reschedule
   *
   * Lifecycle constraint: solo SCHEDULED sessions y solo si el nuevo slot
   * está vacío en el calendario del terapeuta. Auditado vía
   * `rescheduledFromId` que apunta al row original.
   */
  async rescheduleSession(
    userId: string,
    sessionId: string,
    newSlotIso: string,
  ): Promise<TherapySessionListItem> {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
      include: { therapist: true },
    });
    if (!session) throw new NotFoundException("SESSION_NOT_FOUND");
    if (session.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_SESSION");
    }
    if (session.status !== "SCHEDULED") {
      throw new BadRequestException("RESCHEDULE_NOT_ALLOWED");
    }
    const newSlot = new Date(newSlotIso);
    if (isNaN(newSlot.getTime()) || newSlot.getTime() < Date.now()) {
      throw new BadRequestException("INVALID_SLOT");
    }

    const collision = await this.prisma.therapySession.findFirst({
      where: {
        therapistId: session.therapistId,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        scheduledAt: newSlot,
        id: { not: sessionId },
      },
      select: { id: true },
    });
    if (collision) throw new ConflictException("SLOT_TAKEN");

    const updated = await this.prisma.therapySession.update({
      where: { id: sessionId },
      data: {
        scheduledAt: newSlot,
        roomUrl: null, // Force re-creation in the new window
        roomCreatedAt: null,
      },
      include: { therapist: true },
    });
    return this.toSessionListItem(updated);
  }

  /**
   * POST /api/terapia/sessions/:id/cancel
   *
   * Mark CANCELLED + persists reason + refundRequested. Refund flow real
   * (Stripe refunds.create) llega cuando ops valide policy de cada
   * terapeuta — por ahora el flag queda como pedido al ops.
   */
  async cancelSession(
    userId: string,
    sessionId: string,
    reason: string,
    refundRequested: boolean | undefined,
  ): Promise<{ ok: true; cancelledAt: string }> {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true, scheduledAt: true },
    });
    if (!session) throw new NotFoundException("SESSION_NOT_FOUND");
    if (session.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_SESSION");
    }
    if (session.status !== "SCHEDULED") {
      throw new BadRequestException("CANCEL_NOT_ALLOWED");
    }

    const now = new Date();
    await this.prisma.therapySession.update({
      where: { id: sessionId },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: refundRequested
          ? `${reason} [REFUND_REQUESTED]`
          : reason,
      },
    });
    return { ok: true, cancelledAt: now.toISOString() };
  }

  /**
   * POST /api/terapia/bookings/:id/retry-checkout
   *
   * Issues a fresh Stripe Checkout for a PENDING session. Útil cuando la
   * llamada inicial a Stripe falló en createBooking, o cuando el user
   * cerró Checkout sin pagar y quiere re-intentar.
   */
  async retryCheckout(
    userId: string,
    sessionId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<RetryCheckoutResponse> {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
      include: { therapist: true },
    });
    if (!session) throw new NotFoundException("SESSION_NOT_FOUND");
    if (session.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_SESSION");
    }
    if (session.paymentStatus !== "PENDING") {
      throw new BadRequestException("CHECKOUT_NOT_RETRYABLE");
    }
    if (session.status !== "SCHEDULED") {
      throw new BadRequestException("CHECKOUT_NOT_RETRYABLE");
    }

    const checkout = await this.payments.createTherapyCheckout({
      userId,
      sessionId: session.id,
      priceUsd: session.priceUsd,
      currency: session.currency,
      productName: `Sesión con ${session.therapist.name} · ${session.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      successUrl,
      cancelUrl,
    });
    await this.prisma.therapySession.update({
      where: { id: session.id },
      data: { stripeCheckoutSessionId: checkout.stripeCheckoutSessionId },
    });
    return {
      sessionId: session.id,
      checkoutUrl: checkout.url,
      paymentStatus: session.paymentStatus,
    };
  }

  private toSessionListItem(s: {
    id: string;
    therapist: {
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
    };
    scheduledAt: Date;
    durationMin: number;
    modality: "INDIVIDUAL" | "COUPLE" | "FAMILY";
    status:
      | "SCHEDULED"
      | "IN_PROGRESS"
      | "COMPLETED"
      | "CANCELLED"
      | "NO_SHOW"
      | "MISSED";
    paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
    feedbackRating: number | null;
  }): TherapySessionListItem {
    return {
      id: s.id,
      therapist: this.toTherapistSummary(s.therapist),
      scheduledAt: s.scheduledAt.toISOString(),
      durationMin: s.durationMin,
      modality: s.modality,
      status: s.status,
      paymentStatus: s.paymentStatus,
      feedbackRating: s.feedbackRating,
    };
  }

  // ── Sala video + Post-sesión + Technical report (Sprint S65) ────────────

  /**
   * POST /api/terapia/sessions/:id/join — emite token de sala.
   *
   * Window check: solo dentro de `[scheduledAt - 5min, scheduledAt + duration + 15min]`.
   * Outside → 400 SESSION_WINDOW_CLOSED. Lazy-creates the room if it
   * doesn't exist yet. Token expires en 2h.
   *
   * Owner gate: solo el dueño (paciente) puede pedir su propio token.
   * Cuando aterrice el panel del terapeuta (S19+ Author B2B) se relaja
   * para que el therapist también lo pueda pedir como owner.
   */
  async joinSession(
    userId: string,
    sessionId: string,
    userDisplayName: string,
  ): Promise<SessionJoinResponse> {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException("SESSION_NOT_FOUND");
    if (session.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_SESSION");
    }

    const now = Date.now();
    const start = session.scheduledAt.getTime();
    const end = start + session.durationMin * 60 * 1000;
    const earlyWindow = 5 * 60 * 1000;
    const lateWindow = 15 * 60 * 1000;
    if (now < start - earlyWindow || now > end + lateWindow) {
      throw new BadRequestException("SESSION_WINDOW_CLOSED");
    }

    // Lazy-create room
    let roomUrl = session.roomUrl;
    if (!roomUrl) {
      const room = await this.video.createRoom({
        sessionId,
        expiresInSec: Math.ceil((end + lateWindow - now) / 1000),
      });
      roomUrl = room.roomUrl;
      await this.prisma.therapySession.update({
        where: { id: sessionId },
        data: { roomUrl, roomCreatedAt: new Date() },
      });
    }

    const token = await this.video.createJoinToken({
      roomUrl,
      userName: userDisplayName,
      isOwner: false,
      expiresInSec: 7200,
    });

    return {
      joinToken: token.joinToken,
      roomUrl,
      expiresAt: token.expiresAt.toISOString(),
      isProviderConfigured: this.video.isConfigured(),
    };
  }

  /**
   * POST /api/terapia/sessions/:id/feedback — owner only.
   *
   * Marks session as COMPLETED + persists rating/tags/note. Idempotent:
   * subsequent calls overwrite the previous feedback (last-write-wins).
   * Pairing on noteCiphertext/nonce enforced.
   */
  async submitFeedback(
    userId: string,
    sessionId: string,
    body: SessionFeedbackRequest,
  ): Promise<SessionFeedbackResponse> {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true },
    });
    if (!session) throw new NotFoundException("SESSION_NOT_FOUND");
    if (session.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_SESSION");
    }
    if (
      session.status !== "IN_PROGRESS" &&
      session.status !== "COMPLETED" &&
      session.status !== "SCHEDULED"
    ) {
      throw new BadRequestException("FEEDBACK_NOT_ALLOWED");
    }

    const ctextProvided = body.noteCiphertext !== undefined;
    const nonceProvided = body.noteNonce !== undefined;
    if (ctextProvided !== nonceProvided) {
      throw new BadRequestException("CIPHER_NONCE_PAIRING");
    }

    await this.prisma.therapySession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        endedAt: new Date(),
        feedbackRating: body.rating,
        feedbackTags: body.tags ?? [],
        feedbackNoteCiphertext: body.noteCiphertext || null,
        feedbackNoteNonce: body.noteNonce || null,
      },
    });

    return { ok: true, status: "COMPLETED" };
  }

  /**
   * POST /api/terapia/sessions/:id/technical-report — owner only.
   *
   * Free of `status` constraint: user can flag a problem AT ANY time
   * (including before the call started, when therapist no-shows).
   */
  async reportTechnical(
    userId: string,
    sessionId: string,
    body: TechnicalReportRequest,
  ): Promise<TechnicalReportResponse> {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });
    if (!session) throw new NotFoundException("SESSION_NOT_FOUND");
    if (session.userId !== userId) {
      throw new ForbiddenException("NOT_YOUR_SESSION");
    }

    const created = await this.prisma.therapyTechnicalReport.create({
      data: {
        sessionId,
        userId,
        issue: body.issue as TherapyTechnicalIssue,
        description: body.description,
      },
    });

    return { id: created.id };
  }
}
