import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { Response } from "express";

/**
 * Adds RFC 8594 / RFC 9745 deprecation headers to every response from the
 * legacy `SubscriptionController` (mounted at `/api/subscriptions/*`).
 *
 * Sprint S11 introduced `/api/billing/*` as the canonical path (per design
 * 09-plan.md). The legacy `/api/subscriptions/*` keeps working for the
 * deprecation window declared below so any external consumer that wired
 * itself up before the rename (mobile app store builds, third-party
 * integrations, the Stripe webhook URL) has time to migrate.
 *
 * Headers we set on every response:
 *   - `Deprecation: true`  (RFC 8594; "true" is the recommended value)
 *   - `Sunset: <RFC 3339>` (RFC 8594; when the endpoint will be removed)
 *   - `Link: </api/billing/*>; rel="successor-version"` (RFC 8288)
 *
 * The Sunset date is computed once at module load (the value lives in this
 * constant) — that way operators reading logs can grep for it and CI can
 * fail loud when the deadline approaches.
 */

// 90 days from the Sprint S11 land date (2026-06-02). Adjust here when
// extending the window; do not split across config files.
export const SUBSCRIPTION_API_SUNSET = "2026-08-31T23:59:59Z";

@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse<Response>();
        res.setHeader("Deprecation", "true");
        res.setHeader("Sunset", SUBSCRIPTION_API_SUNSET);
        res.setHeader(
          "Link",
          '</api/billing>; rel="successor-version"; title="Sprint S11 billing rename"',
        );
      }),
    );
  }
}
