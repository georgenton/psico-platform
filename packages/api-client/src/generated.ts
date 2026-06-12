/**
 * AUTO-GENERATED from apps/api/openapi.json.
 * DO NOT EDIT MANUALLY — run `pnpm --filter @psico/api-client generate` instead.
 *
 * Source of truth: NestJS controllers in apps/api/src/**.
 * Pipeline owner: Sprint 0.B · ADR 0008.
 */
/* eslint-disable */
// @ts-nocheck

export interface paths {
    "/api/notifications/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register an Expo push token for the current user. Idempotent on (token). */
        post: operations["DevicesController_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/devices/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoke a push token. No-op if id doesn't exist. */
        delete: operations["DevicesController_unregister"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register a new account (email + password) */
        post: operations["AuthController_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login with email + password */
        post: operations["AuthController_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rotate refresh token, get new access token
         * @description The presented refresh token is invalidated; a new pair is issued.
         */
        post: operations["AuthController_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke the presented refresh token */
        post: operations["AuthController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/forgot-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request a password reset email (no-leak, always 200) */
        post: operations["AuthController_forgotPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset password using a token from email */
        post: operations["AuthController_resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify email using a token from registration email */
        post: operations["AuthController_verifyEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/oauth/google": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in / register with a Google ID token
         * @description Verifies the token against Google's public keys, then issues our own access + refresh pair.
         */
        post: operations["AuthController_oauthGoogle"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BooksController_list"];
        put?: never;
        post: operations["BooksController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/recos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BooksController_getRecos"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BooksController_getCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/authors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BooksController_getAuthors"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/{idOrSlug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BooksController_getDetail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/{idOrSlug}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BooksController_listReviews"];
        put?: never;
        post: operations["BooksController_createReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/{idOrSlug}/favorite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["BooksController_toggleFavorite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/{idOrSlug}/bookmark": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["BooksController_toggleBookmark"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/{idOrSlug}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["BooksController_startBook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["BooksController_update"];
        trace?: never;
    };
    "/api/books/{slug}/chapters/{order}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ChaptersController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/{slug}/chapters": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ChaptersController_createChapter"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/books/{slug}/chapters/{order}/audio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ChaptersController_uploadAudio"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/progress/{chapterId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ProgressController_markCompleted"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/progress": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ProgressController_getUserProgress"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/home": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["HomeController_getHome"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/mood": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["UsersController_updateMood"];
        trace?: never;
    };
    "/api/reflection-prompts/{id}/dismiss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["HomeController_dismissPrompt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diario/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["DiarioController_list"];
        put?: never;
        post: operations["DiarioController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diario/prompt-of-the-day": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["DiarioController_getPromptOfTheDay"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diario/entries/raw-ciphers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["DiarioController_listRawCiphers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/diario/entries/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["DiarioController_getDetail"];
        put?: never;
        post?: never;
        delete: operations["DiarioController_remove"];
        options?: never;
        head?: never;
        patch: operations["DiarioController_update"];
        trace?: never;
    };
    "/api/diario/entries/{id}/share": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["DiarioController_share"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subscriptions/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SubscriptionController_getPlans"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subscriptions/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SubscriptionController_getMySubscription"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subscriptions/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SubscriptionController_createCheckoutSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subscriptions/portal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SubscriptionController_createPortalSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subscriptions/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SubscriptionController_getUsage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subscriptions/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["SubscriptionController_listInvoices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subscriptions/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SubscriptionController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subscriptions/reactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SubscriptionController_reactivate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/subscriptions/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["SubscriptionController_handleWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BillingController_getPlans"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BillingController_getMySubscription"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BillingController_getUsage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BillingController_listInvoices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/checkout-session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["BillingController_createCheckoutSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/customer-portal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["BillingController_createPortalSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/return": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Callback the user's browser hits after Stripe Checkout. The front
         *     passes back the `session_id` Stripe appended to `successUrl`.
         *
         *     We do NOT mutate the user's plan here — the Stripe webhook is the
         *     canonical write path. This handler just confirms the result so the
         *     front can show success/processing/failed immediately without polling.
         */
        get: operations["BillingController_getReturn"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/subscription": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["BillingController_patchSubscription"];
        trace?: never;
    };
    "/api/billing/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["BillingController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/reactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["BillingController_reactivate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/billing/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["BillingController_handleWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PlanController_getPlan"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liveness check
         * @description Returns 200 with a timestamp. Exposed at /health (not /api/health) so external uptime monitors can keep a stable URL. Opted out of rate limiting via @SkipThrottle().
         */
        get: operations["HealthController_check"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ai/chat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AIController_chat"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ai/conversations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AIController_getConversations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ai/conversations/{id}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AIController_getMessages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ai/ingest/{bookId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AIController_ingestBook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["UsersController_getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["UsersController_updateProfile"];
        trace?: never;
    };
    "/api/user/timezone": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["UsersController_updateTimezone"];
        trace?: never;
    };
    "/api/user/avatar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["UsersController_uploadAvatar"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["UsersController_updatePreferences"];
        trace?: never;
    };
    "/api/user/reader-preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["UsersController_updateReaderPreferences"];
        trace?: never;
    };
    "/api/user/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["UsersController_updateNotifications"];
        trace?: never;
    };
    "/api/user/privacy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["UsersController_updatePrivacy"];
        trace?: never;
    };
    "/api/user/email-change-request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["UsersController_requestEmailChange"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/password-change": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["UsersController_changePassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/password-change-with-rekey": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["UsersController_changePasswordWithRekey"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/crypto-seed-acknowledged": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["UsersController_acknowledgeCryptoSeed"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/data-export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["UsersController_requestDataExport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/user/delete-request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["UsersController_requestDelete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/intro": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Step 0 · Marina's intro copy */
        get: operations["OnboardingController_getIntro"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/skip": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Skip onboarding entirely; mark state as skipped */
        post: operations["OnboardingController_skip"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/motivos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Step 1 · Catalog of motivos (reasons to be here) */
        get: operations["OnboardingController_getMotivos"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/step1": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Step 1 · Save chosen motivos */
        post: operations["OnboardingController_step1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/moods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Step 2 · Catalog of moods */
        get: operations["OnboardingController_getMoods"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/step2": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Step 2 · Save initial mood (also sets User.mood) */
        post: operations["OnboardingController_step2"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/step3": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Step 3 · Save firstName + voicePreference
         * @description Writes firstName to User and voicePreference to UserPreferences. OnboardingState captures an immutable audit of the original picks.
         */
        post: operations["OnboardingController_step3"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/recommendation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Step 4 · Book recommendation based on chosen motivos */
        get: operations["OnboardingController_recommendation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark onboarding complete; record chosen book (if any) */
        post: operations["OnboardingController_complete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/tour": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** UI tour steps (post-onboarding overlay) */
        get: operations["OnboardingController_getTour"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/onboarding/tour/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark UI tour as completed */
        post: operations["OnboardingController_completeTour"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/voz/transcribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Audio in (multipart `audio` field), transcript out. Plan-gated at the
         *     service layer (FREE → 403 VOICE_REQUIRES_PRO; quota exhausted →
         *     402 VOICE_QUOTA_EXCEEDED) and rate-limited here to 10/min/user — voice
         *     transcription is expensive both server-side and at the provider, so
         *     we cap aggressively even for Pro users.
         */
        post: operations["VoiceController_transcribe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/voz/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * `/voz/usage` from docs/design/handoff/07-voz.md. v1 is informational —
         *     the server already counted seconds on `/transcribe`. The client posts
         *     its own measurement so the server can cross-check and return the
         *     authoritative remaining-minutes value back.
         */
        post: operations["VoiceController_reportUsage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/eco/caps": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EcoController_getCaps"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/eco/threads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EcoController_listThreads"];
        put?: never;
        post: operations["EcoController_createThread"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/eco/threads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EcoController_getThread"];
        put?: never;
        post?: never;
        delete: operations["EcoController_deleteThread"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/eco/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EcoController_sendMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/eco/messages/{id}/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EcoController_reportMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lector/{bookId}/{chapterOrder}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LectorController_getChapter"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lector/{bookId}/{chapterOrder}/audio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["LectorController_getAudio"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lector/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["LectorController_heartbeat"];
        trace?: never;
    };
    "/api/lector/{bookId}/{chapterOrder}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["LectorController_complete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/highlights": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["HighlightsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/highlights/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["HighlightsController_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/annotations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AnnotationsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/annotations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["AnnotationsController_delete"];
        options?: never;
        head?: never;
        patch: operations["AnnotationsController_update"];
        trace?: never;
    };
    "/api/patrones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PatronesController_getPatrones"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/patrones/weekly-summary/regenerate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PatronesController_regenerate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/patrones/share-with-therapist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PatronesController_shareWithTherapist"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/reports/eco/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Counts of Eco message reports grouped by reason. Default scope: open reports only. */
        get: operations["PulsoController_getSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/reports/eco": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Eco message reports, newest-first. Supports cursor pagination, reason filter, and status (open|resolved|all). */
        get: operations["PulsoController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/reports/eco/{id}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark an Eco report as triaged. Idempotent: re-resolving overwrites the timestamp and admin/note. */
        post: operations["PulsoController_resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/reports/eco/{id}/unresolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reopen a previously-resolved report. Clears resolvedAt/By/Note. */
        post: operations["PulsoController_unresolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Platform overview — KPIs aggregated across users, engagement, content, and business. Cached 5min. */
        get: operations["PulsoController_getOverview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/cohorts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Cohort retention triangle. Materialised by the Monday 03:00 UTC cron; cached 5min. */
        get: operations["PulsoController_getCohorts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/author-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List author publication requests. Default scope: PENDING only. */
        get: operations["PulsoController_listAuthorRequests"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/author-requests/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve a pending author publication request. Triggers copy-on-publish AuthorBook → Book + Chapter + ChapterBlock. */
        post: operations["PulsoController_approveAuthorRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/author-requests/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject a pending author publication request with optional editorial feedback. Sets AuthorBook back to DRAFT. */
        post: operations["PulsoController_rejectAuthorRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search users by email/name + optional role filter. */
        get: operations["PulsoController_listUsers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/users/{id}/role-changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Last 20 role changes for a user (audit trail). */
        get: operations["PulsoController_getRoleChanges"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/users/{id}/role": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Change a user's role. Logged in RoleChangeLog for audit. */
        post: operations["PulsoController_changeRole"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/push/live-activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register a per-activity APNs push token from iOS ActivityKit. Idempotent on (userId, activityId). */
        post: operations["LiveActivitiesController_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/push/live-activity/active": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List currently-active Live Activities. */
        get: operations["LiveActivitiesController_listActive"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/push/live-activity/{activityId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Mark a Live Activity as dismissed. Sends APNs 'end' event if configured. */
        delete: operations["LiveActivitiesController_dismiss"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/crisis": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Líneas de crisis por país. PÚBLICO sin auth (decisión ética del diseño). */
        get: operations["TerapiaController_getCrisis"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/crisis/log": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Auditoría de uso del flujo de crisis. Sin contenido sensible. Auth opcional. */
        post: operations["TerapiaController_logCrisis"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/hub": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Landing del usuario en Terapia. */
        get: operations["TerapiaController_getHub"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/therapists/filters": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Opciones disponibles para los filtros del directorio. */
        get: operations["TerapiaController_getFilters"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/therapists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Directorio paginado de terapeutas activos. Soporta filtros + sort. */
        get: operations["TerapiaController_listTherapists"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/therapists/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalle de un terapeuta. */
        get: operations["TerapiaController_getTherapist"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/therapists/{id}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Reseñas paginadas de un terapeuta. */
        get: operations["TerapiaController_listReviews"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/therapists/{id}/favorite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Toggle de favorito sobre un terapeuta. */
        post: operations["TerapiaController_toggleFavorite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/therapists/{id}/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Slots disponibles del terapeuta proyectados sobre los próximos 14 días. */
        get: operations["TerapiaController_getAvailability"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/bookings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reservar una sesión. v1: crea la session en SCHEDULED + PENDING; Stripe wiring llega en S65. */
        post: operations["TerapiaController_createBooking"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/sessions/{id}/prep": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado de pre-sesión. */
        get: operations["TerapiaController_getSessionPrep"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Actualizar pre-sesión (intentionCiphertext E2E, mood, entradas compartidas). */
        patch: operations["TerapiaController_updateSessionPrep"];
        trace?: never;
    };
    "/api/terapia/sessions/{id}/join": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Emite token de sala. Solo válido en window [-5min, +duration+15min]. */
        post: operations["TerapiaController_joinSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/sessions/{id}/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cierra sesión con feedback. rating 1-5 + tags categóricos + noteCiphertext E2E opcional. */
        post: operations["TerapiaController_submitFeedback"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/sessions/{id}/technical-report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reportar un problema técnico durante (o después) de la sesión. */
        post: operations["TerapiaController_reportTechnical"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Mis sesiones — envelope {upcoming, past}. Filtro opcional por status. */
        get: operations["TerapiaController_listSessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/prescriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Mis recetas activas (lo que sugirió el terapeuta). */
        get: operations["TerapiaController_listPrescriptions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/prescriptions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Marcar receta como completada / incompleta. */
        patch: operations["TerapiaController_updatePrescription"];
        trace?: never;
    };
    "/api/terapia/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Notificaciones del usuario en Terapia. */
        get: operations["TerapiaController_listNotifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/notifications/{id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Marcar una notificación como leída. Idempotente. */
        patch: operations["TerapiaController_markNotificationRead"];
        trace?: never;
    };
    "/api/terapia/notifications/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Marcar todas las notificaciones como leídas. */
        post: operations["TerapiaController_markAllNotificationsRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/sessions/{id}/reschedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Re-agendar sesión a un slot libre del mismo terapeuta. Solo SCHEDULED. */
        patch: operations["TerapiaController_rescheduleSession"];
        trace?: never;
    };
    "/api/terapia/sessions/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancelar sesión SCHEDULED. Refund pedido al ops. */
        post: operations["TerapiaController_cancelSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/terapia/bookings/{id}/retry-checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Emitir un nuevo Stripe Checkout para una session PENDING. Útil tras fallo o cierre del tab. */
        post: operations["TerapiaController_retryCheckout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/dashboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dashboard del autor: libros, plantillas, IA. */
        get: operations["AuthorController_dashboard"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/libros": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Crear un libro borrador. */
        post: operations["AuthorController_createBook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/libros/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Meta del libro + estructura de capítulos. */
        get: operations["AuthorController_getBook"];
        put?: never;
        post?: never;
        /** Archivar libro (soft-delete). */
        delete: operations["AuthorController_archiveBook"];
        options?: never;
        head?: never;
        /** Editar meta del libro. */
        patch: operations["AuthorController_updateBook"];
        trace?: never;
    };
    "/api/autor/libros/{id}/capitulos/{n}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Obtener capítulo en edición. */
        get: operations["AuthorController_getChapter"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Editar capítulo. Concurrency: envia expectedVersion para detectar conflicts. */
        patch: operations["AuthorController_updateChapter"];
        trace?: never;
    };
    "/api/autor/libros/{id}/estructura": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Reordenar / renombrar / eliminar capítulos en una sola operación atómica. */
        patch: operations["AuthorController_updateStructure"];
        trace?: never;
    };
    "/api/autor/libros/{id}/publicacion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado del checklist de publicación. */
        get: operations["AuthorController_getPublicationState"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/libros/{id}/publicar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Enviar el libro a revisión. Valida los blockers del checklist primero. */
        post: operations["AuthorController_submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/libros/{id}/despublicar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Quitar el libro del catálogo (vuelve a DRAFT). */
        post: operations["AuthorController_unpublish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/libros/{id}/cover-image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sube la portada del libro (JPG/PNG/WebP, máx 5MB) al storage R2 + guarda la URL en AuthorBook.coverArtUrl. */
        post: operations["AuthorController_uploadCover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/libros/{id}/capitulos/{n}/audio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sube audio del capítulo (MP3/M4A/WAV/WEBM/OGG, máx 50MB) y lo agrega como bloque AUDIO al final del capítulo. */
        post: operations["AuthorController_uploadChapterAudio"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/libros/{id}/ai-help": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** AI helpers: revisar tono, sugerir ejemplo, cambiar tono, simplificar. Returns the suggested text as a single JSON response. */
        post: operations["AuthorController_aiHelp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/cobros": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Vista del autor sobre sus ingresos: YTD / último mes / pendiente + breakdown mensual + configuración de payout. */
        get: operations["AuthorController_getCobros"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/autor/cobros/configuracion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Actualiza el método y datos de cobro del autor. Upsert idempotente. */
        patch: operations["AuthorController_updatePayoutSettings"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ErrorEnvelopeDto: {
            /** @description HTTP status code, e.g. 400, 401, 404, 422, 500. */
            statusCode: number;
            /**
             * @description Machine-readable error code (SCREAMING_SNAKE_CASE), e.g.
             *     `VALIDATION_ERROR`, `AUTH_INVALID_CREDENTIALS`, `RATE_LIMIT_EXCEEDED`.
             *     Stable contract — clients branch on this, not `message`.
             */
            code: string;
            /** @description Human-readable summary. Safe to surface to end-users. */
            message: string;
            /**
             * @description Optional structured detail. For `VALIDATION_ERROR` this is the array of
             *     class-validator constraint failures; for other codes it may carry
             *     domain-specific context.
             */
            details?: Record<string, never>;
            /** @description ISO-8601 server timestamp at error time. */
            timestamp: string;
            /** @description Request path that produced the error, e.g. `/api/auth/login`. */
            path: string;
        };
        RegisterDeviceDto: {
            /** @enum {string} */
            platform: RegisterDeviceDtoPlatform;
            token: string;
            deviceLabel?: string;
        };
        RegisterDto: {
            /**
             * Format: email
             * @description The user's email address. Must be a valid RFC 5321 address. Used as
             *     the unique login identifier and as the destination for verification
             *     + password-reset emails.
             */
            email: string;
            /**
             * @description Password (8–72 characters). Bcrypt silently truncates anything past
             *     72 bytes, so the upper bound is enforced explicitly to surface that
             *     truncation as a validation error instead of a silent confidence
             *     downgrade.
             *
             *     The server hashes with bcrypt before persisting; the raw password
             *     never reaches storage and never appears in any log.
             */
            password: string;
            /**
             * @description Display name (2–100 chars). Shown in the UI and in transactional
             *     emails. Not used for authentication.
             */
            name: string;
        };
        AuthUserDto: {
            /** @description Stable opaque user ID (UUID v4). */
            id: string;
            /** @description Login email. Always lowercase as stored. */
            email: string;
            /** @description Display name shown in the UI and in transactional emails. */
            name: string;
            /**
             * @description Authorization role: typically `"USER"`. Other values: `"AUTHOR"`,
             *     `"PSYCHOLOGIST"`, `"ADMIN"`. Frontend uses this to show admin /
             *     author surfaces.
             */
            role: string;
            /**
             * @description Active plan tier: `"FREE"`, `"PRO"`, `"ANNUAL"`, or `"B2B"`. Gates
             *     Pro-only features in the UI; the API also re-enforces server-side.
             */
            plan: string;
            /**
             * @description base64url-encoded 16-byte Argon2id salt used by the client to derive
             *     the E2E master key (ADR 0007 §A). NOT a secret — useless without the
             *     password. `null` for legacy accounts created before Sprint S6-crypto;
             *     the server backfills it on next login so this value stops being
             *     `null` for an account after one successful login.
             */
            cryptoSalt: string | null;
        };
        AuthResponseDto: {
            /**
             * @description Short-lived JWT (~15 min). Send as
             *     `Authorization: Bearer <token>` on every authenticated request.
             */
            accessToken: string;
            /**
             * @description Long-lived JWT (~30 days), single-use. POST to `/auth/refresh` to
             *     exchange for a new access+refresh pair. The presented refresh token
             *     is invalidated atomically on rotation.
             */
            refreshToken: string;
            /** @description The authenticated user's public profile. */
            user: components["schemas"]["AuthUserDto"];
        };
        LoginDto: {
            /**
             * Format: email
             * @description The email used at registration.
             */
            email: string;
            /**
             * @description The user's password. Never logged, never echoed back. The server
             *     compares against the bcrypt hash and discards the plaintext after.
             */
            password: string;
        };
        RefreshDto: {
            refreshToken: string;
        };
        ForgotPasswordDto: {
            /** Format: email */
            email: string;
        };
        ResetPasswordDto: {
            /**
             * @description Raw reset token from the email link, base64url 32–128 chars. The
             *     server hashes (SHA-256) before lookup — the raw token only ever
             *     touches the email and this request body.
             */
            token: string;
            /**
             * @description New password (8–72 characters). Bcrypt silently truncates anything
             *     past 72 bytes, so the upper bound is enforced explicitly to surface
             *     that as a validation error.
             *
             *     The server hashes with bcrypt before persisting; raw plaintext never
             *     touches storage or logs. The previous password hash is overwritten —
             *     there is no history.
             */
            newPassword: string;
        };
        VerifyEmailDto: {
            token: string;
        };
        OAuthGoogleDto: {
            /**
             * @description Google ID token (JWT) obtained client-side from Google Identity
             *     Services (web) or Google Sign-In SDK (mobile). The backend verifies
             *     the signature against Google's public keys via `google-auth-library`
             *     — no Passport redirect flow.
             *
             *     Typical length: ~1000–1500 characters. The token is single-use from
             *     our perspective: we extract identity claims and discard.
             */
            idToken: string;
        };
        CreateBookReviewDto: {
            rating: number;
            text: string;
        };
        CreateBookDto: {
            slug: string;
            title: string;
            description?: string;
            /** Format: uri */
            coverUrl?: string;
            /** @enum {string} */
            plan: CreateBookDtoPlan;
        };
        UpdateBookDto: {
            isPublished?: boolean;
        };
        CreateChapterDto: {
            order: number;
            title: string;
            description?: string;
            durationMinutes?: number;
        };
        UploadAudioDto: {
            title: string;
            durationSeconds: number;
        };
        MarkProgressDto: {
            score?: number;
        };
        UpdateUserMoodBodyDto: {
            moodId: string;
        };
        CreateDiaryEntryDto: {
            /**
             * @description Mood token from the shared `DIARY_MOODS` catalog (calma / foco /
             *     energia / …). Used for the patterns analytics (heatmap, hourly
             *     distribution) — visible to the server in plaintext by design.
             *
             *     The plugin auto-emits the enum in OpenAPI from the `@IsIn`.
             * @enum {string}
             */
            mood: CreateDiaryEntryDtoMood;
            /**
             * @description Origin of the entry. `"free"` for user-initiated, `"prompted"` for a
             *     journal-prompt response, `"voz"` for a voice-to-text dictation.
             *     Default `"free"` if omitted.
             * @enum {string}
             */
            kind?: CreateDiaryEntryDtoKind;
            /**
             * @description The `DiaryPrompt.id` the user is responding to, when `kind="prompted"`.
             *     Up to 64 chars to allow opaque server-side identifiers.
             */
            promptId?: string;
            /**
             * @description The XChaCha20-Poly1305 ciphertext of the entry body, base64url-encoded.
             *     Encrypted client-side under a per-user subkey derived via HKDF from
             *     the master key. Server never decrypts. Bounded at ~1.4 MB ciphertext
             *     (≈1 MB plaintext) — anything bigger is a UI bug.
             */
            textCiphertext: string;
            /**
             * @description The 24-byte XChaCha20 nonce that pairs with `textCiphertext`,
             *     base64url-encoded. Must be unique per (key, write) — the client
             *     generates a fresh random nonce on every encryption (server doesn't
             *     enforce uniqueness; the client invariant is documented in ADR 0007 §C).
             */
            textNonce: string;
            /**
             * @description Optional preview ciphertext, used by the list view to render a short
             *     snippet without decrypting the full body. Bounded the same way as
             *     `textCiphertext`. Short entries may omit it.
             */
            excerptCiphertext?: string;
            /**
             * @description The 24-byte XChaCha20 nonce for `excerptCiphertext`. Required IF
             *     `excerptCiphertext` is provided.
             */
            excerptNonce?: string;
            /**
             * @description Up to 12 plain-text tags (each 1–32 chars). Plaintext by design — the
             *     patterns module clusters by tag for the weekly summary. Users should
             *     NOT include private info in tags (the UI nudges them toward
             *     categorical labels like `trabajo` / `familia` / `sueño`).
             */
            tags?: string[];
            /**
             * Format: uri
             * @description R2 signed URL for an attached voice recording. The audio itself is
             *     NOT stored long-term — the Voice module discards it post-transcription
             *     (07-voz.md). Persisted in the entry for replay during the active
             *     session only.
             */
            audioUrl?: string;
            /** @description Duration in seconds of the attached voice recording, when present. */
            audioDurationSec?: number;
        };
        UpdateDiaryEntryDto: {
            /**
             * @description New mood token from the shared `DIARY_MOODS` catalog. Server uses
             *     it for the patterns analytics — visible in plaintext by design.
             *     Plugin emits the enum in OpenAPI from `@IsIn`.
             * @enum {string}
             */
            mood?: UpdateDiaryEntryDtoMood;
            /**
             * @description New XChaCha20-Poly1305 ciphertext of the entry body, base64url-encoded.
             *     Encrypted client-side under the diary subkey derived via HKDF from
             *     the master key. Server never decrypts.
             *
             *     If sent, `textNonce` MUST also be sent (paired write).
             */
            textCiphertext?: string;
            /**
             * @description Fresh 24-byte XChaCha20 nonce paired with `textCiphertext`,
             *     base64url-encoded. Must be a new random nonce — reusing the previous
             *     nonce under the same key catastrophically breaks confidentiality
             *     (XChaCha20 invariant).
             *
             *     If sent, `textCiphertext` MUST also be sent.
             */
            textNonce?: string;
            /**
             * @description New preview ciphertext for the list view. Same pairing rules as
             *     `textCiphertext`/`textNonce` — sending one requires sending the other.
             */
            excerptCiphertext?: string;
            /**
             * @description Fresh 24-byte XChaCha20 nonce paired with `excerptCiphertext`. Required
             *     if `excerptCiphertext` is sent.
             */
            excerptNonce?: string;
            /**
             * @description Replacement tag set (up to 12, each 1–32 chars). Plaintext by
             *     design — used by the patterns module to cluster entries for the
             *     weekly summary. The UI nudges users to categorical labels (e.g.
             *     `trabajo` / `familia` / `sueño`) and explicitly NOT to put private
             *     info here.
             */
            tags?: string[];
        };
        ShareDiaryEntryDto: {
            therapistId: string;
            ciphertextForTherapist: string;
            wrappedKey: string;
            userOneShotPubKey: string;
            /** @description Optional shorter expiry. Server caps at 30 days; default 7. */
            expiresAt?: string;
        };
        CreateCheckoutSessionDto: {
            /** @enum {string} */
            billingPlan: CreateCheckoutSessionDtoBillingPlan;
            /** Format: uri */
            successUrl: string;
            /** Format: uri */
            cancelUrl: string;
        };
        CreatePortalSessionDto: {
            /** Format: uri */
            returnUrl: string;
        };
        CancelSubscriptionDto: {
            reason?: string;
        };
        PatchSubscriptionDto: {
            action: Record<string, never>;
            /** @description Free-text reason for cancellation. Captured for retention analytics. */
            reason?: string;
            /**
             * @description Only required when action === "switch-plan".
             * @enum {string}
             */
            newPlanId?: PatchSubscriptionDtoNewPlanId;
        };
        ChatRequestDto: {
            message: string;
            conversationId?: string;
        };
        UpdateProfileDto: {
            /**
             * @description Display first name shown in the home greeting and in transactional
             *     emails. 1–100 chars. The `name` field (legacy full display name) is
             *     not editable here.
             */
            firstName?: string;
            /**
             * @description Free-text city. Plaintext — used to size therapy listings by
             *     proximity. Pass `null` to clear. Max 100 chars.
             */
            city?: string | null;
            /**
             * @description ISO 3166-1 alpha-2 country code (exactly 2 chars, e.g. `"EC"`,
             *     `"PE"`). Used by `/terapia/crisis` to pick the right hotline. Pass
             *     `null` to clear — the service then falls back to a generic
             *     international list.
             */
            country?: string | null;
            /**
             * Format: uri
             * @description R2 signed URL to the user's avatar image. Set by the avatar upload
             *     endpoint (`POST /user/avatar`); callers can also pass `null` to
             *     clear and revert to initials-based fallback.
             */
            avatarUrl?: string | null;
        };
        UpdateTimezoneDto: {
            timezone: string;
        };
        UpdatePreferencesDto: {
            /** @enum {string} */
            voicePreference?: UpdatePreferencesDtoVoicePreference;
            moodPrompts?: boolean;
            /** @enum {string} */
            bestTime?: UpdatePreferencesDtoBestTime;
            weeklyGoalMinutes?: number;
            /** @enum {string} */
            theme?: UpdatePreferencesDtoTheme;
            /** @enum {string} */
            language?: UpdatePreferencesDtoLanguage;
        };
        UpdateReaderPreferencesDto: {
            /** @enum {string} */
            font?: UpdateReaderPreferencesDtoFont;
            fontSize?: number;
            /** @enum {string} */
            theme?: UpdateReaderPreferencesDtoTheme;
            lineHeight?: number;
        };
        UpdateNotificationsDto: {
            /**
             * @description If `true`, the inactive-nudge processor may push a daily reminder at
             *     `reminderTime` local. Also gates the weekly-digest push companion
             *     (the email itself is governed by `weeklyReport`).
             */
            dailyReminder?: boolean;
            /**
             * @description Local hour for daily/weekly notifications, format `HH:MM` 24h
             *     (e.g. `"07:00"`, `"19:30"`). Interpreted in the user's
             *     `Profile.timezone` (Sprint S53); legacy users without a timezone
             *     fall back to UTC.
             */
            reminderTime?: string;
            /**
             * @description Push notifications celebrating streak milestones (3-day, 7-day,
             *     30-day, etc). Separate from `dailyReminder` so users can keep the
             *     habit nudge but mute the celebrations.
             */
            streakReminders?: boolean;
            /**
             * @description Push notifications when Eco posts a reply (e.g. async LLM finishes
             *     a long generation). v1 SSE streams to the live tab, so this only
             *     fires for closed-app + Live Activities flows.
             */
            ecoReplies?: boolean;
            /**
             * @description Push + email reminders for upcoming therapy sessions (24h, 1h before
             *     the slot). Only firing while the user has at least one SCHEDULED
             *     session.
             */
            terapiaReminders?: boolean;
            /**
             * @description Monday-morning email digest summarising the prior week (entries
             *     count, mood distribution, top tags, optional LLM-backed narrative
             *     if available). Push companion to the digest is gated by
             *     `dailyReminder` — the email itself flips with this flag alone.
             */
            weeklyReport?: boolean;
        };
        UpdatePrivacyDto: {
            shareDiaryWithTherapist?: boolean;
            anonymizedAnalytics?: boolean;
            marketingEmail?: boolean;
        };
        UpdateMoodDto: {
            /**
             * @description Wellness mood token (`great` / `good` / `meh` / `bad` / …). One of
             *     `WELLNESS_MOOD_IDS`. Unknown tokens are rejected with 400 by `@IsIn`.
             * @enum {string}
             */
            mood: UpdateMoodDtoMood;
        };
        EmailChangeRequestDto: {
            /** Format: email */
            newEmail: string;
        };
        PasswordChangeDto: {
            currentPassword: string;
            newPassword: string;
        };
        ReencryptedEntryDto: {
            /**
             * @description Server ID of the existing `DiaryEntry`. Must belong to the
             *     authenticated user — service enforces ownership and throws
             *     400 ENTRY_NOT_OWNED if any ID in the array doesn't match.
             */
            id: string;
            /**
             * @description New XChaCha20-Poly1305 ciphertext of the entry body, base64url-encoded.
             *     Replaces the entry's `textCiphertext` atomically inside the
             *     transaction.
             */
            textCiphertext: string;
            /**
             * @description Fresh 24-byte XChaCha20 nonce for `textCiphertext`. Must be a new
             *     random value — reusing the old nonce under the new key would still
             *     be fine cryptographically (different key) but loses the nonce-uniqueness
             *     habit clients should keep.
             */
            textNonce: string;
            /**
             * @description Optional re-encrypted preview ciphertext (used by the list view).
             *     Required if the entry had an excerpt cipher before; the client
             *     decides based on the existing entry.
             */
            excerptCiphertext?: string;
            /**
             * @description Fresh nonce for `excerptCiphertext`. Required if `excerptCiphertext`
             *     is provided.
             */
            excerptNonce?: string;
        };
        PasswordChangeWithRekeyDto: {
            /**
             * @description Current password (plaintext, used only to verify bcrypt match before
             *     the rekey). Never logged. Not the same as `newPassword`.
             */
            currentPassword: string;
            /**
             * @description New password (10–256 chars). Tighter min than register (which is 8)
             *     because rekey is a destructive operation — we nudge users toward a
             *     password they actually remember.
             */
            newPassword: string;
            /**
             * @description Fresh 16-byte Argon2id salt the client generated for the new master
             *     key, base64url-encoded (24 chars). Distinct from the old salt — the
             *     client throws away the old master key entirely and starts over.
             */
            newCryptoSalt: string;
            /**
             * @description Every active diary entry re-encrypted with the new diary subkey
             *     (HKDF from the new master key). Cap of 500 entries per request to
             *     keep the transaction bounded; if the user has more, the UI chunks
             *     across multiple requests.
             */
            reencryptedEntries: components["schemas"]["ReencryptedEntryDto"][];
        };
        DeleteRequestDto: {
            password: string;
            reason?: string;
        };
        OnboardingStep1Dto: {
            /**
             * @description Motivos chosen by the user. At least one is required. Max 5 keeps the
             *     recommendation algorithm focused — picking everything is signal for
             *     "I don't know" which we treat the same as default.
             *
             *     The service validates each id exists in the OnboardingMotivo table.
             */
            motivosIds: string[];
        };
        OnboardingStep2Dto: {
            moodId: string;
        };
        OnboardingStep3Dto: {
            /**
             * @description Display name. 2-40 chars. Disallow emoji + control chars + leading/trailing
             *     whitespace. The regex is permissive about accented characters so "María
             *     José" works.
             */
            firstName: string;
            /** @enum {string} */
            voicePreference: OnboardingStep3DtoVoicePreference;
        };
        OnboardingCompleteDto: {
            /**
             * @description Book the user picked to start with. `null` is valid → user finished
             *     onboarding without committing to a book ("terminar" button).
             */
            chosenBookId?: string | null;
        };
        OnboardingTourCompleteDto: {
            /** @description Number of tour steps the user actually saw. 0 = skipped after opening. */
            stepsCompleted: number;
        };
        SendEcoMessageDto: {
            /**
             * @description Server-side ID of the thread the message belongs to. The user must
             *     own the thread or the service returns 404 (we do not 403 — would
             *     leak existence). Max length 128 to allow opaque IDs.
             */
            threadId: string;
            /**
             * @description Ephemeral plaintext of the user's message. Server uses it for the
             *     LLM prompt + layer-1 crisis regex detection, then drops it. NEVER
             *     persists, NEVER logs, NEVER returns in any response. The privacy
             *     spec enforces this at CI time.
             *
             *     Hard cap 2000 chars (~500 tokens) to control LLM cost and stay
             *     under the design's "respuestas cortas" voice.
             */
            textPlaintext: string;
            /**
             * Format: base64
             * @description XChaCha20-Poly1305 ciphertext of the same message, base64url-encoded.
             *     Encrypted client-side under the eco subkey (HKDF from master key
             *     with `ECO_KEY_INFO`). Server persists as-is, decrypts never.
             *
             *     For replays / history reads, this is what the client decrypts
             *     locally to render the message bubble.
             */
            textCiphertext: string;
            /**
             * Format: base64
             * @description Fresh 24-byte XChaCha20 nonce paired with `textCiphertext`,
             *     base64url-encoded (32 chars exactly). Must be a new random nonce on
             *     every send — reuse under the same key breaks confidentiality.
             */
            textNonce: string;
            /**
             * @description Optional intent hint. `"suggest"` nudges Eco to recommend a book or
             *     exercise instead of free-form chat. v1 routes both through the same
             *     LLM call with the intent injected into the system prompt — explicit
             *     dispatch can come later if recommendation tuning needs it.
             */
            intent?: Record<string, never>;
        };
        ReportEcoMessageDto: {
            /**
             * @description Category of the issue. One of:
             *     - `HALLUCINATION` — Eco invented facts or sources
             *     - `OFF_TONE` — wrong register (too clinical, too casual, etc)
             *     - `SENSITIVE_CONTENT` — produced content that crosses safety lines
             *     - `CRISIS_MISHANDLED` — failed to detect or respond appropriately to a crisis signal
             *     - `OTHER` — falls outside the above (description in `comment`)
             *
             *     Plugin emits the enum in OpenAPI from `@IsEnum`.
             */
            reason: Record<string, never>;
            /**
             * @description Optional free-text explanation, up to 500 chars. Recommended when
             *     `reason === "OTHER"`. Stored as-is — the user is signaling intent,
             *     not entering encrypted content.
             */
            comment?: string;
        };
        LectorSessionHeartbeatDto: {
            bookId: string;
            chapterOrder: number;
            lastBlockId: string;
            /**
             * @description Seconds since the previous heartbeat. Cap at 60 at the service layer:
             *     a tab that wakes from suspend should not credit hours of "reading".
             */
            timeSpentDeltaSec: number;
            /** @description 0–1 ratio. Server clamps and never lets it decrease. */
            progressPct: number;
        };
        CreateHighlightDto: {
            blockId: string;
            /**
             * @description UTF-16 code-unit offsets into the block's `content`. The service rejects
             *     with 400 if `startOffset >= endOffset` or if `endOffset` exceeds the
             *     actual block length (the block is loaded server-side for verification).
             */
            startOffset: number;
            endOffset: number;
            color?: Record<string, never>;
            /** @description Optional one-line note. Reject long blobs — annotations are the right model for that. */
            note?: string;
        };
        CreateAnnotationDto: {
            blockId: string;
            /**
             * @description Cap at 4 KB. Diary is the right place for longer reflection; the
             *     Annotation model is for margin-style notes against a specific block.
             */
            text: string;
        };
        UpdateAnnotationDto: {
            text: string;
        };
        ShareWithTherapistDto: {
            therapistId: string;
        };
        MarkResolvedDto: {
            note?: string;
        };
        RejectAuthorRequestDto: {
            /**
             * @description Editorial feedback shown to the author in the publication checklist UI.
             *     Empty allowed (e.g. generic "no apto"), but ops should write something
             *     actionable.
             */
            feedback?: string;
        };
        ChangeRoleDto: {
            /** @enum {string} */
            role: ChangeRoleDtoRole;
            /** @description Optional reason captured for audit. */
            reason?: string;
        };
        RegisterLiveActivityDto: {
            activityId: string;
            /** @enum {string} */
            kind: RegisterLiveActivityDtoKind;
            pushToken: string;
            bundleId: string;
        };
        CrisisLogDto: {
            /** @enum {string} */
            trigger: CrisisLogDtoTrigger;
            contactedLineId?: string;
            country?: string;
        };
        CreateBookingDto: {
            /**
             * @description Stable opaque ID of the therapist (UUID). The client gets it from
             *     the directory or detail screens.
             */
            therapistId: string;
            /**
             * @description ISO-8601 UTC timestamp of the slot start (e.g.
             *     `"2026-06-15T14:30:00.000Z"`). The server validates the slot
             *     exists in the therapist's published availability + isn't already
             *     booked.
             */
            slotIso: string;
            /**
             * @description Session modality: `"INDIVIDUAL"` (1 client), `"COUPLE"` (2), or
             *     `"FAMILY"` (3+). Affects the Stripe price + the video room
             *     configuration (S65).
             * @enum {string}
             */
            modality: CreateBookingDtoModality;
            /**
             * @description Optional ID from the catalog of first-time reasons (e.g.
             *     "anxiety", "couples-counselling"). Helps the therapist prep before
             *     the first session. Subsequent bookings can omit it.
             */
            firstReasonId?: string;
            /**
             * @description Session length in minutes (15–120). Defaults to the therapist's
             *     default if omitted. Must match an available slot length.
             */
            durationMin?: number;
            /**
             * Format: uri
             * @description Stripe Checkout success redirect URL. Not used in S64 (Stripe
             *     wiring lands in S65); when present, S65's StripeProvider passes it
             *     to `checkout.sessions.create`.
             */
            successUrl?: string;
            /**
             * Format: uri
             * @description Stripe Checkout cancel redirect URL. Same v1 status as
             *     `successUrl` — passed through to Stripe in S65 when wired.
             */
            cancelUrl?: string;
        };
        UpdateSessionPrepDto: {
            intentionCiphertext?: string;
            intentionNonce?: string;
            /** @enum {string} */
            checkInMood?: UpdateSessionPrepDtoCheckInMood;
            sharedEntryIds?: string[];
        };
        SessionFeedbackDto: {
            rating: number;
            tags?: string[];
            noteCiphertext?: string;
            noteNonce?: string;
        };
        TechnicalReportDto: {
            /** @enum {string} */
            issue: TechnicalReportDtoIssue;
            description: string;
        };
        UpdatePrescriptionDto: {
            completed?: boolean;
        };
        RescheduleSessionDto: {
            newSlotIso: string;
        };
        CancelSessionDto: {
            reason: string;
            refundRequested?: boolean;
        };
        RetryCheckoutDto: {
            /** Format: uri */
            successUrl: string;
            /** Format: uri */
            cancelUrl: string;
        };
        CreateAuthorBookDto: {
            title: string;
            templateId?: string;
        };
        UpdateAuthorBookDto: {
            title?: string;
            subtitle?: string;
            summary?: string;
            /** @enum {string} */
            cover?: UpdateAuthorBookDtoCover;
            coverArtUrl?: string;
            categoryId?: string;
            language?: string;
        };
        ChapterBlockDto: {
            kind: string;
            content: string;
            meta?: Record<string, never>;
        };
        UpdateChapterDto: {
            title?: string;
            subtitle?: string;
            blocks?: components["schemas"]["ChapterBlockDto"][];
            isLocked?: boolean;
            isHidden?: boolean;
            /**
             * @description Optimistic concurrency: client sends the version it loaded with. If the
             *     server sees a newer version, returns 409 with the latest version so the
             *     editor can show a conflict modal.
             */
            expectedVersion?: number;
        };
        StructureItemDto: {
            n: number;
            title?: string;
            subtitle?: string;
            isLocked?: boolean;
            isHidden?: boolean;
        };
        UpdateStructureDto: {
            chapters: components["schemas"]["StructureItemDto"][];
        };
        AuthorAiHelpDto: {
            /** @enum {string} */
            intent: AuthorAiHelpDtoIntent;
            /** @description Texto sobre el cual operar (el bloque del editor). */
            text: string;
            /** @description ID opcional del bloque para audit / instrumentation futura. */
            blockId?: string;
            /** @description Contexto del capítulo o del libro completo (1000 chars). */
            context?: string;
        };
        UpdatePayoutSettingsDto: {
            /** @enum {string} */
            method: UpdatePayoutSettingsDtoMethod;
            /**
             * @description Detalles libres por método. Ejemplos:
             *      - bank_ec: { bankName, accountType: "ahorros|corriente", accountNumber, accountHolder }
             *      - paypal:  { email }
             *      - payphone: { phone, accountHolder }
             *      - manual:  { instructions }
             *     Nada se valida server-side aquí — finanzas confirma manualmente
             *     antes de pagar. Cap 4000 chars en JSON.stringify para evitar spam.
             */
            details?: Record<string, never>;
            taxId?: string;
            legalName?: string;
            legalAddress?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    DevicesController_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterDeviceDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DevicesController_unregister: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthController_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponseDto"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponseDto"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Email is already registered. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthController_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponseDto"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthController_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponseDto"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthController_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshDto"];
            };
        };
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthController_forgotPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForgotPasswordDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthController_resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetPasswordDto"];
            };
        };
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Reset token is invalid, expired, or already consumed. */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthController_verifyEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyEmailDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Verification token is invalid, expired, or already consumed. */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthController_oauthGoogle: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OAuthGoogleDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponseDto"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Email is already registered with a different auth provider (LOCAL). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_list: {
        parameters: {
            query?: {
                view?: PathsApiBooksGetParametersQueryView;
                categoryId?: string;
                authorId?: string;
                sort?: PathsApiBooksGetParametersQuerySort;
                q?: string;
                page?: number;
                perPage?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateBookDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Slug is already taken by another book. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_getRecos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_getCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_getAuthors: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_getDetail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                idOrSlug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_listReviews: {
        parameters: {
            query?: {
                page?: number;
                perPage?: number;
            };
            header?: never;
            path: {
                idOrSlug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_createReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                idOrSlug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateBookReviewDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_toggleFavorite: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                idOrSlug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_toggleBookmark: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                idOrSlug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_startBook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                idOrSlug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BooksController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateBookDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ChaptersController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
                order: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ChaptersController_createChapter: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateChapterDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Chapter ordinal `n` is already taken for this book. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ChaptersController_uploadAudio: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
                order: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UploadAudioDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ProgressController_markCompleted: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                chapterId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MarkProgressDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ProgressController_getUserProgress: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>[];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    HomeController_getHome: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_updateMood: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateMoodDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    HomeController_dismissPrompt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DiarioController_list: {
        parameters: {
            query?: {
                from?: string;
                to?: string;
                mood?: PathsApiDiarioEntriesGetParametersQueryMood;
                tag?: string;
                page?: number;
                perPage?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DiarioController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateDiaryEntryDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DiarioController_getPromptOfTheDay: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DiarioController_listRawCiphers: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DiarioController_getDetail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DiarioController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DiarioController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateDiaryEntryDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    DiarioController_share: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShareDiaryEntryDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_getPlans: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>[];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_getMySubscription: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_createCheckoutSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateCheckoutSessionDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_createPortalSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePortalSessionDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_getUsage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_listInvoices: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelSubscriptionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_reactivate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    SubscriptionController_handleWebhook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_getPlans: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>[];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_getMySubscription: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_getUsage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_listInvoices: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_createCheckoutSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateCheckoutSessionDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_createPortalSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePortalSessionDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_getReturn: {
        parameters: {
            query: {
                session_id: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_patchSubscription: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatchSubscriptionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelSubscriptionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_reactivate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    BillingController_handleWebhook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PlanController_getPlan: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    HealthController_check: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AIController_chat: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChatRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AIController_getConversations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AIController_getMessages: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AIController_ingestBook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_updateProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateProfileDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_updateTimezone: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateTimezoneDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_uploadAvatar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_updatePreferences: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePreferencesDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_updateReaderPreferences: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateReaderPreferencesDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_updateNotifications: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateNotificationsDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_updatePrivacy: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePrivacyDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_requestEmailChange: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmailChangeRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Requested email is already in use by another account. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_changePassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordChangeDto"];
            };
        };
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_changePasswordWithRekey: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordChangeWithRekeyDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_acknowledgeCryptoSeed: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_requestDataExport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    UsersController_requestDelete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeleteRequestDto"];
            };
        };
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_getIntro: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_skip: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_getMotivos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_step1: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OnboardingStep1Dto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_getMoods: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_step2: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OnboardingStep2Dto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_step3: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OnboardingStep3Dto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_recommendation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_complete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OnboardingCompleteDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_getTour: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    OnboardingController_completeTour: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OnboardingTourCompleteDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    VoiceController_transcribe: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    VoiceController_reportUsage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    EcoController_getCaps: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    EcoController_listThreads: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    EcoController_createThread: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    EcoController_getThread: {
        parameters: {
            query: {
                cursor: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    EcoController_deleteThread: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    EcoController_sendMessage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendEcoMessageDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    EcoController_reportMessage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReportEcoMessageDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    LectorController_getChapter: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
                chapterOrder: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    LectorController_getAudio: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
                chapterOrder: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    LectorController_heartbeat: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LectorSessionHeartbeatDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    LectorController_complete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
                chapterOrder: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    HighlightsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateHighlightDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    HighlightsController_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AnnotationsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAnnotationDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AnnotationsController_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AnnotationsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAnnotationDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PatronesController_getPatrones: {
        parameters: {
            query?: {
                period?: PathsApiPatronesGetParametersQueryPeriod;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PatronesController_regenerate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description User has less than 7 diary entries this week — not enough to regenerate the summary. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PatronesController_shareWithTherapist: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShareWithTherapistDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_getSummary: {
        parameters: {
            query: {
                status: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_list: {
        parameters: {
            query?: {
                reason?: PathsApiPulsoReportsEcoGetParametersQueryReason;
                limit?: number;
                cursor?: string;
                status?: PathsApiPulsoReportsEcoGetParametersQueryStatus;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_resolve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MarkResolvedDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_unresolve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_getOverview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_getCohorts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_listAuthorRequests: {
        parameters: {
            query: {
                status: string;
                limit: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_approveAuthorRequest: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Request is not in PENDING state — already approved or rejected. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_rejectAuthorRequest: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RejectAuthorRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Request is not in PENDING state — already approved or rejected. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_listUsers: {
        parameters: {
            query?: {
                /** @description Substring match on email or name (case-insensitive). */
                q?: string;
                /** @description Filter by exact role. */
                role?: PathsApiPulsoUsersGetParametersQueryRole;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_getRoleChanges: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    PulsoController_changeRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangeRoleDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description User already has the requested role (no-op rejected). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    LiveActivitiesController_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterLiveActivityDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    LiveActivitiesController_listActive: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    LiveActivitiesController_dismiss: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                activityId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_getCrisis: {
        parameters: {
            query: {
                country: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_logCrisis: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrisisLogDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_getHub: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_getFilters: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_listTherapists: {
        parameters: {
            query?: {
                motivo?: string;
                modalidad?: PathsApiTerapiaTherapistsGetParametersQueryModalidad;
                genero?: string;
                language?: string;
                priceMin?: number;
                priceMax?: number;
                sort?: PathsApiTerapiaTherapistsGetParametersQuerySort;
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_getTherapist: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_listReviews: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_toggleFavorite: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_getAvailability: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_createBooking: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateBookingDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description The requested slot is already taken (SLOT_TAKEN). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_getSessionPrep: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_updateSessionPrep: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateSessionPrepDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_joinSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_submitFeedback: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SessionFeedbackDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_reportTechnical: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TechnicalReportDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_listSessions: {
        parameters: {
            query?: {
                status?: PathsApiTerapiaSessionsGetParametersQueryStatus;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_listPrescriptions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>[];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_updatePrescription: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePrescriptionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_listNotifications: {
        parameters: {
            query?: {
                unread?: boolean;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_markNotificationRead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_markAllNotificationsRead: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_rescheduleSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RescheduleSessionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description The new slot is already taken (SLOT_TAKEN). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_cancelSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelSessionDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    TerapiaController_retryCheckout: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RetryCheckoutDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_dashboard: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_createBook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAuthorBookDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_getBook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_archiveBook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_updateBook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAuthorBookDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_getChapter: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                n: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_updateChapter: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                n: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateChapterDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description expectedVersion does not match the current chapter version (CHAPTER_VERSION_CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_updateStructure: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateStructureDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_getPublicationState: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_submit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Book is not in DRAFT state — already PUBLISHED or IN_REVIEW (BOOK_NOT_DRAFT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_unpublish: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            /** @description Book is not currently PUBLISHED (BOOK_NOT_PUBLISHED). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_uploadCover: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_uploadChapterAudio: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                n: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_aiHelp: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthorAiHelpDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_getCobros: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    AuthorController_updatePayoutSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePayoutSettingsDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
}
export enum PathsApiBooksGetParametersQueryView {
    catalogo = "catalogo",
    mis = "mis",
    recos = "recos",
    favoritos = "favoritos",
    guardados = "guardados"
}
export enum PathsApiBooksGetParametersQuerySort {
    recent = "recent",
    alpha = "alpha",
    marina = "marina"
}
export enum PathsApiDiarioEntriesGetParametersQueryMood {
    calma = "calma",
    foco = "foco",
    energia = "energia",
    reflexion = "reflexion",
    alegria = "alegria",
    ansiedad = "ansiedad",
    tristeza = "tristeza"
}
export enum PathsApiPatronesGetParametersQueryPeriod {
    Value30d = "30d",
    Value90d = "90d",
    Value1y = "1y"
}
export enum PathsApiPulsoReportsEcoGetParametersQueryReason {
    HALLUCINATION = "HALLUCINATION",
    OFF_TONE = "OFF_TONE",
    SENSITIVE_CONTENT = "SENSITIVE_CONTENT",
    CRISIS_MISHANDLED = "CRISIS_MISHANDLED",
    OTHER = "OTHER"
}
export enum PathsApiPulsoReportsEcoGetParametersQueryStatus {
    open = "open",
    resolved = "resolved",
    all = "all"
}
export enum PathsApiPulsoUsersGetParametersQueryRole {
    USER = "USER",
    AUTHOR = "AUTHOR",
    PSYCHOLOGIST = "PSYCHOLOGIST",
    ADMIN = "ADMIN"
}
export enum PathsApiTerapiaTherapistsGetParametersQueryModalidad {
    INDIVIDUAL = "INDIVIDUAL",
    COUPLE = "COUPLE",
    FAMILY = "FAMILY"
}
export enum PathsApiTerapiaTherapistsGetParametersQuerySort {
    rating = "rating",
    price_asc = "price-asc",
    price_desc = "price-desc",
    popular = "popular"
}
export enum PathsApiTerapiaSessionsGetParametersQueryStatus {
    upcoming = "upcoming",
    past = "past",
    all = "all"
}
export enum RegisterDeviceDtoPlatform {
    EXPO = "EXPO",
    WEB = "WEB"
}
export enum CreateBookDtoPlan {
    FREE = "FREE",
    PRO = "PRO",
    ANNUAL = "ANNUAL",
    B2B = "B2B"
}
export enum CreateDiaryEntryDtoMood {
    calma = "calma",
    foco = "foco",
    energia = "energia",
    reflexion = "reflexion",
    alegria = "alegria",
    ansiedad = "ansiedad",
    tristeza = "tristeza"
}
export enum CreateDiaryEntryDtoKind {
    free = "free",
    prompted = "prompted",
    voz = "voz"
}
export enum UpdateDiaryEntryDtoMood {
    calma = "calma",
    foco = "foco",
    energia = "energia",
    reflexion = "reflexion",
    alegria = "alegria",
    ansiedad = "ansiedad",
    tristeza = "tristeza"
}
export enum CreateCheckoutSessionDtoBillingPlan {
    PRO_MONTHLY = "PRO_MONTHLY",
    PRO_YEARLY = "PRO_YEARLY",
    B2B = "B2B"
}
export enum PatchSubscriptionDtoNewPlanId {
    PRO_MONTHLY = "PRO_MONTHLY",
    PRO_YEARLY = "PRO_YEARLY",
    B2B = "B2B"
}
export enum UpdatePreferencesDtoVoicePreference {
    marina = "marina",
    tomas = "tomas",
    none = "none"
}
export enum UpdatePreferencesDtoBestTime {
    morning = "morning",
    noon = "noon",
    evening = "evening",
    any = "any"
}
export enum UpdatePreferencesDtoTheme {
    system = "system",
    light = "light",
    dark = "dark"
}
export enum UpdatePreferencesDtoLanguage {
    es_419 = "es-419",
    es_ES = "es-ES"
}
export enum UpdateReaderPreferencesDtoFont {
    serif = "serif",
    sans = "sans"
}
export enum UpdateReaderPreferencesDtoTheme {
    system = "system",
    light = "light",
    sepia = "sepia",
    dark = "dark"
}
export enum UpdateMoodDtoMood {
    great = "great",
    good = "good",
    calm = "calm",
    neutral = "neutral",
    tired = "tired",
    anxious = "anxious",
    sad = "sad",
    angry = "angry"
}
export enum OnboardingStep3DtoVoicePreference {
    marina = "marina",
    tomas = "tomas",
    none = "none"
}
export enum ChangeRoleDtoRole {
    USER = "USER",
    AUTHOR = "AUTHOR",
    PSYCHOLOGIST = "PSYCHOLOGIST",
    ADMIN = "ADMIN"
}
export enum RegisterLiveActivityDtoKind {
    TERAPIA_SESSION = "TERAPIA_SESSION",
    LECTOR_ACTIVE = "LECTOR_ACTIVE",
    ECO_ACTIVE = "ECO_ACTIVE"
}
export enum CrisisLogDtoTrigger {
    ECO_SAFETY_LAYER = "ECO_SAFETY_LAYER",
    HOME_BUTTON = "HOME_BUTTON",
    PROFILE_LINK = "PROFILE_LINK",
    THERAPIST_SUGGESTION = "THERAPIST_SUGGESTION"
}
export enum CreateBookingDtoModality {
    INDIVIDUAL = "INDIVIDUAL",
    COUPLE = "COUPLE",
    FAMILY = "FAMILY"
}
export enum UpdateSessionPrepDtoCheckInMood {
    calmo = "calmo",
    ansioso = "ansioso",
    triste = "triste",
    energico = "energico",
    cansado = "cansado"
}
export enum TechnicalReportDtoIssue {
    AUDIO_FAILED = "AUDIO_FAILED",
    VIDEO_FAILED = "VIDEO_FAILED",
    CONNECTION_DROPPED = "CONNECTION_DROPPED",
    THERAPIST_NO_SHOW = "THERAPIST_NO_SHOW",
    OTHER = "OTHER"
}
export enum UpdateAuthorBookDtoCover {
    warm = "warm",
    cool = "cool",
    mixed = "mixed"
}
export enum AuthorAiHelpDtoIntent {
    revisar = "revisar",
    ejemplo = "ejemplo",
    tono = "tono",
    simplificar = "simplificar"
}
export enum UpdatePayoutSettingsDtoMethod {
    bank_ec = "bank_ec",
    paypal = "paypal",
    payphone = "payphone",
    manual = "manual"
}
