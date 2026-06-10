"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverFetch } from "@/lib/api.server";
import type {
  CreateBookingResponse,
  SessionJoinResponse,
  SessionPrepResponse,
  TherapistFavoriteToggleResponse,
  TherapyModality,
  UpdateSessionPrepRequest,
} from "@psico/types";

/**
 * Toggle de favorito sobre un terapeuta. Revalida el directorio + el detalle.
 */
export async function toggleTherapistFavoriteAction(
  therapistId: string,
): Promise<TherapistFavoriteToggleResponse> {
  const res = await serverFetch<TherapistFavoriteToggleResponse>(
    `/terapia/therapists/${therapistId}/favorite`,
    { method: "POST", body: {} },
  );
  revalidatePath("/dashboard/terapia/terapeutas");
  revalidatePath(`/dashboard/terapia/terapeutas/${therapistId}`);
  return res;
}

/**
 * Cancelar una sesión SCHEDULED.
 */
export async function cancelSessionAction(
  sessionId: string,
  reason: string,
  refundRequested: boolean,
): Promise<{ ok: true; cancelledAt: string }> {
  const res = await serverFetch<{ ok: true; cancelledAt: string }>(
    `/terapia/sessions/${sessionId}/cancel`,
    { method: "POST", body: { reason, refundRequested } },
  );
  revalidatePath("/dashboard/terapia/sesiones");
  revalidatePath(`/dashboard/terapia/sesiones/${sessionId}`);
  return res;
}

/**
 * Resolve absolute origin for Stripe success/cancel URLs.
 * Mirror del helper que vive en actions/subscription.ts.
 */
async function resolveAppOrigin(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit.replace(/\/$/, "");
  }
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  } catch {
    // Server Component context — no headers().
  }
  return "http://localhost:3000";
}

/**
 * Crear booking + redirect a Stripe Checkout.
 *
 * Si Stripe está configurado y la llamada vuelve con `checkoutUrl`, el
 * server action HACE EL REDIRECT al cliente. Si no, redirect a la session
 * en estado pendiente para que el user pueda usar retry-checkout.
 */
export async function createBookingAction(
  therapistId: string,
  slotIso: string,
  modality: TherapyModality,
  firstReasonId: string | undefined,
): Promise<{ error: string } | undefined> {
  const origin = await resolveAppOrigin();
  let res: CreateBookingResponse;
  try {
    res = await serverFetch<CreateBookingResponse>("/terapia/bookings", {
      method: "POST",
      body: {
        therapistId,
        slotIso,
        modality,
        firstReasonId,
        durationMin: 50,
        successUrl: `${origin}/dashboard/terapia/sesiones?paid=true`,
        cancelUrl: `${origin}/dashboard/terapia/terapeutas/${therapistId}`,
      },
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No pudimos crear la reserva. Reintenta.",
    };
  }
  revalidatePath("/dashboard/terapia/sesiones");
  if (res.checkoutUrl) {
    redirect(res.checkoutUrl);
  }
  // Sin checkoutUrl → llevamos al user al detalle de la session pendiente.
  redirect(`/dashboard/terapia/sesiones/${res.sessionId}`);
}

/**
 * Update pre-session (intention cifrada + mood + sharedEntryIds).
 */
export async function updateSessionPrepAction(
  sessionId: string,
  body: UpdateSessionPrepRequest,
): Promise<SessionPrepResponse> {
  const res = await serverFetch<SessionPrepResponse>(
    `/terapia/sessions/${sessionId}/prep`,
    { method: "PATCH", body },
  );
  revalidatePath(`/dashboard/terapia/sesiones/${sessionId}`);
  return res;
}

/**
 * Join — pide token + redirect al roomUrl (en otra tab si está fuera del
 * dominio, mismo tab si está en una sub-ruta nuestra). Por ahora redirect
 * directo; S67.C wrapeará el iframe de Daily.co.
 */
export async function joinSessionAction(
  sessionId: string,
): Promise<{ error?: string; joinUrl?: string }> {
  try {
    const res = await serverFetch<SessionJoinResponse>(
      `/terapia/sessions/${sessionId}/join`,
      { method: "POST", body: {} },
    );
    return { joinUrl: res.roomUrl };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No pudimos abrir la sala. Reintenta.",
    };
  }
}

/**
 * Retry Stripe Checkout para una session PENDING.
 */
export async function retryCheckoutAction(
  sessionId: string,
): Promise<{ error?: string } | undefined> {
  const origin = await resolveAppOrigin();
  try {
    const res = await serverFetch<{ checkoutUrl: string }>(
      `/terapia/bookings/${sessionId}/retry-checkout`,
      {
        method: "POST",
        body: {
          successUrl: `${origin}/dashboard/terapia/sesiones?paid=true`,
          cancelUrl: `${origin}/dashboard/terapia/sesiones/${sessionId}`,
        },
      },
    );
    redirect(res.checkoutUrl);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No pudimos abrir el pago. Reintenta.",
    };
  }
}
