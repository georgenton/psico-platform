// Shared kernel — cross-cutting decorators, guards, filters, interceptors used
// by every feature module. Anything that is not feature-specific lives here.
//
// Anti-pattern this module fights: feature modules importing from each other
// (e.g. UsersModule importing CurrentUser from ContentModule). The shared
// kernel has zero dependency on feature modules — it's a leaf in the
// dependency graph.

export * from "./decorators/current-user.decorator";
export * from "./decorators/required-plan.decorator";
export * from "./decorators/required-role.decorator";
export * from "./decorators/idempotent.decorator";
export * from "./guards/plan.guard";
export * from "./guards/roles.guard";
export * from "./filters/http-exception.filter";
export * from "./interceptors/idempotency.interceptor";
export * from "./throttler/throttler.module";
export * from "./throttler/redis-throttler.storage";
