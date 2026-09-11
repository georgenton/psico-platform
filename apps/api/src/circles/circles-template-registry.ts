import type { CircleTemplateRegistry } from "@psico/types";

/**
 * The template registry, as a DI token (PR3).
 *
 * The production catalog is EMPTY and stays empty: publishing a template is an
 * editorial decision with its own approval, never a side effect of needing a
 * green test. Injecting the registry rather than importing the production
 * singleton is what lets the suite exercise the successful path against
 * fixtures without publishing anything — and what lets
 * `circles-scope.spec.ts` keep asserting that `PRODUCTION_CIRCLE_TEMPLATES`
 * is `[]` while `createDuo` is nonetheless covered end to end.
 */
export const CIRCLES_TEMPLATE_REGISTRY = Symbol("CIRCLES_TEMPLATE_REGISTRY");

export type CirclesTemplateRegistryRef = CircleTemplateRegistry;
