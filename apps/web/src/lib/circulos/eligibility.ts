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
 * The production mappings — ONE, and it is half of an agreement.
 *
 * The published guide `eec-c1-cuerpo-antes-que-mente@1` may offer
 * `duo-lo-que-me-ayuda@2`. That is an editorial decision Jorge approved — first
 * for @1, and then for @2 after walking it end to end in the hosted test
 * environment — and it is written here as an enumeration rather than derived
 * from anything.
 *
 * The entry MOVED when @2 was published; it was not added beside the old one.
 * Two entries for one experience do not break a tie, they disable the offer.
 *
 * This entry ALONE offers nothing. The template names the same experience back
 * in its own `source.experiencePin`, and both records have to agree before a
 * reader sees a CTA. Editing one without the other does not point the surface
 * somewhere new — it silences the offer, which is the safe direction for a
 * mistake to fall.
 *
 * One mapping per (surface, template). A second entry for this surface would
 * not win a tie-break: ambiguity disables the offer.
 */
export const PRODUCTION_DUO_ELIGIBILITY: readonly DuoEligibilityMapping[] = [
  {
    experienceKey: "eec-c1-cuerpo-antes-que-mente",
    experienceVersion: 1,
    templateKey: "duo-lo-que-me-ayuda",
    templateVersion: 2,
  },
];

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

  // EXACTLY ONE mapping, or nothing.
  //
  // `find()` was wrong here, and not only in the obvious way. It made array
  // ORDER the tie-breaker: two entries for one pin meant the earlier one
  // silently won, so which activity a reader was offered depended on where a
  // line happened to sit in a file. Two identical entries are just as bad —
  // they read as harmless, so the duplicate that matters (a later edit
  // changing one of them) arrives into a catalog that already tolerates
  // duplication.
  //
  // A catalog that says a pin means two things does not mean either of them.
  // There is no first, no last, no highest version and no fallback: a
  // duplicated pin is an authoring mistake, and the honest response is to
  // offer nothing until a person resolves it.
  const matches = deps.catalog.filter((m) => samePin(m, pin));
  if (matches.length !== 1) return null;
  const mapping = matches[0]!;

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

/**
 * Where a PUBLISHED template is offered from, for the Círculos listing.
 *
 * The inverse of `resolveDuoTemplate`, and deliberately no more than that. The
 * listing needs to send somebody to the place the CTA actually lives, because
 * a Dúo is offered from the material it belongs to — reading about something
 * and deciding to do it with another person are different acts, and only the
 * reading surface is entitled to make the offer.
 *
 * Every rule stays where it was. This narrows the catalog to the mappings that
 * name this template, refuses anything but exactly one, and then hands that
 * mapping's pin to `resolveDuoTemplate` so the SAME conditions decide as
 * always: the pin must resolve to one mapping, the template must be PUBLISHED,
 * and it must name the experience back. No second policy, no shortcut.
 *
 * Ambiguity is refused rather than resolved. Two surfaces offering one template
 * is an authoring question — which one did the editor mean? — and answering it
 * by array order is how a reader ends up sent to the wrong chapter.
 */
export function resolveDuoSurface(
  templateKey: string,
  deps: DuoEligibilityDeps = PRODUCTION_DEPS,
): { readonly experienceKey: string; readonly href: string } | null {
  if (typeof templateKey !== "string" || templateKey.length === 0) return null;

  const named = deps.catalog.filter((m) => m.templateKey === templateKey);
  if (named.length !== 1) return null;
  const mapping = named[0]!;

  const definition = resolveDuoTemplate(
    {
      experienceKey: mapping.experienceKey,
      experienceVersion: mapping.experienceVersion,
    },
    deps,
  );
  // A mapping can name a template the pin does not resolve back to — a stale
  // half-edit. The offer only stands when both directions agree.
  if (!definition || definition.templateKey !== templateKey) return null;

  return Object.freeze({
    experienceKey: mapping.experienceKey,
    href: `/dashboard/exploraciones/${encodeURIComponent(mapping.experienceKey)}`,
  });
}

/** Where the Círculos listing sends somebody, and what to call the link. */
export interface CircleStart {
  /**
   * `reading` — the activity is offered by the material it belongs to, and the
   * listing only points at it. `direct` — the listing IS the surface.
   */
  readonly kind: "reading" | "direct";
  readonly href: string;
  readonly label: string;
}

/**
 * How an activity in the listing can actually be started, or `null`.
 *
 * Decided per AUDIENCE, enumerated, with no fallback — the same posture as the
 * catalog above, and for the same reason: the cost of guessing wrong is not a
 * broken layout, it is offering an activity from a place nobody approved.
 *
 * ── A Dúo is offered by its reading ────────────────────────────────────────
 *
 * Unchanged. Reading about something and deciding to do it with another person
 * are different acts, and only the reading surface is entitled to make the
 * offer, so the listing points at that surface and never starts one itself. No
 * mapping, no agreement, no offer.
 *
 * ── A group is offered here ────────────────────────────────────────────────
 *
 * `grupo-lo-que-nos-ayuda@1` names a book and a chapter as its source but
 * declares NO `experiencePin`, which is the editorial statement that it is not
 * proposed by a particular reading. It has nowhere else to be offered from —
 * and a published, eligible activity whose only screen says "todavía no hay una
 * desde la que puedas empezarla" is a dead end the listing itself created.
 *
 * A group that DID declare an experience pin is refused rather than offered
 * from both places. Two surfaces for one activity is an authoring question, and
 * answering it here by preferring one would be the guess this file exists to
 * avoid.
 */
export function resolveCircleStart(
  definition: CircleActivityDefinition,
  deps: DuoEligibilityDeps = PRODUCTION_DEPS,
): CircleStart | null {
  if (definition.status !== "PUBLISHED") return null;

  if (definition.audience === "GROUP_ADULT") {
    if (definition.source.experiencePin) return null;
    return Object.freeze({
      kind: "direct" as const,
      href: `/dashboard/circulos/nuevo/${encodeURIComponent(definition.templateKey)}`,
      label: "Empezar este círculo",
    });
  }

  const surface = resolveDuoSurface(definition.templateKey, deps);
  if (!surface) return null;
  return Object.freeze({
    kind: "reading" as const,
    href: surface.href,
    label: "Ir a la experiencia",
  });
}
