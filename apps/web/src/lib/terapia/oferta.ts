import "server-only";

import type {
  SessionPrepResponse,
  TherapyHistoryPresence,
  TherapyHubResponse,
} from "@psico/types";

import { ApiError } from "@/lib/api";
import { isNextThrow, serverFetch } from "@/lib/api.server";

/**
 * ¿Se ofrece terapia? — lo que la API publica en el hub, obedecido.
 *
 * Toda pantalla de OFERTA (directorio, perfil, reserva) pregunta aquí antes de
 * pedir nada más, y sólo sigue si la respuesta es un sí explícito. Cerrada es
 * también la respuesta cuando la API no contesta o cuando es una anterior que
 * todavía no publica `offer`: la ausencia de un permiso no es un permiso.
 *
 * No es la defensa —esa está en el servidor, que rechaza cada ruta—; es para
 * no enseñar una puerta que no abre.
 */
export interface OfertaDeTerapia {
  abierta: boolean;
  hub: TherapyHubResponse | null;
  /**
   * Qué historial enlazar. `null` = no se pudo saber, que no es lo mismo que
   * no tener.
   */
  historial: TherapyHistoryPresence | null;
}

export async function ofertaDeTerapia(): Promise<OfertaDeTerapia> {
  try {
    const hub = await serverFetch<TherapyHubResponse>("/terapia/hub");
    return {
      abierta: hub.offer?.open ?? false,
      hub,
      historial: hub.history ?? null,
    };
  } catch (err) {
    if (isNextThrow(err)) throw err;
    return { abierta: false, hub: null, historial: null };
  }
}

/**
 * Una sesión de la persona, o por qué no.
 *
 * Se separa «no es tuya o no existe» de «no pudimos preguntar» porque lo
 * segundo le puede pasar a quien SÍ tiene una sesión, y a esa persona no se le
 * puede contestar que no ofrecemos terapia.
 */
export type SesionDeTerapia =
  | { prep: SessionPrepResponse }
  | { prep: null; motivo: "no-existe" | "error" };

export async function sesionDeTerapia(id: string): Promise<SesionDeTerapia> {
  try {
    return {
      prep: await serverFetch<SessionPrepResponse>(
        `/terapia/sessions/${encodeURIComponent(id)}/prep`,
      ),
    };
  } catch (err) {
    if (isNextThrow(err)) throw err;
    const noEsSuya =
      err instanceof ApiError && (err.status === 404 || err.status === 403);
    return { prep: null, motivo: noEsSuya ? "no-existe" : "error" };
  }
}
