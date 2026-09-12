import "server-only";

import type {
  CircleActivityDefinition,
  CircleTemplateRegistry,
} from "@psico/types";
import { productionCircleTemplateRegistry } from "@psico/types";

/**
 * Which reading surfaces may offer a Dúo, and which activity they offer.
 *
 * ── Why a catalog and not a rule ───────────────────────────────────────────
 *
 * "Every chapter with a bilateral topic" is not a rule a program can evaluate,
 * and every attempt to make it one ends in a heuristic: a chapter number, a
 * keyword, a position in a list. Those are the failure modes this file exists
 * to make impossible, because the cost of a false positive is not a broken
 * layout — it is offering a two-person conversation to someone for whom that
 * conversation is the unsafe one.
 *
 * So eligibility is an ENUMERATION. A surface is eligible because a named
 * mapping says so, and for no other reason. There is no fallback, no default,
 * and no "nearby" match: an unknown pin is not eligible, and that is the whole
 * of the policy.
 *
 * ── Identity comes from pins that already exist ────────────────────────────
 *
 * An Experience is already identified by `experienceKey` + `experienceVersion`,
 * immutably (`ChapterExperienceDefinition`: editing a published experience
 * means publishing a NEW version). A template is already identified by
 * `templateKey` + `templateVersion`. This module introduces NO third identity —
 * it only names pairs of the two that already exist.
 *
 * What it deliberately never reads:
 *
 *   - `chapterOrder`. It is printed-book metadata, it is not unique across
 *     books, and it does not even agree with the editorial chapter code: in
 *     the Parejas collection every `CNN` sits at `chapterOrder NN+1`, so C06
 *     is at order 7 and C07 is at order 8. A guard written against "chapter 7"
 *     would block the wrong chapter and admit the one it meant to stop.
 *   - array position, visual order, or anything derived from a URL. The URL
 *     carries a template KEY so a link can be written; which version of it is
 *     publishable, and whether this surface may offer it at all, is answered
 *     here and never by the address bar.
 *
 * ── Agreement, not assertion ───────────────────────────────────────────────
 *
 * A mapping alone is not enough. The template must ALSO name the same
 * experience in its own `source.experiencePin`. Two independent records have to
 * agree before a reader is offered anything, so a single edited line — here or
 * in the catalog — cannot by itself point a surface at an activity the
 * editorial source never tied to it. A template that names no experience at all
 * can never be reached this way: absence is not agreement.
 */

/** The exact Experience a surface is showing. */
export interface ExperiencePinInput {
  readonly experienceKey: string;
  readonly experienceVersion: number;
}

/** One approved surface → activity pairing. Both halves are exact pins. */
export interface DuoEligibilityMapping {
  readonly experienceKey: string;
  readonly experienceVersion: number;
  readonly templateKey: string;
  readonly templateVersion: number;
}

/**
 * Everything the browser is allowed to learn: a label and where it goes.
 *
 * Not the catalog, not the rules, not the source, not `contentUnitId`, not the
 * template version — a link the server already decided to render. A client that
 * cannot see the policy cannot re-derive it, disagree with it, or leak it.
 */
export interface CircleDuoEntry {
  readonly label: string;
  readonly href: string;
}

export const DUO_CTA_LABEL = "Hacer esto con alguien";

/**
 * The production mappings — EMPTY, and deliberately so.
 *
 * `PRODUCTION_CIRCLE_TEMPLATES` is empty, so there is no PUBLISHED template any
 * mapping could point at. An entry here would name a template that does not
 * exist and resolve to nothing; adding one is an editorial act that happens
 * after a template is published, never before.
 *
 * With this empty, production renders zero CTAs. That is the correct result,
 * not a gap to be filled by publishing something to make a button appear.
 */
export const PRODUCTION_DUO_ELIGIBILITY: readonly DuoEligibilityMapping[] = [];

export interface DuoEligibilityDeps {
  readonly catalog: readonly DuoEligibilityMapping[];
  readonly registry: CircleTemplateRegistry;
}

const PRODUCTION_DEPS: DuoEligibilityDeps = Object.freeze({
  catalog: PRODUCTION_DUO_ELIGIBILITY,
  registry: productionCircleTemplateRegistry,
});

function samePin(
  mapping: DuoEligibilityMapping,
  pin: ExperiencePinInput,
): boolean {
  return (
    mapping.experienceKey === pin.experienceKey &&
    mapping.experienceVersion === pin.experienceVersion
  );
}

/**
 * The template this mapping points at, but only if every condition holds.
 *
 * Returns `null` — never throws, never a partial answer — for an unknown pin, a
 * version that is not the mapped one, a DRAFT, an ARCHIVED, or a template whose
 * own source does not name this experience back.
 */
export function resolveDuoTemplate(
  pin: ExperiencePinInput,
  deps: DuoEligibilityDeps = PRODUCTION_DEPS,
): CircleActivityDefinition | null {
  if (typeof pin?.experienceKey !== "string") return null;
  if (!Number.isInteger(pin?.experienceVersion)) return null;

  const mapping = deps.catalog.find((m) => samePin(m, pin));
  if (!mapping) return null;

  let definition: CircleActivityDefinition;
  try {
    definition = deps.registry.getExact(
      mapping.templateKey,
      mapping.templateVersion,
    );
  } catch {
    // A mapping naming a pin this build does not carry is a stale mapping, not
    // an error to surface: no template, no offer.
    return null;
  }

  // Only a PUBLISHED template may be offered. DRAFT and ARCHIVED still resolve
  // by pin for activities already running on them — that is `getExact`'s job —
  // but neither may be the destination of a new invitation.
  if (definition.status !== "PUBLISHED") return null;

  // The template has to name this experience back. `source.experiencePin` is
  // optional in the contract, so a template that names none is unreachable
  // here by construction.
  const declared = definition.source.experiencePin;
  if (!declared) return null;
  if (declared.experienceKey !== pin.experienceKey) return null;
  if (declared.experienceVersion !== pin.experienceVersion) return null;

  return definition;
}

/**
 * The CTA for an Experience, or `null` when there is nothing to offer.
 *
 * `null` means the surface renders NOTHING — no disabled button, no reserved
 * space, no "próximamente". A reader who is not being offered this should not
 * be able to tell that it exists.
 */
export function resolveDuoEntry(
  pin: ExperiencePinInput,
  deps: DuoEligibilityDeps = PRODUCTION_DEPS,
): CircleDuoEntry | null {
  const definition = resolveDuoTemplate(pin, deps);
  if (!definition) return null;

  return Object.freeze({
    label: DUO_CTA_LABEL,
    href: `/dashboard/circulos/nuevo/${encodeURIComponent(definition.templateKey)}`,
  });
}

/**
 * The single PUBLISHED template for a key, for the organiser screen.
 *
 * The URL carries a key, never a version, so the server decides which pin a key
 * currently means. Exactly one PUBLISHED version must match: zero is "not
 * available", and more than one is ambiguous, which is refused rather than
 * resolved by picking the highest. Guessing here would let a link written for
 * one version silently create an activity on another.
 */
export function resolvePublishedTemplateByKey(
  templateKey: string,
  deps: DuoEligibilityDeps = PRODUCTION_DEPS,
): CircleActivityDefinition | null {
  if (typeof templateKey !== "string" || templateKey.length === 0) return null;

  const matches = deps.registry
    .listPublished()
    .filter((d) => d.templateKey === templateKey);

  return matches.length === 1 ? matches[0]! : null;
}
