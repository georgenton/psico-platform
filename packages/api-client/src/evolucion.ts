import type { EvolucionResponse } from "@psico/types";
import { apiClient } from "./client";

/**
 * evolucionApi — Sprint E1.
 *
 * Stats agregadas + lista de achievements del catálogo. La pantalla
 * `/dashboard/evolucion` es el único consumer; no se agrega a /api/home
 * porque su payload no aplica al hero del Inicio.
 */
export const evolucionApi = {
  get: () => apiClient.get<EvolucionResponse>("/evolucion"),
};
