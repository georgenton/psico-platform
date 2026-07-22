import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { HttpExceptionFilter } from "./http-exception.filter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A handler exception always comes from a route Express MATCHED, so the mock
 * carries the template by default — that is what the filter reports. Pass
 * `route: null` for the router-level 404, where no template exists.
 */
function makeHost(
  url = "/api/test",
  method = "GET",
  route: string | null = url,
): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const request = { url, method, ...(route ? { route: { path: route } } : {}) };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("HttpExceptionFilter", () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    filter = new HttpExceptionFilter();
  });

  // ── 4xx envelope ──────────────────────────────────────────────────────────

  describe("4xx — known HttpException subclasses", () => {
    it.each([
      [new BadRequestException("bad"), 400, "VALIDATION_ERROR"],
      [new UnauthorizedException("nope"), 401, "UNAUTHORIZED"],
      [new ForbiddenException("denied"), 403, "FORBIDDEN"],
      [new NotFoundException("missing"), 404, "NOT_FOUND"],
      [new ConflictException("dup"), 409, "CONFLICT"],
    ])(
      "maps %s to status %i with code %s",
      (exception, expectedStatus, expectedCode) => {
        const { host, status, json } = makeHost();

        filter.catch(exception, host);

        expect(status).toHaveBeenCalledWith(expectedStatus);
        const body = json.mock.calls[0][0];
        expect(body.statusCode).toBe(expectedStatus);
        expect(body.code).toBe(expectedCode);
        expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(body.path).toBe("/api/test");
      },
    );
  });

  // ── class-validator array shape ───────────────────────────────────────────

  describe("BadRequestException with class-validator array", () => {
    it("joins the array into a single message and exposes the array as `details`", () => {
      const { host, json } = makeHost();

      const exception = new BadRequestException({
        message: ["email must be an email", "password must be longer than 8"],
        error: "Bad Request",
        statusCode: 400,
      });

      filter.catch(exception, host);

      const body = json.mock.calls[0][0];
      expect(body.message).toBe(
        "email must be an email; password must be longer than 8",
      );
      expect(body.details).toEqual([
        "email must be an email",
        "password must be longer than 8",
      ]);
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── Custom code override ──────────────────────────────────────────────────

  describe("custom code override", () => {
    it("preserves a `code` field passed in the exception payload", () => {
      const { host, json } = makeHost();

      const exception = new HttpException(
        {
          message: "Quota exceeded",
          code: "QUOTA_EXCEEDED",
        },
        429,
      );

      filter.catch(exception, host);

      const body = json.mock.calls[0][0];
      expect(body.code).toBe("QUOTA_EXCEEDED");
      expect(body.message).toBe("Quota exceeded");
      expect(body.statusCode).toBe(429);
    });
  });

  // ── 5xx unhandled ─────────────────────────────────────────────────────────

  describe("unhandled exceptions", () => {
    it("returns 500 with a generic message; never leaks the original error", () => {
      const { host, status, json } = makeHost("/api/boom", "POST");

      filter.catch(new Error("Database connection lost: postgres://…"), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(500);
      expect(body.code).toBe("INTERNAL_ERROR");
      expect(body.message).toBe("Algo salió mal. Inténtalo de nuevo.");
      expect(body.message).not.toContain("postgres");
      expect(body.path).toBe("/api/boom");
    });
  });

  // ── Envelope shape contract ───────────────────────────────────────────────

  describe("envelope contract", () => {
    it("always returns exactly these keys (no leakage)", () => {
      const { host, json } = makeHost();

      filter.catch(new NotFoundException("x"), host);

      const body = json.mock.calls[0][0];
      const keys = Object.keys(body).sort();
      // `details` is optional — only present for validation arrays
      expect(keys).toEqual([
        "code",
        "message",
        "path",
        "statusCode",
        "timestamp",
      ]);
    });

    it("reports a constant for an UNMATCHED route — no client segment", () => {
      const { host, json } = makeHost(
        "/api/guide/sessions/cmb0real123/cancel?token=secret",
        "POST",
        null, // the router never matched: there is no template to report
      );

      filter.catch(new NotFoundException("x"), host);

      const body = json.mock.calls[0][0];
      expect(body.path).toBe("/api/:unmatched");
      expect(body.path).not.toContain("cmb0real123");
      expect(body.path).not.toContain("secret");
    });
  });
});
