import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Unified error envelope for the entire API.
 *
 * Every error response — whether thrown as HttpException by a handler,
 * surfaced by class-validator, or raised by an unhandled JS exception —
 * comes back to the client as:
 *
 *   {
 *     "statusCode": 400,
 *     "code": "VALIDATION_ERROR",
 *     "message": "email must be an email",
 *     "details": [...],         // optional structured detail
 *     "timestamp": "2026-05-25T16:42:00.000Z",
 *     "path": "/api/auth/register"
 *   }
 *
 * Rationale: the frontend's ApiError class assumes a single, predictable
 * shape. Without this filter NestJS leaks several shapes (HttpException
 * payload, validation array, raw Error.message) and the client has to do
 * type narrowing for each.
 */

interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, code, message, details } = this.normalize(exception);

    // 5xx always logs full stack; 4xx is a user-error signal, log at warn level.
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${statusCode} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} → ${statusCode} ${code}: ${message}`,
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }

  private normalize(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    // NestJS HttpException — preserve its status and use the payload's
    // shape, normalizing across the two forms Nest emits.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // Shape 1: string payload ("Not Found")
      if (typeof payload === "string") {
        return {
          statusCode: status,
          code: this.statusToCode(status),
          message: payload,
        };
      }

      // Shape 2: object payload from class-validator or custom throws.
      // class-validator gives { message: string[], error: string, statusCode }
      if (payload !== null && typeof payload === "object") {
        const obj = payload as Record<string, unknown>;
        const rawMessage = obj.message;
        const isValidationArray = Array.isArray(rawMessage);
        return {
          statusCode: status,
          code:
            typeof obj.code === "string" ? obj.code : this.statusToCode(status),
          message: isValidationArray
            ? (rawMessage as string[]).join("; ")
            : typeof rawMessage === "string"
              ? rawMessage
              : exception.message,
          details: isValidationArray ? rawMessage : obj.details,
        };
      }
    }

    // Unhandled — surface as 500 but never leak the stack to the client.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "Algo salió mal. Inténtalo de nuevo.",
    };
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: "VALIDATION_ERROR",
      [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
      [HttpStatus.FORBIDDEN]: "FORBIDDEN",
      [HttpStatus.NOT_FOUND]: "NOT_FOUND",
      [HttpStatus.CONFLICT]: "CONFLICT",
      [HttpStatus.UNPROCESSABLE_ENTITY]: "UNPROCESSABLE_ENTITY",
      [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMIT_EXCEEDED",
      [HttpStatus.PAYLOAD_TOO_LARGE]: "PAYLOAD_TOO_LARGE",
      [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: "UNSUPPORTED_MEDIA_TYPE",
      [HttpStatus.PAYMENT_REQUIRED]: "PAYMENT_REQUIRED",
      [HttpStatus.INTERNAL_SERVER_ERROR]: "INTERNAL_ERROR",
      [HttpStatus.SERVICE_UNAVAILABLE]: "SERVICE_UNAVAILABLE",
    };
    return map[status] ?? "ERROR";
  }
}
