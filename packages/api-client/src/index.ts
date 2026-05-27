export { apiClient } from "./client";
export type { TokenStore } from "./client";
export { ApiError } from "./error";
export { authApi } from "./auth";
export { booksApi } from "./books";
export { contentApi } from "./content";
export { diarioApi } from "./diario";
export { homeApi } from "./home";
export { subscriptionApi } from "./subscription";
export type { BillingInterval, CheckoutSession } from "./subscription";

// Auto-generated OpenAPI types — see scripts/generate.mjs and ADR 0008.
// Consumers can use:
//   import type { paths, components } from "@psico/api-client";
//   type LoginBody = components["schemas"]["LoginDto"];
//   type LoginResponse = paths["/api/auth/login"]["post"]["responses"][200]["content"]["application/json"];
export type { paths, components, operations } from "./generated";
