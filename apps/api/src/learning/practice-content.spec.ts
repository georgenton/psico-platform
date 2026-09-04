import { describe, expect, it } from "vitest";
import { PRACTICE_KINDS } from "@psico/types";
import { parsePracticeCatalogContent } from "./practice-content";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { practiceContentFor } from "../content-core/exercise-ingestion";

/**
 * The practice contract, parsed the way the server will parse it.
 *
 * Every case starts from the REAL catalog rather than a hand-built fixture:
 * the question these tests answer is "does what we ship survive its own
 * parser", and a fixture answers a different, easier question.
 */

const EEC = EXERCISE_INGESTION_CATALOG["emociones-en-construccion"] ?? [];
const withInteraction = EEC.map((p) => p.practice).filter(
  (p) => p.interaction !== undefined,
);
const stored = (key: string) => {
  const def = withInteraction.find((p) => p.exerciseKey === key);
  if (!def) throw new Error(`not in catalog: ${key}`);
  return practiceContentFor(def, "block-key-1");
};

describe("the five practice interactions", () => {
  it("ships one practice per microguide, and every kind is used", () => {
    // Five with EEC-C01, ten with EEC-C02. What is ratcheted is not the number
    // of practices — a chapter may add more — but that each one declares a kind
    // this build renders, and that no kind is shipped without a practice using
    // it.
    expect(withInteraction).toHaveLength(10);
    expect(
      withInteraction.every(
        (p) => p.chapterOrder === 1 || p.chapterOrder === 2,
      ),
    ).toBe(true);
    for (const p of withInteraction) {
      expect(PRACTICE_KINDS as readonly string[]).toContain(p.practiceKind);
    }
    expect(
      [...new Set(withInteraction.map((p) => p.practiceKind))].sort(),
    ).toEqual([...PRACTICE_KINDS].sort());
  });

  it("each one round-trips through the stored content", () => {
    for (const def of withInteraction) {
      const parsed = parsePracticeCatalogContent(
        practiceContentFor(def, "block-key-1"),
      );
      expect(parsed).toEqual(def.interaction);
    }
  });

  it("a guided_reflection stores the same two keys it always has", () => {
    const pilot = EEC.map((p) => p.practice).find(
      (p) => p.practiceKind === "guided_reflection",
    );
    expect(pilot).toBeDefined();
    const content = practiceContentFor(pilot!, "block-key-1");
    // The pilot's row is in production and the ingestion refuses on drift.
    expect(Object.keys(content).sort()).toEqual([
      "practiceKind",
      "sourceBlockKey",
    ]);
    expect(parsePracticeCatalogContent(content)).toBeNull();
  });

  it("no interaction carries a grading datum", () => {
    for (const def of withInteraction) {
      expect(JSON.stringify(def.interaction)).not.toContain("correctOptionKey");
      expect(JSON.stringify(def.interaction)).not.toContain("correct");
    }
  });
});

describe("the parser refuses what it does not recognise", () => {
  it("a kind this build does not know", () => {
    expect(
      parsePracticeCatalogContent({
        practiceKind: "mind_reading",
        sourceBlockKey: "b",
        interaction: { kind: "mind_reading" },
      }),
    ).toBeNull();
  });

  it("a row whose practiceKind and interaction disagree", () => {
    const content = stored("eec-c1-practice-ordenar-alarma-y-relato");
    expect(
      parsePracticeCatalogContent({ ...content, practiceKind: "belief_lens" }),
    ).toBeNull();
  });

  it("an extra key at the top level", () => {
    const content = stored("eec-c1-practice-revisar-un-lente");
    expect(
      parsePracticeCatalogContent({ ...content, telemetry: true }),
    ).toBeNull();
  });

  it("an extra key inside the interaction", () => {
    const content = stored("eec-c1-practice-revisar-un-lente") as Record<
      string,
      Record<string, unknown>
    >;
    expect(
      parsePracticeCatalogContent({
        ...content,
        interaction: { ...content.interaction, score: 1 },
      }),
    ).toBeNull();
  });

  it("a solved order that is not a permutation of the cards", () => {
    const content = stored("eec-c1-practice-ordenar-alarma-y-relato") as Record<
      string,
      Record<string, unknown>
    >;
    for (const bad of [
      ["senal", "respuesta", "contexto"],
      ["senal", "senal", "contexto", "interpretacion"],
      ["senal", "respuesta", "contexto", "inventada"],
    ]) {
      expect(
        parsePracticeCatalogContent({
          ...content,
          interaction: { ...content.interaction, solved: bad },
        }),
      ).toBeNull();
    }
  });

  it("three zones named something else", () => {
    const content = stored("eec-c1-practice-revisar-un-lente") as Record<
      string,
      Record<string, unknown>
    >;
    const zones = (content.interaction.zones as { key: string }[]).map((z) => ({
      ...z,
      key: "otra",
    }));
    expect(
      parsePracticeCatalogContent({
        ...content,
        interaction: { ...content.interaction, zones },
      }),
    ).toBeNull();
  });

  it("options that repeat a key", () => {
    const content = stored("eec-c1-practice-senales-y-contextos") as Record<
      string,
      Record<string, unknown>
    >;
    const factors = [
      { key: "a", label: "Uno" },
      { key: "a", label: "Otro" },
    ];
    expect(
      parsePracticeCatalogContent({
        ...content,
        interaction: { ...content.interaction, factors },
      }),
    ).toBeNull();
  });

  it("anything that is not an object", () => {
    for (const bad of [null, 1, "x", [], undefined]) {
      expect(parsePracticeCatalogContent(bad)).toBeNull();
    }
  });
});

describe("what each interaction must actually contain", () => {
  it("belief_lens asks the three questions the design names", () => {
    const i = parsePracticeCatalogContent(
      stored("eec-c1-practice-revisar-un-lente"),
    );
    expect(i?.kind).toBe("belief_lens");
    if (i?.kind !== "belief_lens") return;
    expect(i.zones.map((z) => z.key)).toEqual(["observo", "supongo", "falta"]);
    // Suggested options exist, so writing is never the only way through.
    expect(i.zones.every((z) => z.options.length >= 2)).toBe(true);
  });

  it("context_plausibility separates reading from missing information", () => {
    const i = parsePracticeCatalogContent(
      stored("eec-c1-practice-una-sonrisa-varios-contextos"),
    );
    if (i?.kind !== "context_plausibility") throw new Error("wrong kind");
    expect(i.availableContext.length).toBeGreaterThan(0);
    // The accessible path: buckets to classify into, no dragging required.
    expect(i.buckets.map((b) => b.key)).toContain("falta-info");
    expect(i.missingInformationPrompt.length).toBeGreaterThan(0);
  });

  it("sequence_ordering ships the four approved cards and a way out", () => {
    const i = parsePracticeCatalogContent(
      stored("eec-c1-practice-ordenar-alarma-y-relato"),
    );
    if (i?.kind !== "sequence_ordering") throw new Error("wrong kind");
    expect(i.cards).toHaveLength(4);
    expect(i.solved).toEqual([
      "senal",
      "respuesta",
      "contexto",
      "interpretacion",
    ]);
    expect(i.solvedLabel).toBe("Prefiero ver el ejemplo resuelto");
    expect(i.feedback.length).toBeGreaterThan(0);
  });

  it("four_part_distinction says out loud that it is not advice", () => {
    const i = parsePracticeCatalogContent(
      stored("eec-c1-practice-siento-interpreto-impulso-elijo"),
    );
    if (i?.kind !== "four_part_distinction") throw new Error("wrong kind");
    expect(i.fields.map((f) => f.key)).toEqual([
      "siento",
      "interpreto",
      "impulso",
      "elijo",
    ]);
    expect(i.disclaimer).toMatch(/no es un diagnóstico/i);
  });

  it("signal_context_compare offers more than the story a person tells", () => {
    const i = parsePracticeCatalogContent(
      stored("eec-c1-practice-senales-y-contextos"),
    );
    if (i?.kind !== "signal_context_compare") throw new Error("wrong kind");
    expect(i.contexts).toHaveLength(2);
    // The editorial correction: meaning is not made of narration alone.
    const keys = i.factors.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "situacion",
        "aprendizaje",
        "expectativa",
        "recuerdos",
      ]),
    );
  });
});
