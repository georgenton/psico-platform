import { beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { UsersService } from "./users.service";
import { HttpExceptionFilter } from "../shared/filters/http-exception.filter";
import { DATA_EXPORT_RETENTION_DAYS } from "./data-export-retention";

/**
 * What a client actually receives when a data-export download is refused.
 *
 * These assertions run the real exception through the real
 * `HttpExceptionFilter`, because the bug they guard lived in the COMPOSITION,
 * not in either half. `UsersService` threw `{ code, retentionDays }` and the
 * filter rebuilds every response from exactly
 * `{ statusCode, code, message, details?, timestamp, path }` — so the hint was
 * discarded on the way out. A test asserting the thrown object passed happily
 * while the client got nothing, which is how the field survived review and a
 * live smoke caught it instead.
 *
 * The same composition also decided `message`: with an object payload that omits
 * it, Nest derives the literal string "Http Exception", and that is what users
 * were shown.
 */

const userId = "cmql4vasx0000abcdefghijkl";

function makeHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const request = {
    url: "/api/user/data-export/req-1/download",
    method: "GET",
    route: { path: "/api/user/data-export/:id/download" },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("the data-export download error contract, as the client sees it", () => {
  let service: UsersService;
  let filter: HttpExceptionFilter;
  const dataExportRequest = { findUnique: vi.fn(), findFirst: vi.fn() };
  const storage = { getSignedUrl: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    filter = new HttpExceptionFilter();
    service = new UsersService(
      { dataExportRequest } as never,
      storage as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  /** Throw it, filter it, return the body the client would receive. */
  async function bodyFor(row: unknown): Promise<Record<string, unknown>> {
    dataExportRequest.findUnique.mockResolvedValue(row);
    const { host, status, json } = makeHost();
    try {
      await service.getDataExportDownload(userId, "req-1");
      throw new Error("expected the download to be refused");
    } catch (err) {
      filter.catch(err, host);
    }
    expect(json).toHaveBeenCalledTimes(1);
    return {
      ...(json.mock.calls[0]![0] as Record<string, unknown>),
      _httpStatus: status.mock.calls[0]![0],
    };
  }

  it("EXPIRED answers 410 and carries the retention window in details", async () => {
    const body = await bodyFor({
      userId,
      status: "EXPIRED",
      fileUrl: null,
    });

    expect(body._httpStatus).toBe(410);
    expect(body.statusCode).toBe(410);
    expect(body.code).toBe("DATA_EXPORT_EXPIRED");
    // The field that used to be dropped. `details` is the only place the filter
    // carries structured data through, so this is where it has to live.
    expect(body.details).toEqual({
      retentionDays: DATA_EXPORT_RETENTION_DAYS,
    });
    expect(body.details).toEqual({ retentionDays: 30 });
    // Not Nest's generic fallback, which is what an object payload without a
    // `message` produces.
    expect(body.message).not.toBe("Http Exception");
    expect(String(body.message)).toContain("30 days");
  });

  it("NOT_READY answers 409 and carries the current status in details", async () => {
    const body = await bodyFor({
      userId,
      status: "PROCESSING",
      fileUrl: null,
    });

    expect(body._httpStatus).toBe(409);
    expect(body.code).toBe("DATA_EXPORT_NOT_READY");
    expect(body.details).toEqual({ status: "PROCESSING" });
    expect(body.message).not.toBe("Http Exception");
  });

  it("distinguishes PENDING from PROCESSING through the same field", async () => {
    const body = await bodyFor({ userId, status: "PENDING", fileUrl: null });
    expect(body._httpStatus).toBe(409);
    expect(body.details).toEqual({ status: "PENDING" });
  });

  it("a FAILED export is also 409, and says so rather than claiming expiry", async () => {
    const body = await bodyFor({ userId, status: "FAILED", fileUrl: null });
    expect(body._httpStatus).toBe(409);
    expect(body.code).toBe("DATA_EXPORT_NOT_READY");
    expect(body.details).toEqual({ status: "FAILED" });
  });

  it("a stranger's export answers 404 and leaks no state at all", async () => {
    // The ownership check sits ABOVE the expiry check for this reason: an
    // EXPIRED row belonging to somebody else must look exactly like a row that
    // does not exist, or the status becomes an oracle for which ids are real.
    const body = await bodyFor({
      userId: "cmqlzzzzz0009abcdefghijkl",
      status: "EXPIRED",
      fileUrl: "data-exports/cmqlzzzzz0009abcdefghijkl/req-1.json",
    });

    expect(body._httpStatus).toBe(404);
    expect(body.code).toBe("DATA_EXPORT_NOT_FOUND");
    // No `details`, no status, nothing about retention — and crucially nothing
    // that differs from the answer for a missing id.
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("EXPIRED");
    expect(JSON.stringify(body)).not.toContain("retentionDays");
  });

  it("a missing export answers identically to a stranger's", async () => {
    const missing = await bodyFor(null);
    expect(missing._httpStatus).toBe(404);
    expect(missing.code).toBe("DATA_EXPORT_NOT_FOUND");
    expect(missing.details).toBeUndefined();
  });

  it("a legacy row that cannot be served answers 409 with a usable message", async () => {
    const body = await bodyFor({
      userId,
      status: "READY",
      fileUrl: `https://acct.r2.cloudflarestorage.com/bucket/data-exports/${userId}/req-1.json`,
    });

    expect(body._httpStatus).toBe(409);
    expect(body.code).toBe("DATA_EXPORT_UNAVAILABLE");
    expect(body.message).not.toBe("Http Exception");
    // Nothing structured to hand a client here, so no `details` is correct —
    // the absence is deliberate, not another dropped field.
    expect(body.details).toBeUndefined();
  });

  it("never signs anything on any of these paths", async () => {
    for (const row of [
      { userId, status: "EXPIRED", fileUrl: null },
      { userId, status: "PROCESSING", fileUrl: null },
      { userId: "someone-else", status: "READY", fileUrl: "x" },
      null,
    ]) {
      await bodyFor(row);
    }
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });
});
