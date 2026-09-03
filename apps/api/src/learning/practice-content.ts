import {
  isPracticeKind,
  type PracticeInteraction,
  type PracticeOption,
} from "@psico/types";

/**
 * Reading a practice's stored content back, strictly.
 *
 * Same posture as `parseRecallCatalogContent`: the shape is closed, unknown
 * keys are a rejection rather than a warning, and a row that does not parse
 * yields `null` instead of a half-populated object. A renderer downstream can
 * then show its fallback honestly — "this practice cannot be loaded" — rather
 * than drawing an interaction out of whatever the row happened to contain.
 *
 * Nothing here reads or emits a grading datum, because a practice has none: it
 * completes on the reader's own confirmation. `sequence_ordering` carries a
 * `solved` order the reader may ask to see; it is content, not an answer key,
 * and nothing compares it to anything.
 */

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every(isStr);

function hasOnlyKeys(o: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** `{key, label}`, both required, nothing else, keys unique across the list. */
function parseOptions(v: unknown, min: number): PracticeOption[] | null {
  if (!Array.isArray(v) || v.length < min) return null;
  const out: PracticeOption[] = [];
  for (const raw of v) {
    const o = asObject(raw);
    if (!o || !hasOnlyKeys(o, ["key", "label"])) return null;
    if (!isStr(o.key) || o.key.length === 0) return null;
    if (!isStr(o.label) || o.label.length === 0) return null;
    out.push({ key: o.key, label: o.label });
  }
  return new Set(out.map((o) => o.key)).size === out.length ? out : null;
}

/** Each kind's own parse. Returns null the moment anything is off. */
function parseInteraction(
  o: Record<string, unknown>,
): PracticeInteraction | null {
  if (!isPracticeKind(o.kind)) return null;

  switch (o.kind) {
    case "belief_lens": {
      if (!hasOnlyKeys(o, ["kind", "belief", "zones", "allowsFreeText"])) {
        return null;
      }
      if (!isStr(o.belief) || typeof o.allowsFreeText !== "boolean")
        return null;
      if (!Array.isArray(o.zones) || o.zones.length !== 3) return null;
      const wanted = ["observo", "supongo", "falta"];
      const zones: unknown[] = [];
      for (const [i, raw] of o.zones.entries()) {
        const z = asObject(raw);
        if (!z || !hasOnlyKeys(z, ["key", "label", "hint", "options"])) {
          return null;
        }
        if (z.key !== wanted[i]) return null;
        if (!isStr(z.label) || !isStr(z.hint)) return null;
        const options = parseOptions(z.options, 2);
        if (!options) return null;
        zones.push({ key: z.key, label: z.label, hint: z.hint, options });
      }
      return {
        kind: "belief_lens",
        belief: o.belief,
        zones: zones as never,
        allowsFreeText: o.allowsFreeText,
      };
    }

    case "context_plausibility": {
      if (
        !hasOnlyKeys(o, [
          "kind",
          "situation",
          "observation",
          "availableContext",
          "readings",
          "buckets",
          "missingInformationPrompt",
        ])
      ) {
        return null;
      }
      if (!isStr(o.situation) || !isStr(o.observation)) return null;
      if (!isStr(o.missingInformationPrompt)) return null;
      if (!isStrArray(o.availableContext)) return null;
      const readings = parseOptions(o.readings, 2);
      const buckets = parseOptions(o.buckets, 2);
      if (!readings || !buckets) return null;
      return {
        kind: "context_plausibility",
        situation: o.situation,
        observation: o.observation,
        availableContext: o.availableContext,
        readings,
        buckets,
        missingInformationPrompt: o.missingInformationPrompt,
      };
    }

    case "sequence_ordering": {
      if (
        !hasOnlyKeys(o, [
          "kind",
          "scenario",
          "cards",
          "solved",
          "solvedLabel",
          "feedback",
        ])
      ) {
        return null;
      }
      if (!isStr(o.scenario) || !isStr(o.solvedLabel) || !isStr(o.feedback)) {
        return null;
      }
      const cards = parseOptions(o.cards, 2);
      if (!cards || !isStrArray(o.solved)) return null;
      // The solved arrangement must be a permutation of the cards — a stale
      // edit that drops one would otherwise render a shorter "solution".
      const keys = new Set(cards.map((c) => c.key));
      if (o.solved.length !== cards.length) return null;
      if (!o.solved.every((k) => keys.has(k))) return null;
      if (new Set(o.solved).size !== o.solved.length) return null;
      return {
        kind: "sequence_ordering",
        scenario: o.scenario,
        cards,
        solved: o.solved,
        solvedLabel: o.solvedLabel,
        feedback: o.feedback,
      };
    }

    case "four_part_distinction": {
      if (
        !hasOnlyKeys(o, [
          "kind",
          "scenario",
          "fields",
          "allowsFreeText",
          "disclaimer",
        ])
      ) {
        return null;
      }
      if (!isStr(o.scenario) || !isStr(o.disclaimer)) return null;
      if (typeof o.allowsFreeText !== "boolean") return null;
      if (!Array.isArray(o.fields) || o.fields.length !== 4) return null;
      const wanted = ["siento", "interpreto", "impulso", "elijo"];
      const fields: unknown[] = [];
      for (const [i, raw] of o.fields.entries()) {
        const f = asObject(raw);
        if (!f || !hasOnlyKeys(f, ["key", "label", "options"])) return null;
        if (f.key !== wanted[i] || !isStr(f.label)) return null;
        const options = parseOptions(f.options, 2);
        if (!options) return null;
        fields.push({ key: f.key, label: f.label, options });
      }
      return {
        kind: "four_part_distinction",
        scenario: o.scenario,
        fields: fields as never,
        allowsFreeText: o.allowsFreeText,
        disclaimer: o.disclaimer,
      };
    }

    case "signal_context_compare": {
      if (
        !hasOnlyKeys(o, ["kind", "signals", "contexts", "factors", "prompt"])
      ) {
        return null;
      }
      if (!isStrArray(o.signals) || !isStr(o.prompt)) return null;
      if (!Array.isArray(o.contexts) || o.contexts.length !== 2) return null;
      const contexts: unknown[] = [];
      for (const raw of o.contexts) {
        const c = asObject(raw);
        if (!c || !hasOnlyKeys(c, ["key", "label", "description"])) return null;
        if (!isStr(c.key) || !isStr(c.label) || !isStr(c.description)) {
          return null;
        }
        contexts.push({
          key: c.key,
          label: c.label,
          description: c.description,
        });
      }
      const factors = parseOptions(o.factors, 2);
      if (!factors) return null;
      return {
        kind: "signal_context_compare",
        signals: o.signals,
        contexts: contexts as never,
        factors,
        prompt: o.prompt,
      };
    }
  }
}

/**
 * `Exercise.content` → the interaction, or null.
 *
 * A `guided_reflection` row has no interaction and is not an error: it is the
 * older shape, still valid, still what the pilot stores.
 */
export function parsePracticeCatalogContent(
  content: unknown,
): PracticeInteraction | null {
  const o = asObject(content);
  if (!o) return null;
  if (!hasOnlyKeys(o, ["practiceKind", "sourceBlockKey", "interaction"])) {
    return null;
  }
  if (o.interaction === undefined) return null;
  const inner = asObject(o.interaction);
  if (!inner) return null;
  // The row's own `practiceKind` and the interaction's `kind` must agree; two
  // names for the same fact are two chances to disagree.
  if (o.practiceKind !== inner.kind) return null;
  return parseInteraction(inner);
}
