import { envSchema } from "./env.schema";

/**
 * Keys whose PROVENANCE matters, not just their value.
 *
 * ── Why this exists, and why it has to live here ──────────────────────────
 *
 * `@nestjs/config@4.x` does this, in `ConfigModule.forRoot`:
 *
 *     const validatedConfig = options.validate(config);
 *     this.assignVariablesToProcess(validatedConfig);   // ← defaults included
 *
 * So after the module boots, `process.env.EMAIL_FROM` EXISTS even when nobody
 * set it: Zod produced it from `.default(...)` and Nest copied it back. Reading
 * `process.env` later therefore cannot tell "somebody chose this" from "Zod
 * filled it in" — and a health report that asked `process.env` was answering
 * "chosen" for every box in the fleet.
 *
 * This function is the ONE place that sees the environment BEFORE defaults are
 * applied, because `config` is its input. So the provenance is captured here,
 * once, and travels as an ordinary validated key instead of being re-derived
 * by whoever needs it.
 *
 * The flags are booleans about configuration, never values, so the fact that
 * Nest copies them back into `process.env` carries nothing sensitive.
 */
const PROVENANCE = ["EMAIL_FROM"] as const;

/** `EMAIL_FROM` → `EMAIL_FROM_EXPLICIT`. */
export type ProvenanceFlag = `${(typeof PROVENANCE)[number]}_EXPLICIT`;

function wasExplicit(config: Record<string, unknown>, key: string): boolean {
  const raw = config[key];
  return typeof raw === "string" && raw.trim().length > 0;
}

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  const provenance = Object.fromEntries(
    PROVENANCE.map((key) => [
      `${key}_EXPLICIT` as ProvenanceFlag,
      wasExplicit(config, key),
    ]),
  ) as Record<ProvenanceFlag, boolean>;

  return { ...result.data, ...provenance };
}
