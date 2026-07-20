export { apiClient } from "./client";
export type { TokenStore } from "./client";
export { ApiError } from "./error";
export { authApi } from "./auth";
export { booksApi } from "./books";
export { contentApi } from "./content";
export { contentCoreApi } from "./content-core";
export { diarioApi } from "./diario";
export { homeApi } from "./home";
// Sprint B1 — POST /api/mood time series for the Topbar MoodChip.
export { moodApi } from "./mood";
// Sprint B5 — GET /api/journeys curated Exploraciones catalog.
export { journeysApi } from "./journeys";
// Sprint D — GET /api/emotional-map (radar driver for Inicio).
export { emotionalMapApi } from "./emotional-map";
// Fase E (V2) — ARC cycle: confirmed resonances feed the map explicitly.
export { resonancesApi } from "./resonances";
// CC-7.3 — learning domain commands + derived progress (ADR 0017).
export { learningApi } from "./learning";
// Sprint D — GET /api/activity (Inicio timeline feed).
export { activityApi } from "./activity";
// Sprint E1 — GET /api/evolucion (stats + achievements for "Mi Evolución").
export { evolucionApi } from "./evolucion";
// Sprint S11 — canonical billing client. Prefer this over `subscriptionApi`.
export { billingApi } from "./billing";
export type { BillingInterval, CheckoutSession } from "./billing";

/** @deprecated Sprint S11 — use `billingApi` instead. Sunset 2026-08-31. */
export { subscriptionApi } from "./subscription";
export { voiceApi } from "./voice";
export { ecoApi, parseSseChunk } from "./eco";
export { lectorApi, highlightsApi, annotationsApi } from "./lector";
export { onboardingApi } from "./onboarding";
export { patronesApi } from "./patrones";
export { pulsoApi } from "./pulso";
export { notificationsApi } from "./notifications";
export { usersApi } from "./users";
export { terapiaApi } from "./terapia";
export { authorApi } from "./author";

// Auto-generated OpenAPI types — see scripts/generate.mjs and ADR 0008.
// Consumers can use:
//   import type { paths, components } from "@psico/api-client";
//   type LoginBody = components["schemas"]["LoginDto"];
//   type LoginResponse = paths["/api/auth/login"]["post"]["responses"][200]["content"]["application/json"];
export type { paths, components, operations } from "./generated";
