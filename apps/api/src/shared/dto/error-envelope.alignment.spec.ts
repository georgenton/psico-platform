/**
 * Envelope-vs-filter alignment spec.
 *
 * `ErrorEnvelopeDto` is the wire-shape DTO referenced by every controller's
 * `@ApiBadRequestResponse({ type: ErrorEnvelopeDto })` etc. Clients
 * generated from `openapi.json` rely on its shape for type-safe error
 * handling.
 *
 * `HttpExceptionFilter` produces the JSON body that actually ships. If
 * anyone adds a field to the filter without updating the DTO (or vice
 * versa), the OpenAPI doc lies and downstream clients break silently.
 *
 * This spec pins the contract at both ends:
 *
 * 1. Runtime — invoke the filter with representative exceptions, capture
 *    what gets written to `Response.json(body)`, assert the key set is
 *    a subset of the documented envelope fields.
 *
 * 2. Source — parse `error-envelope.dto.ts` and assert it declares exactly
 *    the documented field set. If anyone adds a field to either side
 *    without the other, one of these tests fails loud.
 *
 * The pinned constant `EXPECTED_ENVELOPE_FIELDS` is the single source of
 * truth — update it (and the DTO) when you intentionally evolve the
 * envelope.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpExceptionFilter } from "../filters/http-exception.filter";

// ─── Single source of truth ──────────────────────────────────────────────

const REQUIRED_ENVELOPE_FIELDS = [
  "statusCode",
  "code",
  "message",
  "timestamp",
  "path",
] as const;

const OPTIONAL_ENVELOPE_FIELDS = ["details"] as const;

const ALLOWED_FIELDS = new Set<string>([
  ...REQUIRED_ENVELOPE_FIELDS,
  ...OPTIONAL_ENVELOPE_FIELDS,
]);

// ─── Filter harness ──────────────────────────────────────────────────────

function makeHost(url = "/api/test"): {
  host: ArgumentsHost;
  getBody: () => Record<string, unknown> | null;
} {
  let captured: Record<string, unknown> | null = null;
  const json = vi.fn((body: Record<string, unknown>) => {
    captured = body;
  });
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const request = { url, method: "POST", headers: {} };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, getBody: () => captured };
}

// ─── Runtime alignment ───────────────────────────────────────────────────

describe("ErrorEnvelopeDto — runtime alignment with HttpExceptionFilter", () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    filter = new HttpExceptionFilter();
  });

  it("HttpException(string) → body is a subset of ALLOWED_FIELDS, all required present", () => {
    const { host, getBody } = makeHost("/api/auth/login");
    filter.catch(new NotFoundException("not found"), host);

    const body = getBody();
    expect(body).not.toBeNull();

    for (const f of REQUIRED_ENVELOPE_FIELDS) {
      expect(body, `missing required field "${f}"`).toHaveProperty(f);
    }
    for (const key of Object.keys(body!)) {
      expect(
        ALLOWED_FIELDS,
        `stray wire field "${key}" not declared on ErrorEnvelopeDto`,
      ).toContain(key);
    }
    // Optional: details NOT spread when not provided
    expect(body).not.toHaveProperty("details");
  });

  it("class-validator array → details present, still subset", () => {
    const { host, getBody } = makeHost("/api/auth/register");
    filter.catch(
      new BadRequestException({
        message: ["email must be an email", "password too short"],
        error: "Bad Request",
        statusCode: 400,
      }),
      host,
    );

    const body = getBody();
    expect(body).not.toBeNull();

    for (const f of REQUIRED_ENVELOPE_FIELDS) {
      expect(body).toHaveProperty(f);
    }
    expect(body).toHaveProperty("details");
    expect(Array.isArray(body!.details)).toBe(true);

    for (const key of Object.keys(body!)) {
      expect(ALLOWED_FIELDS).toContain(key);
    }
  });

  it("custom code + details object → propagates both within envelope", () => {
    const { host, getBody } = makeHost();
    filter.catch(
      new HttpException(
        {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "credenciales inválidas",
          details: { attemptsLeft: 2 },
        },
        401,
      ),
      host,
    );

    const body = getBody();
    expect(body).not.toBeNull();
    expect(body!.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(body!.details).toEqual({ attemptsLeft: 2 });

    for (const key of Object.keys(body!)) {
      expect(ALLOWED_FIELDS).toContain(key);
    }
  });

  it("unhandled JS Error → 500 envelope, still subset", () => {
    const { host, getBody } = makeHost();
    filter.catch(new Error("internal pg connection lost"), host);

    const body = getBody();
    expect(body).not.toBeNull();
    expect(body!.statusCode).toBe(500);

    for (const f of REQUIRED_ENVELOPE_FIELDS) {
      expect(body).toHaveProperty(f);
    }
    expect(body).not.toHaveProperty("details");
    for (const key of Object.keys(body!)) {
      expect(ALLOWED_FIELDS).toContain(key);
    }
  });
});

// ─── Source-level drift detection ────────────────────────────────────────

describe("ErrorEnvelopeDto — source declaration drift", () => {
  const dtoSource = readFileSync(
    join(__dirname, "error-envelope.dto.ts"),
    "utf8",
  );

  // Strip block comments so doc examples like `details?: unknown` inside
  // a /** ... */ block don't fool the regex below.
  const sourceNoComments = dtoSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("declares every required envelope field with `!`", () => {
    for (const f of REQUIRED_ENVELOPE_FIELDS) {
      const re = new RegExp(`\\b${f}\\s*!\\s*:`);
      expect(
        sourceNoComments,
        `required field "${f}" must be declared with \`!:\` on ErrorEnvelopeDto`,
      ).toMatch(re);
    }
  });

  it("declares `details` as optional with `?:`", () => {
    expect(sourceNoComments).toMatch(/\bdetails\s*\?\s*:/);
  });

  it("declares no fields outside the documented envelope", () => {
    // Match any `name!: ` or `name?: ` declaration on a line of its own
    // (i.e. class-body property declarations).
    const matches = [
      ...sourceNoComments.matchAll(/^\s*([a-zA-Z_$][\w$]*)\s*([!?])\s*:/gm),
    ];
    const declared = matches.map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0); // sanity — we found something

    for (const name of declared) {
      expect(
        ALLOWED_FIELDS,
        `stray declaration "${name}" on ErrorEnvelopeDto — either remove it from the DTO or add it to REQUIRED/OPTIONAL_ENVELOPE_FIELDS`,
      ).toContain(name);
    }
  });
});
