import { Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS DI requires the runtime class for `paramtypes` metadata
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

import type {
  EmotionalMapMetadataPayload,
  EmotionalMapProviderResult,
  IEmotionalMapProvider,
} from "./provider.interface";

/**
 * AnthropicEmotionalMapProvider — Sprint D.
 *
 * Computes 4 LLM-driven axes (calma / claridad / compasión / consciencia)
 * from plaintext metadata only. Privacy contract (ADR 0007): the prompt
 * carries mood tokens, tag frequencies, weekday distribution, entry count.
 * It NEVER carries ciphertext, body, excerpt, or any field that could
 * round-trip to plaintext.
 *
 * Uses Claude Sonnet 4.6 with a strict JSON output format. If parse fails
 * or the network errors, the caller falls back to neutral 0.5 values per
 * axis so the radar still renders.
 */
@Injectable()
export class AnthropicEmotionalMapProvider implements IEmotionalMapProvider {
  readonly name = "anthropic";
  private readonly logger = new Logger(AnthropicEmotionalMapProvider.name);
  private readonly anthropic: Anthropic;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("ANTHROPIC_API_KEY") ?? "";
    this.anthropic = new Anthropic({ apiKey });
  }

  async score(
    payload: EmotionalMapMetadataPayload,
  ): Promise<EmotionalMapProviderResult> {
    // Aggregate the metadata into compact lines. The LLM sees frequency
    // counts and weekday distribution — never per-entry detail beyond that.
    const moodCounts = countBy(payload.entries.map((e) => e.mood));
    const tagCounts = countBy(payload.entries.flatMap((e) => e.tags));
    const weekdayCounts = countBy(
      payload.entries.map((e) => weekdayOf(e.createdAtIso)),
    );

    const moodLine = formatCounts(moodCounts);
    const tagLine = formatCounts(tagCounts, 8);
    const weekdayLine = formatCounts(weekdayCounts);

    // Fase C (V2 contract): engagement counters are optional — when the
    // scoring omits them (EMOTIONAL_MAP_V2 on), the prompt carries no usage
    // activity at all (learning-vs-emotional-map.md).
    const engagementLines = [
      payload.stats.streakDays != null
        ? `- Racha actual (días): ${payload.stats.streakDays}`
        : null,
      payload.stats.ecoMessages != null
        ? `- Mensajes a Eco (30d): ${payload.stats.ecoMessages}`
        : null,
      payload.stats.ecoActiveDays != null
        ? `- Días activos con Eco: ${payload.stats.ecoActiveDays}`
        : null,
      payload.stats.voiceCount != null
        ? `- Notas de voz (30d): ${payload.stats.voiceCount}`
        : null,
      payload.stats.readingSessions != null
        ? `- Sesiones de lectura (30d): ${payload.stats.readingSessions}`
        : null,
    ].filter((l): l is string => l !== null);

    const userPrompt = [
      `Analiza estos patrones del diario y devuelve 4 ejes de comprensión emocional.`,
      ``,
      `DATOS (agregados, sin texto del diario ni de Eco):`,
      `- Entradas de diario (30d): ${payload.stats.entryCount}`,
      `- Días activos con diario: ${payload.stats.activeDays}`,
      ...engagementLines,
      `- Mood counts: ${moodLine || "(ninguno)"}`,
      `- Tag counts: ${tagLine || "(ninguno)"}`,
      `- Distribución por día de semana: ${weekdayLine || "(ninguna)"}`,
      ``,
      `EJES:`,
      `- calma: estabilidad emocional. Más alta cuando hay variedad de mood sin dominancia de ansiedad/hard.`,
      `- claridad: capacidad de nombrar lo que se siente. Más alta con tags categoriales (trabajo, familia, sueño), notas de voz y consistencia.`,
      `- compasion: tono validante hacia sí mismo. Más alta cuando hay entries en moods difíciles SIN abandono (sigue escribiendo o conversando con Eco).`,
      `- consciencia: regularidad de la observación de sí mismo. Más alta con días activos altos (diario + Eco) y distribución pareja.`,
      ``,
      `FORMATO de salida (estricto JSON, sin markdown, sin comentarios):`,
      `{"calma":0.NN,"claridad":0.NN,"compasion":0.NN,"consciencia":0.NN}`,
      ``,
      `Cada valor entre 0 y 1 con 2 decimales. No agregues claves extra. No expliques.`,
    ].join("\n");

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: [
        {
          type: "text",
          text: EMOTIONAL_MAP_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = parseEmotionalMapJson(text);
    if (!parsed) {
      throw new Error("EMOTIONAL_MAP_PARSE_FAILED");
    }

    this.logger.log(
      `EmotionalMap tokens in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
    );
    return parsed;
  }
}

// ─── Module-level helpers (exported for unit tests) ──────────────────────

export const EMOTIONAL_MAP_SYSTEM_PROMPT = `Eres el motor de scoring del Mapa Emocional de Psico Platform.
Voz: neutra, cuantitativa, no diagnóstica.

REGLAS:
- Habla SOLO con números en [0, 1]. No hagas storytelling.
- NO interpretes contenido del diario — solo recibes metadata categórica.
- NO uses lenguaje clínico ni etiquetas DSM.
- El output debe ser JSON parseable, sin markdown ni texto adicional.

Tu output alimenta un radar visual. Mantén los valores conservadores cuando
la muestra es pequeña (<5 entries en 30d → todo cerca de 0.5).`;

export function parseEmotionalMapJson(
  text: string,
): EmotionalMapProviderResult | null {
  const trimmed = text.trim();
  // Tolerate wrapping in ```json ... ``` despite the prompt.
  const stripped = trimmed.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const obj = JSON.parse(stripped) as Record<string, unknown>;
    const calma = clamp01(toNum(obj.calma));
    const claridad = clamp01(toNum(obj.claridad));
    const compasion = clamp01(toNum(obj.compasion));
    const consciencia = clamp01(toNum(obj.consciencia));
    if (
      calma === null ||
      claridad === null ||
      compasion === null ||
      consciencia === null
    )
      return null;
    return { calma, claridad, compasion, consciencia };
  } catch {
    return null;
  }
}

function toNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function clamp01(v: number | null): number | null {
  return v === null ? null : Math.min(1, Math.max(0, v));
}

function countBy(items: ReadonlyArray<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of items) out[k] = (out[k] ?? 0) + 1;
  return out;
}

function formatCounts(counts: Record<string, number>, limit = 16): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, n]) => `${k}=${n}`)
    .join(", ");
}

function weekdayOf(iso: string): string {
  const d = new Date(iso);
  return (
    ["dom", "lun", "mar", "mie", "jue", "vie", "sab"][d.getUTCDay()] ?? "?"
  );
}
