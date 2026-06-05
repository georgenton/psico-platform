export { apiClient } from "./client";
export type { TokenStore } from "./client";
export { ApiError } from "./error";
export { authApi } from "./auth";
export { booksApi } from "./books";
export { contentApi } from "./content";
export { diarioApi } from "./diario";
export { homeApi } from "./home";
// Sprint S11 — canonical billing client. Prefer this over `subscriptionApi`.
export { billingApi } from "./billing";
export type { BillingInterval, CheckoutSession } from "./billing";

/** @deprecated Sprint S11 — use `billingApi` instead. Sunset 2026-08-31. */
export { subscriptionApi } from "./subscription";
export { voiceApi } from "./voice";
export { ecoApi } from "./eco";
export { lectorApi, highlightsApi, annotationsApi } from "./lector";
export { onboardingApi } from "./onboarding";
export { patronesApi } from "./patrones";
export { pulsoApi } from "./pulso";
export { notificationsApi } from "./notifications";
export { usersApi } from "./users";

// Auto-generated OpenAPI types — see scripts/generate.mjs and ADR 0008.
// Consumers can use:
//   import type { paths, components } from "@psico/api-client";
//   type LoginBody = components["schemas"]["LoginDto"];
//   type LoginResponse = paths["/api/auth/login"]["post"]["responses"][200]["content"]["application/json"];
export type { paths, components, operations } from "./generated";
