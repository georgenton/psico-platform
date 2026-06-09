import { apiClient } from "./client";
import type {
  AvailabilitySlot,
  CreateBookingRequest,
  CreateBookingResponse,
  CrisisLogRequest,
  CrisisResponse,
  RetryCheckoutRequest,
  RetryCheckoutResponse,
  SessionFeedbackRequest,
  SessionFeedbackResponse,
  SessionJoinResponse,
  SessionPrepResponse,
  TechnicalReportRequest,
  TechnicalReportResponse,
  TherapistAvailabilityResponse,
  TherapistDetail,
  TherapistFavoriteToggleResponse,
  TherapistListResponse,
  TherapistReviewsResponse,
  TherapyFilters,
  TherapyHubResponse,
  TherapyNotificationsListResponse,
  TherapyPrescriptionItem,
  TherapySessionListItem,
  TherapySessionsListResponse,
  UpdateSessionPrepRequest,
} from "@psico/types";

export const terapiaApi = {
  // ── Public ─────────────────────────────────────────────────────────────
  getCrisis: (country?: string) =>
    apiClient.get<CrisisResponse>(
      `/terapia/crisis${country ? `?country=${encodeURIComponent(country)}` : ""}`,
    ),
  logCrisis: (body: CrisisLogRequest) =>
    apiClient.post<{ ok: true }>("/terapia/crisis/log", body),

  // ── Hub ────────────────────────────────────────────────────────────────
  getHub: () => apiClient.get<TherapyHubResponse>("/terapia/hub"),

  // ── Directorio ─────────────────────────────────────────────────────────
  getFilters: () =>
    apiClient.get<TherapyFilters>("/terapia/therapists/filters"),
  listTherapists: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    const query = qs.toString();
    return apiClient.get<TherapistListResponse>(
      `/terapia/therapists${query ? `?${query}` : ""}`,
    );
  },
  getTherapist: (id: string) =>
    apiClient.get<TherapistDetail>(`/terapia/therapists/${id}`),
  listReviews: (id: string, page = 1, pageSize = 10) =>
    apiClient.get<TherapistReviewsResponse>(
      `/terapia/therapists/${id}/reviews?page=${page}&pageSize=${pageSize}`,
    ),
  toggleFavorite: (id: string) =>
    apiClient.post<TherapistFavoriteToggleResponse>(
      `/terapia/therapists/${id}/favorite`,
      {},
    ),

  // ── Reserva + Pre-sesión ───────────────────────────────────────────────
  getAvailability: (id: string, days = 14) =>
    apiClient.get<TherapistAvailabilityResponse>(
      `/terapia/therapists/${id}/availability?days=${days}`,
    ),
  createBooking: (body: CreateBookingRequest) =>
    apiClient.post<CreateBookingResponse>("/terapia/bookings", body),
  retryCheckout: (sessionId: string, body: RetryCheckoutRequest) =>
    apiClient.post<RetryCheckoutResponse>(
      `/terapia/bookings/${sessionId}/retry-checkout`,
      body,
    ),
  getSessionPrep: (sessionId: string) =>
    apiClient.get<SessionPrepResponse>(`/terapia/sessions/${sessionId}/prep`),
  updateSessionPrep: (sessionId: string, body: UpdateSessionPrepRequest) =>
    apiClient.patch<SessionPrepResponse>(
      `/terapia/sessions/${sessionId}/prep`,
      body,
    ),

  // ── Sala + Post-sesión + Technical ─────────────────────────────────────
  joinSession: (sessionId: string) =>
    apiClient.post<SessionJoinResponse>(
      `/terapia/sessions/${sessionId}/join`,
      {},
    ),
  submitFeedback: (sessionId: string, body: SessionFeedbackRequest) =>
    apiClient.post<SessionFeedbackResponse>(
      `/terapia/sessions/${sessionId}/feedback`,
      body,
    ),
  reportTechnical: (sessionId: string, body: TechnicalReportRequest) =>
    apiClient.post<TechnicalReportResponse>(
      `/terapia/sessions/${sessionId}/technical-report`,
      body,
    ),

  // ── Lifecycle ──────────────────────────────────────────────────────────
  listSessions: (status?: "upcoming" | "past" | "all") =>
    apiClient.get<TherapySessionsListResponse>(
      `/terapia/sessions${status ? `?status=${status}` : ""}`,
    ),
  listPrescriptions: () =>
    apiClient.get<TherapyPrescriptionItem[]>("/terapia/prescriptions"),
  updatePrescription: (id: string, completed: boolean) =>
    apiClient.patch<TherapyPrescriptionItem>(
      `/terapia/prescriptions/${id}`,
      { completed },
    ),
  listNotifications: (unread?: boolean, limit = 20) => {
    const qs = new URLSearchParams();
    if (unread !== undefined) qs.set("unread", String(unread));
    qs.set("limit", String(limit));
    return apiClient.get<TherapyNotificationsListResponse>(
      `/terapia/notifications?${qs.toString()}`,
    );
  },
  markNotificationRead: (id: string) =>
    apiClient.patch<{ ok: true }>(`/terapia/notifications/${id}/read`, {}),
  markAllNotificationsRead: () =>
    apiClient.post<{ ok: true; updated: number }>(
      "/terapia/notifications/read-all",
      {},
    ),
  rescheduleSession: (sessionId: string, newSlotIso: string) =>
    apiClient.patch<TherapySessionListItem>(
      `/terapia/sessions/${sessionId}/reschedule`,
      { newSlotIso },
    ),
  cancelSession: (
    sessionId: string,
    reason: string,
    refundRequested = false,
  ) =>
    apiClient.post<{ ok: true; cancelledAt: string }>(
      `/terapia/sessions/${sessionId}/cancel`,
      { reason, refundRequested },
    ),
};

export type AvailabilitySlotItem = AvailabilitySlot;
