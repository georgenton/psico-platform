import { z } from "zod";

/**
 * C.0A1 — a LOCAL, closed subset of Railway's config-as-code schema.
 *
 * Provenance and scope, stated so nobody has to guess:
 *
 *   - Source: Railway's official schema, fetched once from
 *     `https://railway.com/railway.schema.json` (301 →
 *     `backboard.railway.app`), sha256
 *     `38d35a7de8d6fa511895abbcf9a2cac49a12494fd6a9cd2d4228a5b2a8af5e5f`
 *     (8510 bytes), on 2026-08-17. Both files validated against it with
 *     `ajv --spec=draft7`: valid.
 *   - This is a POLICY schema, not a compatibility proof. It says what WE
 *     allow; the official document says what Railway accepts. The two are
 *     recorded separately (LOCAL_POLICY_SCHEMA_VALIDATION vs
 *     OFFICIAL_RAILWAY_SCHEMA_VALIDATION) because passing this one says
 *     nothing about the other.
 *   - Deliberately NOT fetched at test time: a CI job that depends on a remote
 *     download fails when the network does, and a schema that can change under
 *     us is not a ratchet.
 *   - Deliberately a SUBSET. It covers exactly the fields these two files
 *     govern. `.strict()` is the point: a key Railway supports but we have not
 *     approved — `cronSchedule`, `dockerfilePath`, `overlapSeconds`,
 *     `multiRegionConfig`, an `environments` override — fails validation
 *     rather than sliding in unnoticed. Widening it is a deliberate edit.
 *   - Zod is already a dependency of this workspace (`src/config/env.schema.ts`
 *     validates the environment with it), so nothing new is introduced.
 */

/** Builders we accept. Railway supports more; we run exactly one. */
const Builder = z.literal("RAILPACK");

/**
 * A single approved command — no chaining.
 *
 * The pre-deploy used to be `migrate:deploy && prisma db seed`, and that `&&`
 * is precisely how a schema migration and a rewrite of curated content came to
 * ship as one step. Shell metacharacters are rejected so a second command
 * cannot be appended to an otherwise-approved string.
 */
const SingleCommand = z
  .string()
  .min(1)
  .refine((v) => !/&&|\|\||[;|&]|\$\(|`/.test(v), {
    message:
      "command must be a single command with no chaining or substitution",
  });

const BuildBlock = z
  .object({
    builder: Builder,
    // Exempt from the no-chaining rule by necessity: "install, then build" is
    // one logical step Railway has no other way to express. It is pinned by
    // exact equality in the contract spec, so it cannot grow either.
    buildCommand: z.string().min(1),
    watchPatterns: z.array(z.string().min(1)).min(1),
  })
  .strict();

const DeployBlock = z
  .object({
    startCommand: SingleCommand,
    // Absent on the worker; exactly one element on the API.
    preDeployCommand: z.array(SingleCommand).min(1).optional(),
    healthcheckPath: z.string().startsWith("/").optional(),
    restartPolicyType: z.enum(["ALWAYS", "ON_FAILURE", "NEVER"]),
    restartPolicyMaxRetries: z.number().int().nonnegative(),
    // Governable from config-as-code (it is in the official `deploy` schema),
    // so it is declared rather than left to a default we merely assume.
    sleepApplication: z.boolean(),
  })
  .strict();

export const RailwayServiceConfigSchema = z
  .object({
    $schema: z.string().url(),
    build: BuildBlock,
    deploy: DeployBlock,
  })
  .strict();

export type RailwayServiceConfig = z.infer<typeof RailwayServiceConfigSchema>;
