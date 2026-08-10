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
    "/api/auth/logout-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sign out of every device (bump auth revision + drop all tokens) */
        post: operations["AuthController_logoutAll"];
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
    "/api/emotional-map": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EmotionalMapController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/emotional-map/text-features": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EmotionalMapController_logTextFeatures"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ActivityController_feed"];
        put?: never;
        post?: never;
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
    "/api/eco/suggestions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EcoController_getSuggestions"];
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
    "/api/reflexiones/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ReflexionesController_list"];
        put?: never;
        post: operations["ReflexionesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reflexiones/prompt-of-the-day": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ReflexionesController_getPromptOfTheDay"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reflexiones/entries/raw-ciphers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ReflexionesController_listRawCiphers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reflexiones/entries/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ReflexionesController_getDetail"];
        put?: never;
        post?: never;
        delete: operations["ReflexionesController_remove"];
        options?: never;
        head?: never;
        patch: operations["ReflexionesController_update"];
        trace?: never;
    };
    "/api/reflexiones/entries/{id}/share": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ReflexionesController_share"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/mood": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["MoodController_log"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/mood/checkin/next": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["MoodController_nextCheckin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/mood/checkin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["MoodController_logCheckin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/journeys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["JourneysController_list"];
        put?: never;
        post?: never;
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
    "/api/health/integrations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Integrations status (ADMIN only)
         * @description Reports which external services are configured in the running environment. Booleans only — no env values are leaked. The `stub` flag is true when a value matches a placeholder pattern (test/stub) so ops can spot mis-configured prod boxes. Use this to sanity-check a Railway deploy before running smoke tests.
         */
        get: operations["HealthController_integrationsReport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health/emotional-map": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Emotional-map identity probe (ADMIN only)
         * @description Compares the emotional-map identity (schema versions, scoring version, config fingerprints, epochs, flags, environment, release SHA) of this API against the one MAINTAINED BY A LIVE WORKER HEARTBEAT. The worker republishes its identity every 60s under a 180s TTL, so a dead worker — or a deploy that never came up — reports as a MISMATCH rather than silently agreeing from a stale key. An unknown build (missing commit SHA) is also a mismatch: we do not certify what we cannot identify. A mismatch means the cron is writing snapshots this API will refuse to read — run this after every deploy. Names, numbers and booleans only; no secrets.
         */
        get: operations["HealthController_emotionalMapIdentity"];
        put?: never;
        post?: never;
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
    "/api/onboarding/tour/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset the UI tour so it shows again on next dashboard mount */
        post: operations["OnboardingController_resetTour"];
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
        post: operations["VoiceController_reportUsage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lector/media/{mediaKey}/access": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** URL firmada de corta vida para un medio disponible y autorizado. Nunca se devuelve en SSR ni se cachea. */
        get: operations["getChapterMediaAccess"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lector/media/{mediaKey}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra que el reproductor llegó a su final. No significa comprensión, atención ni efecto emocional: la actividad va a Mi Evolución. */
        post: operations["completeChapterMedia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lector/{bookId}/{chapterOrder}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Formatos del capítulo con su disponibilidad. Solo metadata: sin URLs. */
        get: operations["getChapterMediaManifest"];
        put?: never;
        post?: never;
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
    "/api/content/editions/{editionKey}/units/{unitKey}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ContentController_readUnit"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/content/editions/{editionKey}/units/{unitKey}/marks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ContentController_readUnitMarks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/content/books/{bookSlug}/manifest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ContentController_readManifest"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/learning/units/{unitKey}/open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra una apertura real de la unidad (repetible con keys distintas). */
        post: operations["LearningController_openUnit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/learning/units/{unitKey}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Transición server-side: requiere apertura previa; una sola completion por unidad. */
        post: operations["LearningController_completeUnit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/learning/concepts/{conceptKey}/explore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra la exploración de un concepto del catálogo. Jamás crea una Resonance. */
        post: operations["LearningController_exploreConcept"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/learning/recall-attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Intento de recall. Los ítems objetivos los califica el SERVIDOR contra el catálogo. */
        post: operations["LearningController_submitRecallAttempt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/learning/practices/{exerciseKey}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra que la práctica fue marcada como completada (sin métricas, sin emoción). */
        post: operations["LearningController_completePractice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/learning/progress": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Progreso derivado exclusivamente de LearningEvents V1 sobre la revisión publicada. */
        get: operations["LearningController_getProgress"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Si la guía está habilitada para el actor autenticado ahora mismo. No revela el modo, la allowlist ni la razón. */
        get: operations["getGuideAvailability"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/sessions/state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dónde está el actor en un pin exacto: NOT_STARTED, ACTIVE o COMPLETED con su resumen. No revela sesiones ajenas y no crea nada. */
        get: operations["getGuideExperienceState"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/sessions/recoverable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** La sesión activa del actor para un pin exacto, si existe. No revela sesiones ajenas ni de otro pin, y nunca crea nada. */
        get: operations["getRecoverableGuideSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/discovery/{bookSlug}/{chapterOrder}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Si hay una guía para el contexto de lectura pedido. No revela el motivo de un negativo, ni objetivos, ni identificadores internos. */
        get: operations["getGuideDiscovery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Abre una sesión de un guideKey@guideVersion exacto; el contexto editorial lo deriva el servidor. */
        post: operations["createGuideSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/sessions/{sessionId}/steps/{stepKey}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acepta el paso actual de tipo concepto / práctica / confirmación. */
        post: operations["completeGuideSessionStep"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/sessions/{sessionId}/steps/{stepKey}/recall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acepta el paso de recall objetivo; el SERVIDOR califica la opción elegida y nunca devuelve la respuesta correcta. */
        post: operations["submitGuideStepRecall"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/sessions/{sessionId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cierra la sesión como CANCELLED. No emite evento educativo. */
        post: operations["cancelGuideSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/guide/sessions/{sessionId}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cierra la sesión como COMPLETED; exige el ledger completo de la versión fijada. */
        post: operations["completeGuideSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/experiences/discovery/{bookSlug}/{chapterOrder}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Las experiencias PUBLICADAS de un capítulo, en versiones exactas. Cero a varias; no crea nada. */
        get: operations["getChapterExperiences"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/experiences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Experiencias publicadas y borradores de un capítulo, más la guía a la que pueden vincularse. */
        get: operations["listChapterExperiencesForAdmin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/experiences/drafts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Una definición guardada, para editarla. */
        get: operations["getExperienceDraftForAdmin"];
        /** Guarda el borrador completo. No hay patch por campo: una escritura parcial deja estados que ningún validador vio. */
        put: operations["saveExperienceDraft"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/experiences/drafts/{id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** El borrador tal como lo recibiría un lector, por el mismo mapper que usa discovery. */
        get: operations["getExperienceDraftPreview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/experiences/drafts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Crea una experiencia nueva en versión 1, siempre como borrador. */
        post: operations["createExperienceDraft"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/experiences/{experienceKey}/{experienceVersion}/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Clona una versión publicada como el siguiente borrador. La original no se toca. */
        post: operations["createNextExperienceDraft"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/experiences/drafts/{id}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Publica el borrador. Revalida contra la guía exacta del registro del servidor y lo vuelve inmutable. */
        post: operations["publishExperienceDraft"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Los libros del catálogo que un editor puede abrir. */
        get: operations["listContentStudioBooks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado editorial del libro: revisión publicada, borrador activo y capítulos con cambios. */
        get: operations["getContentStudioBook"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** El capítulo como debe editarse: el borrador activo si existe, si no lo publicado. El revisionId devuelto es el token de concurrencia. */
        get: operations["getContentStudioChapter"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Guarda los BLOQUES del capítulo en el borrador del libro. No publica, y no renombra: título, resumen y duración se conservan desde la revisión base. */
        put: operations["saveContentStudioChapterDraft"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** El capítulo tal como quedaría, leído del borrador activo. Sólo lectura. */
        get: operations["previewContentStudioChapter"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}/cover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reemplaza la portada del catálogo. Inmediato: no crea borrador ni revisión. */
        post: operations["uploadContentStudioCover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/images": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sube la imagen de una ilustración. No crea bloque ni revisión: eso ocurre al guardar el borrador. */
        post: operations["uploadContentStudioChapterImage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Publica el borrador del LIBRO. El alcance es la edición completa, no un capítulo. */
        post: operations["publishContentStudioBook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Audiolibro, podcast y video del capítulo, con su procedencia y su estado editorial. */
        get: operations["listContentStudioChapterMedia"];
        put?: never;
        /** Anuncia un formato que el capítulo aún no tiene. Sin archivo: se publica como «En producción». */
        post: operations["createContentStudioChapterMedia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/books/{bookSlug}/chapters/{chapterOrder}/media/{mediaKey}/adopt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Pasa una definición de código al CMS sin cambiar su identidad ni lo que el lector ve. */
        post: operations["adoptContentStudioChapterMedia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/media/drafts/{draftId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getContentStudioMediaDraft"];
        /** Edita la copia editorial. Identidad, origen y política de acceso los conserva el servidor. */
        put: operations["updateContentStudioMediaDraft"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/pulso/content/media/drafts/{draftId}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** La definición del CMS pasa a ser la autoridad de esa pieza. Sin deploy y sin tocar el archivo. */
        post: operations["publishContentStudioMediaDraft"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
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
    "/api/resonances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ResonancesController_list"];
        put?: never;
        post: operations["ResonancesController_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/resonances/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["ResonancesController_remove"];
        options?: never;
        head?: never;
        patch: operations["ResonancesController_setImportant"];
        trace?: never;
    };
    "/api/evolucion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EvolucionController_get"];
        put?: never;
        post?: never;
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
    "/api/terapia/webhooks/daily": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recibe eventos de Daily.co (meeting.started, meeting.ended). */
        post: operations["DailyWebhookController_receive"];
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
        ErrorEnvelopeDto: Record<string, never>;
        RegisterDeviceDto: Record<string, never>;
        RegisterDto: Record<string, never>;
        AuthResponseDto: Record<string, never>;
        LoginDto: Record<string, never>;
        RefreshDto: Record<string, never>;
        ForgotPasswordDto: Record<string, never>;
        ResetPasswordDto: Record<string, never>;
        VerifyEmailDto: Record<string, never>;
        OAuthGoogleDto: Record<string, never>;
        CreateBookReviewDto: Record<string, never>;
        CreateBookDto: Record<string, never>;
        UpdateBookDto: Record<string, never>;
        CreateChapterDto: Record<string, never>;
        UploadAudioDto: Record<string, never>;
        MarkProgressDto: Record<string, never>;
        UpdateUserMoodBodyDto: Record<string, never>;
        LogTextFeaturesDto: Record<string, never>;
        SendEcoMessageDto: Record<string, never>;
        ReportEcoMessageDto: Record<string, never>;
        ChatRequestDto: Record<string, never>;
        CreateCheckoutSessionDto: Record<string, never>;
        CreatePortalSessionDto: Record<string, never>;
        CancelSubscriptionDto: Record<string, never>;
        CreateDiaryEntryDto: Record<string, never>;
        UpdateDiaryEntryDto: Record<string, never>;
        ShareDiaryEntryDto: Record<string, never>;
        LogMoodDto: {
            /**
             * @description Mood token from the shared catalog.
             * @example good
             * @enum {string}
             */
            mood: LogMoodDtoMood;
        };
        LogCheckinDto: Record<string, never>;
        PatchSubscriptionDto: Record<string, never>;
        UpdateProfileDto: Record<string, never>;
        UpdateTimezoneDto: Record<string, never>;
        UpdatePreferencesDto: Record<string, never>;
        UpdateReaderPreferencesDto: Record<string, never>;
        UpdateNotificationsDto: Record<string, never>;
        UpdatePrivacyDto: Record<string, never>;
        UpdateMoodDto: Record<string, never>;
        EmailChangeRequestDto: Record<string, never>;
        PasswordChangeDto: Record<string, never>;
        PasswordChangeWithRekeyDto: Record<string, never>;
        DeleteRequestDto: Record<string, never>;
        OnboardingStep1Dto: Record<string, never>;
        OnboardingStep2Dto: Record<string, never>;
        OnboardingStep3Dto: Record<string, never>;
        OnboardingCompleteDto: Record<string, never>;
        OnboardingTourCompleteDto: Record<string, never>;
        LectorSessionHeartbeatDto: Record<string, never>;
        CreateHighlightDto: Record<string, never>;
        CreateAnnotationDto: Record<string, never>;
        UpdateAnnotationDto: Record<string, never>;
        ContentReadBlockDto: {
            /** @description Stable block identity (uuidv5). */
            blockKey: string;
            /** @description Legacy ChapterBlock id (anchor-compat bridge); null for a pure Content Core block. */
            legacyBlockId: string | null;
            /** @description Source text version served (CC-6C). Core: BlockVersion.id; legacy: null. Echoed back when creating a highlight. */
            blockVersionId: string | null;
            /** @description Block kind (PARAGRAPH, HEADING, …). */
            kind: string;
            /** @description 0-based position within the unit. */
            order: number;
            content: string;
            /** @description Structured metadata by kind (audioUrl, videoUrl, …). */
            meta: Record<string, never> | null;
        };
        ContentUnitReadDto: {
            editionKey: string;
            /** @description Published revision number, or null when served from legacy. */
            revisionNumber: number | null;
            unitKey: string;
            title: string;
            summary: string | null;
            order: number;
            partNumber: number | null;
            partTitle: string | null;
            /**
             * @description Which store served this unit.
             * @enum {string}
             */
            source: ContentUnitReadDtoSource;
            blocks: components["schemas"]["ContentReadBlockDto"][];
        };
        MarkHighlightDto: {
            id: string;
            /** @description Stable public block identity (uuidv5). */
            blockKey: string;
            /** @description Legacy ChapterBlock id — null for a pure Content Core block. */
            blockId: string | null;
            startOffset: number;
            endOffset: number;
            /** @enum {string} */
            color: MarkHighlightDtoColor;
            note: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        MarkAnnotationDto: {
            id: string;
            /** @description Stable public block identity (uuidv5). */
            blockKey: string;
            blockId: string | null;
            text: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ContentUnitMarksDto: {
            editionKey: string;
            unitKey: string;
            highlights: components["schemas"]["MarkHighlightDto"][];
            annotations: components["schemas"]["MarkAnnotationDto"][];
        };
        ManifestUnitDto: {
            /** @description Stable unit identity (uuidv5). */
            unitKey: string;
            /** @description 1-based reading order within the book. */
            order: number;
            title: string;
            summary: string | null;
            partNumber: number | null;
            partTitle: string | null;
        };
        BookManifestDto: {
            bookSlug: string;
            /**
             * @description Which store served this manifest.
             * @enum {string}
             */
            source: BookManifestDtoSource;
            /** @description Server-owned edition key — clients never fabricate it. */
            editionKey: string;
            /** @description Published revision number, or null when served from legacy. */
            revisionNumber: number | null;
            units: components["schemas"]["ManifestUnitDto"][];
        };
        LearningUnitProgressItemDto: {
            unitKey: string;
            /** @enum {string} */
            state: LearningUnitProgressItemDtoState;
            openedAt: string | null;
            completedAt: string | null;
            completedRevisionNumber: number | null;
        };
        LearningProgressResponseDto: {
            bookSlug: string;
            editionKey: string;
            revisionNumber: number;
            units: components["schemas"]["LearningUnitProgressItemDto"][];
            openedCount: number;
            completedCount: number;
            totalCount: number;
        };
        SaveExperienceDefinitionDto: {
            /** @description Un ChapterExperienceDefinition completo. El servidor decide status, versión, publishedAt y autor: lo que venga en esos campos se ignora. */
            definition: Record<string, never>;
        };
        ContentStudioBookSummaryDto: {
            slug: string;
            title: string;
            subtitle: string | null;
            authorName: string | null;
            categoryLabel: string | null;
            /** @description Plan mínimo para leerlo. */
            plan: string;
            isPublished: boolean;
            totalChapters: number;
        };
        ContentStudioBookListResponseDto: {
            books: components["schemas"]["ContentStudioBookSummaryDto"][];
        };
        ContentStudioBookDto: {
            slug: string;
            title: string;
            subtitle: string | null;
            authorName: string | null;
            /** @description La portada vigente del catálogo, o null si no hay ninguna. */
            coverArtUrl: string | null;
        };
        ContentStudioChapterRowDto: {
            order: number;
            /** @description El título tal como está en la revisión que se edita — el borrador si existe, si no lo publicado. */
            title: string;
            /** @description El borrador cambia este capítulo. */
            changed: boolean;
        };
        ContentStudioBookStateResponseDto: {
            book: components["schemas"]["ContentStudioBookDto"];
            publishedRevisionNumber: number | null;
            /** @description El borrador activo del LIBRO, o null si no hay ninguno. */
            draftRevisionId: string | null;
            draftRevisionNumber: number | null;
            changedUnitCount: number;
            chapters: components["schemas"]["ContentStudioChapterRowDto"][];
        };
        ContentStudioBlockDto: {
            /** @description Identidad pública y estable del bloque. */
            blockKey: string;
            /** @example PARAGRAPH */
            kind: string;
            order: number;
            content: string;
            /** @description Metadatos del bloque. Forma libre: depende del kind y este vertical no la administra todavía. */
            meta?: {
                [key: string]: unknown;
            } | null;
        };
        ContentStudioChapterResponseDto: {
            bookSlug: string;
            chapterOrder: number;
            title: string;
            summary: string | null;
            durationMinutes: number | null;
            /** @description El token de concurrencia. Debe volver tal cual en el siguiente guardado. */
            revisionId: string;
            revisionNumber: number;
            /** @enum {string} */
            revisionStatus: ContentStudioChapterResponseDtoRevisionStatus;
            /** @description Capítulos que el borrador del libro cambia. */
            changedUnitCount: number;
            blocks: components["schemas"]["ContentStudioBlockDto"][];
        };
        ContentBlockInputDto: {
            /** @example PARAGRAPH */
            kind: string;
            /** @description El texto del bloque. */
            content: string;
            /** @description Metadatos del bloque. Forma libre a propósito: un IMAGE o AUDIO trae metadatos que este vertical todavía no administra, y deben sobrevivir una edición de texto intactos. */
            meta?: {
                [key: string]: unknown;
            };
        };
        SaveChapterDraftDto: {
            /** @description La revisión que el editor cargó. */
            expectedRevisionId: string;
            blocks: components["schemas"]["ContentBlockInputDto"][];
        };
        ContentStudioSaveResponseDto: {
            /** @description El nuevo token de concurrencia. */
            revisionId: string;
            revisionNumber: number;
            changedUnitCount: number;
        };
        ContentStudioPreviewResponseDto: {
            bookSlug: string;
            chapterOrder: number;
            revisionId: string;
            revisionNumber: number;
            title: string;
            summary: string | null;
            durationMinutes: number | null;
            blocks: components["schemas"]["ContentStudioBlockDto"][];
        };
        ContentStudioCoverResponseDto: {
            /** @description La portada ya vigente en el catálogo. */
            coverArtUrl: string;
        };
        ContentStudioChapterImageResponseDto: {
            /** @description Dónde quedó la imagen. Todavía no forma parte del capítulo: eso ocurre al guardar el borrador. */
            imageUrl: string;
        };
        PublishBookDto: {
            /** @description El borrador que el editor está publicando. */
            expectedDraftRevisionId: string;
        };
        ContentStudioPublishResponseDto: {
            revisionId: string;
            revisionNumber: number;
            /** @description Cuántos capítulos cambiaba el borrador al publicarse. */
            changedUnitCountBeforePublish: number;
        };
        ContentStudioMediaChapterMarkDto: {
            startSec: number;
            label: string;
        };
        ContentStudioMediaCardDto: {
            /** @enum {string} */
            kind: ContentStudioMediaCardDtoKind;
            mediaKey: string;
            mediaVersion: number;
            title: string;
            description: string | null;
            durationSec: number | null;
            chapters: components["schemas"]["ContentStudioMediaChapterMarkDto"][];
            /**
             * @description Lo que el lector ve hoy.
             * @enum {string}
             */
            runtimeAvailability: ContentStudioMediaCardDtoRuntimeAvailability;
            /** @description Si hay un archivo realmente asociado. */
            sourceReady: boolean;
            hasTranscript: boolean;
            hasPoster: boolean;
            hasCaptions: boolean;
            /**
             * @description De dónde sale la definición vigente.
             * @enum {string}
             */
            provenance: ContentStudioMediaCardDtoProvenance;
            /** @enum {string} */
            editorialStatus: ContentStudioMediaCardDtoEditorialStatus;
            draftId: string | null;
        };
        ContentStudioChapterMediaResponseDto: {
            bookSlug: string;
            chapterOrder: number;
            media: components["schemas"]["ContentStudioMediaCardDto"][];
            /** @description Formatos que el capítulo no tiene. Sin esto el CMS sólo podría decir «no hay» sin ofrecer nada. */
            missingKinds: ContentStudioChapterMediaResponseDtoMissingKinds[];
        };
        ContentStudioMediaDraftRefDto: {
            draftId: string;
            mediaKey: string;
        };
        CreateComingSoonMediaDto: {
            /** @enum {string} */
            kind: CreateComingSoonMediaDtoKind;
            title: string;
            description: string;
        };
        MediaChapterMarkDto: {
            startSec: number;
            label: string;
        };
        UpdateMediaDraftDto: {
            title: string;
            description: string;
            durationSec?: number | null;
            chapters: components["schemas"]["MediaChapterMarkDto"][];
        };
        ContentStudioMediaPublishResponseDto: {
            draftId: string;
            mediaKey: string;
            mediaVersion: number;
        };
        ShareWithTherapistDto: Record<string, never>;
        ConfirmResonanceDto: Record<string, never>;
        UpdateResonanceDto: Record<string, never>;
        MarkResolvedDto: Record<string, never>;
        RejectAuthorRequestDto: Record<string, never>;
        ChangeRoleDto: Record<string, never>;
        RegisterLiveActivityDto: Record<string, never>;
        CrisisLogDto: Record<string, never>;
        CreateBookingDto: Record<string, never>;
        UpdateSessionPrepDto: Record<string, never>;
        SessionFeedbackDto: Record<string, never>;
        TechnicalReportDto: Record<string, never>;
        UpdatePrescriptionDto: Record<string, never>;
        RescheduleSessionDto: Record<string, never>;
        CancelSessionDto: Record<string, never>;
        RetryCheckoutDto: Record<string, never>;
        CreateAuthorBookDto: Record<string, never>;
        UpdateAuthorBookDto: Record<string, never>;
        UpdateChapterDto: Record<string, never>;
        UpdateStructureDto: Record<string, never>;
        AuthorAiHelpDto: Record<string, never>;
        UpdatePayoutSettingsDto: Record<string, never>;
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
    AuthController_logoutAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
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
    BooksController_listReviews: {
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
    EmotionalMapController_get: {
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
    EmotionalMapController_logTextFeatures: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LogTextFeaturesDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ActivityController_feed: {
        parameters: {
            query?: {
                /** @description Items to return. 1–20. Default 5. */
                limit?: string;
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
    EcoController_getSuggestions: {
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
    SubscriptionController_listInvoices: {
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
    ReflexionesController_list: {
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
    ReflexionesController_create: {
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
    ReflexionesController_getPromptOfTheDay: {
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
    ReflexionesController_listRawCiphers: {
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
    ReflexionesController_getDetail: {
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
    ReflexionesController_remove: {
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
    ReflexionesController_update: {
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
    ReflexionesController_share: {
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
    MoodController_log: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LogMoodDto"];
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    MoodController_nextCheckin: {
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    MoodController_logCheckin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LogCheckinDto"];
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    JourneysController_list: {
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
    BillingController_listInvoices: {
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
    BillingController_getReturn: {
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
    HealthController_integrationsReport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    HealthController_emotionalMapIdentity: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    OnboardingController_resetTour: {
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
    VoiceController_transcribe: {
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
    getChapterMediaAccess: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mediaKey: string;
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
                    "application/json": {
                        /** @enum {string} */
                        kind: PathsApiLectorMediaMediaKeyAccessGetResponses200ContentApplicationJsonOneOf0Kind;
                        /** @description Clave de catálogo del medio — fija también su versión. */
                        mediaKey: string;
                        /** @description Un máster nuevo es una VERSIÓN nueva, nunca una edición. */
                        mediaVersion: number;
                        /** @description URL firmada de corta vida — es un bearer temporal. */
                        url: string;
                        /**
                         * Format: date-time
                         * @description Instante ISO-8601 en que conviene volver a pedir. No promete que la URL siga válida hasta entonces.
                         */
                        expiresAt: string;
                        transcriptUrl: string | null;
                        posterUrl: string | null;
                    } | {
                        /** @enum {string} */
                        kind: PathsApiLectorMediaMediaKeyAccessGetResponses200ContentApplicationJsonOneOf1Kind;
                        /** @description Clave de catálogo del medio — fija también su versión. */
                        mediaKey: string;
                        /** @description Un máster nuevo es una VERSIÓN nueva, nunca una edición. */
                        mediaVersion: number;
                        /** @description URL del reproductor gestionado del proveedor. La identidad del proveedor nunca viaja como campo aparte. */
                        embedUrl: string;
                        /**
                         * Format: date-time
                         * @description Instante ISO-8601 en que conviene volver a pedir. No promete que la URL siga válida hasta entonces.
                         */
                        expiresAt: string;
                        transcriptUrl: string | null;
                        posterUrl: string | null;
                        defaultTextTrack: string | null;
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    completeChapterMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mediaKey: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada escribió la finalización (HTTP 201). */
                        created: boolean;
                        /** @description Una llamada idéntica anterior ya la escribió; ahora no corrió nada (HTTP 200). */
                        replayed: boolean;
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada escribió la finalización (HTTP 201). */
                        created: boolean;
                        /** @description Una llamada idéntica anterior ya la escribió; ahora no corrió nada (HTTP 200). */
                        replayed: boolean;
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    getChapterMediaManifest: {
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
                    "application/json": {
                        bookSlug: string;
                        chapterOrder: number;
                        items: {
                            /** @description Clave de catálogo del medio — fija también su versión. */
                            mediaKey: string;
                            /** @description Un máster nuevo es una VERSIÓN nueva, nunca una edición. */
                            mediaVersion: number;
                            /** @enum {string} */
                            kind: PathsApiLectorBookIdChapterOrderMediaGetResponses200ContentApplicationJsonItemsKind;
                            title: string;
                            description: string;
                            /** @description Duración editorial, o null mientras no exista el máster. */
                            durationSec: number | null;
                            /**
                             * @description `COMING_SOON` es honesto: el formato está anunciado y no hay asset.
                             * @enum {string}
                             */
                            availability: PathsApiLectorBookIdChapterOrderMediaGetResponses200ContentApplicationJsonItemsAvailability;
                            hasTranscript: boolean;
                            hasCaptions: boolean;
                            chapters: {
                                startSec: number;
                                label: string;
                            }[];
                        }[];
                    };
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
            404: {
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
    ContentController_readUnit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                editionKey: string;
                unitKey: string;
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
                    "application/json": components["schemas"]["ContentUnitReadDto"];
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ContentController_readUnitMarks: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                editionKey: string;
                unitKey: string;
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
                    "application/json": components["schemas"]["ContentUnitMarksDto"];
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ContentController_readManifest: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
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
                    "application/json": components["schemas"]["BookManifestDto"];
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    LearningController_openUnit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                unitKey: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Mandatory client idempotency key (UUID, any casing).
                     */
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
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
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
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
    LearningController_completeUnit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                unitKey: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Mandatory client idempotency key (UUID, any casing).
                     */
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
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
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
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
    LearningController_exploreConcept: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                conceptKey: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Mandatory client idempotency key (UUID, any casing).
                     */
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
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
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
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
    LearningController_submitRecallAttempt: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Mandatory client idempotency key (UUID, any casing).
                     */
                    idempotencyKey: string;
                    itemKey: string;
                    /** @description La opción elegida del catálogo del ítem — el servidor la califica. */
                    selectedOptionKey: string;
                } | {
                    /**
                     * Format: uuid
                     * @description Mandatory client idempotency key (UUID, any casing).
                     */
                    idempotencyKey: string;
                    itemKey: string;
                    /**
                     * @description La autoevaluación categórica del usuario (solo si el catálogo declara el modo self-assessed).
                     * @enum {string}
                     */
                    selfResult: PathsApiLearningRecallAttemptsPostRequestBodyContentApplicationJsonOneOf1SelfResult;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
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
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
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
    LearningController_completePractice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                exerciseKey: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Mandatory client idempotency key (UUID, any casing).
                     */
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created: boolean;
                        replayed: boolean;
                        event: {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf0SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf0Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf1SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf1Type;
                            payload: {
                                editionKey: string;
                                unitKey: string;
                                revisionNumber: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf2SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf2Type;
                            payload: {
                                conceptKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf3SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf3Type;
                            payload: {
                                guideSessionId: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf4SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf4Type;
                            payload: {
                                guideSessionId: string;
                                stepsCompleted: number;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5Type;
                            /** @description Unión discriminada por evaluationSource: la variante server conserva la opción elegida; la self-assessed nunca finge una opción. */
                            payload: {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource;
                                selectedOptionKey: string;
                                /** @enum {string} */
                                result: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result;
                            } | {
                                unitKey: string;
                                itemKey: string;
                                conceptKey: string | null;
                                /** @enum {string} */
                                evaluationSource: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource;
                                /**
                                 * @description Siempre null — una autoevaluación no elige opción.
                                 * @enum {string|null}
                                 */
                                selectedOptionKey: null;
                                /** @enum {string} */
                                result: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf6SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf6Type;
                            payload: {
                                exerciseKey: string;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        } | {
                            id: string;
                            /** @enum {integer} */
                            schemaVersion: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf7SchemaVersion;
                            /**
                             * Format: date-time
                             * @description Reloj del servidor — el cliente no fecha eventos.
                             */
                            occurredAt: string;
                            /** @enum {string} */
                            type: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf7Type;
                            payload: {
                                mediaKey: string;
                                /** @enum {string} */
                                mediaKind: PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind;
                                mediaVersion: number;
                                unitKey: string;
                            };
                            editionId: string | null;
                            unitId: string | null;
                            conceptId: string | null;
                            guideSessionId: string | null;
                        };
                    };
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
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
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
    LearningController_getProgress: {
        parameters: {
            query: {
                bookSlug: string;
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
                    "application/json": components["schemas"]["LearningProgressResponseDto"];
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
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
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
    getGuideAvailability: {
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
                    "application/json": {
                        available: boolean;
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    getGuideExperienceState: {
        parameters: {
            query: {
                guideKey: string;
                guideVersion: number;
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
                    "application/json": {
                        /** @enum {string} */
                        state: PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf0State;
                        session: null;
                        summary: null;
                    } | {
                        /** @enum {string} */
                        state: PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf1State;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf1SessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                        summary: null;
                    } | {
                        /** @enum {string} */
                        state: PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf2State;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf2SessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                        summary: {
                            conceptsExplored: number;
                            practicesConfirmed: number;
                            recalls: {
                                /** @enum {string} */
                                outcome: PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf2SummaryRecallsOutcome;
                            }[];
                        };
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    getRecoverableGuideSession: {
        parameters: {
            query: {
                guideKey: string;
                guideVersion: number;
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
                    "application/json": {
                        /** @enum {boolean} */
                        recoverable: false;
                        session: null;
                    } | {
                        /** @enum {boolean} */
                        recoverable: true;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsRecoverableGetResponses200ContentApplicationJsonOneOf1SessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    getGuideDiscovery: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Slug canónico del libro (kebab-case, minúsculas). */
                bookSlug: string;
                /** @description Orden del capítulo EN LA PLATAFORMA, que no siempre coincide con la numeración impresa del libro. */
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
                    "application/json": {
                        /** @enum {boolean} */
                        available: false;
                    } | {
                        /** @enum {boolean} */
                        available: true;
                        /** @description Clave exacta de la guía ofrecida para este contexto. */
                        guideKey: string;
                        /** @description Versión exacta; el par clave@versión es inmutable. */
                        guideVersion: number;
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    createGuideSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Clave de idempotencia del cliente (UUID, cualquier casing).
                     */
                    idempotencyKey: string;
                    /** @description Clave de la guía publicada. */
                    guideKey: string;
                    /** @description Versión EXACTA — la superficie nunca resuelve una «última». */
                    guideVersion: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsPostResponses200ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsPostResponses201ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    completeGuideSessionStep: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
                stepKey: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Clave de idempotencia del cliente (UUID, cualquier casing).
                     */
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsSessionIdStepsStepKeyCompletePostResponses200ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsSessionIdStepsStepKeyCompletePostResponses201ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    submitGuideStepRecall: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
                stepKey: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Clave de idempotencia del cliente (UUID, cualquier casing).
                     */
                    idempotencyKey: string;
                    /** @description La opción elegida del catálogo del ítem — el SERVIDOR la califica. `itemKey`, `result` y `evaluationSource` nunca se aceptan. */
                    selectedOptionKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). El feedback es el mismo que devolvió el intento original — se lee del ledger, no se vuelve a calificar. */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsSessionIdStepsStepKeyRecallPostResponses200ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                        feedback: {
                            /**
                             * @description Lo que se le dice a la persona. Calificado por el servidor contra la respuesta canónica del catálogo, que nunca sale.
                             * @enum {string}
                             */
                            outcome: PathsApiGuideSessionsSessionIdStepsStepKeyRecallPostResponses200ContentApplicationJsonFeedbackOutcome;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). El feedback es el mismo que devolvió el intento original — se lee del ledger, no se vuelve a calificar. */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsSessionIdStepsStepKeyRecallPostResponses201ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                        feedback: {
                            /**
                             * @description Lo que se le dice a la persona. Calificado por el servidor contra la respuesta canónica del catálogo, que nunca sale.
                             * @enum {string}
                             */
                            outcome: PathsApiGuideSessionsSessionIdStepsStepKeyRecallPostResponses201ContentApplicationJsonFeedbackOutcome;
                        };
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    cancelGuideSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Clave de idempotencia del cliente (UUID, cualquier casing).
                     */
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsSessionIdCancelPostResponses200ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsSessionIdCancelPostResponses201ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    completeGuideSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: uuid
                     * @description Clave de idempotencia del cliente (UUID, cualquier casing).
                     */
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsSessionIdCompletePostResponses200ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Esta llamada aplicó la transición (HTTP 201). */
                        created: boolean;
                        /** @description Un comando idéntico anterior ya la aplicó; nada corrió ahora (HTTP 200). */
                        replayed: boolean;
                        session: {
                            sessionId: string;
                            guideKey: string;
                            guideVersion: number;
                            /** @enum {string} */
                            status: PathsApiGuideSessionsSessionIdCompletePostResponses201ContentApplicationJsonSessionStatus;
                            /** @description Derivado del ledger de pasos aceptados — nunca de un contador enviado por el cliente ni de LearningEvents. */
                            stepsCompleted: number;
                            totalSteps: number;
                            currentStepKey: string | null;
                        };
                    };
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    getChapterExperiences: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Slug canónico del libro (kebab-case, minúsculas). */
                bookSlug: string;
                /** @description Orden del capítulo EN LA PLATAFORMA, que no siempre coincide con la numeración impresa del libro. */
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
                    "application/json": {
                        items: {
                            experienceKey: string;
                            experienceVersion: number;
                            title: string;
                            summary?: string;
                            estimatedMinutes?: number;
                            guidePin: {
                                guideKey: string;
                                guideVersion: number;
                            };
                            scenes: {
                                sceneKey: string;
                                order: number;
                                /** @enum {string} */
                                kind: PathsApiExperiencesDiscoveryBookSlugChapterOrderGetResponses200ContentApplicationJsonItemsScenesKind;
                                completesGuideStepKey?: string;
                                payload: {
                                    title: string;
                                    body: string[];
                                    note?: string;
                                    actionLabel?: string;
                                    placeholder?: string;
                                    anchorKey?: string;
                                    conceptKey?: string;
                                    /** @enum {string} */
                                    mediaKind?: PathsApiExperiencesDiscoveryBookSlugChapterOrderGetResponses200ContentApplicationJsonItemsScenesPayloadMediaKind;
                                    question?: string;
                                    options?: {
                                        optionKey: string;
                                        label: string;
                                    }[];
                                };
                            }[];
                        }[];
                    };
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
    listChapterExperiencesForAdmin: {
        parameters: {
            query: {
                bookSlug: string;
                chapterOrder: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Vista de administración del capítulo. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getExperienceDraftForAdmin: {
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    saveExperienceDraft: {
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
                "application/json": components["schemas"]["SaveExperienceDefinitionDto"];
            };
        };
        responses: {
            /** @description La versión ya está publicada y es inmutable. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
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
    getExperienceDraftPreview: {
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    createExperienceDraft: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaveExperienceDefinitionDto"];
            };
        };
        responses: {
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
    createNextExperienceDraft: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                experienceKey: string;
                experienceVersion: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    publishExperienceDraft: {
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
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
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
    listContentStudioBooks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Libros con su número de capítulos. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentStudioBookListResponseDto"];
                };
            };
        };
    };
    getContentStudioBook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
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
                    "application/json": components["schemas"]["ContentStudioBookStateResponseDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    getContentStudioChapter: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
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
                    "application/json": components["schemas"]["ContentStudioChapterResponseDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    saveContentStudioChapterDraft: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
                chapterOrder: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaveChapterDraftDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentStudioSaveResponseDto"];
                };
            };
            /** @description El borrador cambió; no se escribió nada. */
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
    previewContentStudioChapter: {
        parameters: {
            query: {
                revisionId: string;
            };
            header?: never;
            path: {
                bookSlug: string;
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
                    "application/json": components["schemas"]["ContentStudioPreviewResponseDto"];
                };
            };
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
    uploadContentStudioCover: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentStudioCoverResponseDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    uploadContentStudioChapterImage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
                chapterOrder: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentStudioChapterImageResponseDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    publishContentStudioBook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PublishBookDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentStudioPublishResponseDto"];
                };
            };
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
    listContentStudioChapterMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
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
                    "application/json": components["schemas"]["ContentStudioChapterMediaResponseDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    createContentStudioChapterMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
                chapterOrder: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateComingSoonMediaDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentStudioMediaDraftRefDto"];
                };
            };
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
    adoptContentStudioChapterMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookSlug: string;
                chapterOrder: number;
                mediaKey: string;
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
                    "application/json": components["schemas"]["ContentStudioMediaDraftRefDto"];
                };
            };
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
    getContentStudioMediaDraft: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draftId: string;
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
                    "application/json": components["schemas"]["ContentStudioMediaCardDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    updateContentStudioMediaDraft: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draftId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateMediaDraftDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContentStudioMediaCardDto"];
                };
            };
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
    publishContentStudioMediaDraft: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draftId: string;
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
                    "application/json": components["schemas"]["ContentStudioMediaPublishResponseDto"];
                };
            };
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
    PatronesController_getPatrones: {
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
    PatronesController_regenerate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    ResonancesController_list: {
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ResonancesController_confirm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfirmResonanceDto"];
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ResonancesController_remove: {
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    ResonancesController_setImportant: {
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
                "application/json": components["schemas"]["UpdateResonanceDto"];
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
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelopeDto"];
                };
            };
        };
    };
    EvolucionController_get: {
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
    PulsoController_list: {
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
    TerapiaController_listTherapists: {
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
    TerapiaController_listReviews: {
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
    TerapiaController_getAvailability: {
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
    TerapiaController_listSessions: {
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
    TerapiaController_listNotifications: {
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
    DailyWebhookController_receive: {
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
export enum PathsApiLectorMediaMediaKeyAccessGetResponses200ContentApplicationJsonOneOf0Kind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST"
}
export enum PathsApiLectorMediaMediaKeyAccessGetResponses200ContentApplicationJsonOneOf1Kind {
    VIDEO = "VIDEO"
}
export enum PathsApiLectorBookIdChapterOrderMediaGetResponses200ContentApplicationJsonItemsKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLectorBookIdChapterOrderMediaGetResponses200ContentApplicationJsonItemsAvailability {
    AVAILABLE = "AVAILABLE",
    COMING_SOON = "COMING_SOON"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningUnitsUnitKeyOpenPostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningUnitsUnitKeyCompletePostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningConceptsConceptKeyExplorePostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningRecallAttemptsPostRequestBodyContentApplicationJsonOneOf1SelfResult {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningRecallAttemptsPostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningRecallAttemptsPostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses200ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf0SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf0Type {
    unit_opened = "unit_opened"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf1SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf1Type {
    unit_completed = "unit_completed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf2SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf2Type {
    concept_explored = "concept_explored"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf3SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf3Type {
    guide_session_started = "guide_session_started"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf4SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf4Type {
    guide_session_completed = "guide_session_completed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5Type {
    active_recall_attempted = "active_recall_attempted"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0EvaluationSource {
    server = "server"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf0Result {
    correct = "correct",
    incorrect = "incorrect"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1EvaluationSource {
    self_assessed = "self_assessed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf5PayloadOneOf1Result {
    correct = "correct",
    incorrect = "incorrect",
    skipped = "skipped"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf6SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf6Type {
    practice_completed = "practice_completed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf7SchemaVersion {
    Value1 = 1
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf7Type {
    chapter_media_completed = "chapter_media_completed"
}
export enum PathsApiLearningPracticesExerciseKeyCompletePostResponses201ContentApplicationJsonEventOneOf7PayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf0State {
    NOT_STARTED = "NOT_STARTED"
}
export enum PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf1State {
    ACTIVE = "ACTIVE"
}
export enum PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf1SessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf2State {
    COMPLETED = "COMPLETED"
}
export enum PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf2SessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsStateGetResponses200ContentApplicationJsonOneOf2SummaryRecallsOutcome {
    CORRECT = "CORRECT",
    REVIEW = "REVIEW"
}
export enum PathsApiGuideSessionsRecoverableGetResponses200ContentApplicationJsonOneOf1SessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsPostResponses200ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsPostResponses201ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsSessionIdStepsStepKeyCompletePostResponses200ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsSessionIdStepsStepKeyCompletePostResponses201ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsSessionIdStepsStepKeyRecallPostResponses200ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsSessionIdStepsStepKeyRecallPostResponses200ContentApplicationJsonFeedbackOutcome {
    CORRECT = "CORRECT",
    REVIEW = "REVIEW"
}
export enum PathsApiGuideSessionsSessionIdStepsStepKeyRecallPostResponses201ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsSessionIdStepsStepKeyRecallPostResponses201ContentApplicationJsonFeedbackOutcome {
    CORRECT = "CORRECT",
    REVIEW = "REVIEW"
}
export enum PathsApiGuideSessionsSessionIdCancelPostResponses200ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsSessionIdCancelPostResponses201ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsSessionIdCompletePostResponses200ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiGuideSessionsSessionIdCompletePostResponses201ContentApplicationJsonSessionStatus {
    ACTIVE = "ACTIVE",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export enum PathsApiExperiencesDiscoveryBookSlugChapterOrderGetResponses200ContentApplicationJsonItemsScenesKind {
    INTRO = "INTRO",
    PASSAGE = "PASSAGE",
    CONCEPT = "CONCEPT",
    EXAMPLE = "EXAMPLE",
    AUDIO = "AUDIO",
    VIDEO = "VIDEO",
    PRACTICE = "PRACTICE",
    REFLECTION = "REFLECTION",
    QUESTION = "QUESTION",
    RECALL = "RECALL",
    SUMMARY = "SUMMARY",
    RESONANCE = "RESONANCE"
}
export enum PathsApiExperiencesDiscoveryBookSlugChapterOrderGetResponses200ContentApplicationJsonItemsScenesPayloadMediaKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum LogMoodDtoMood {
    great = "great",
    good = "good",
    ok = "ok",
    low = "low",
    hard = "hard"
}
export enum ContentUnitReadDtoSource {
    content_core = "content-core",
    legacy = "legacy"
}
export enum MarkHighlightDtoColor {
    YELLOW = "YELLOW",
    BLUE = "BLUE",
    PINK = "PINK"
}
export enum BookManifestDtoSource {
    content_core = "content-core",
    legacy = "legacy"
}
export enum LearningUnitProgressItemDtoState {
    not_started = "not_started",
    opened = "opened",
    completed = "completed"
}
export enum ContentStudioChapterResponseDtoRevisionStatus {
    DRAFT = "DRAFT",
    PUBLISHED = "PUBLISHED"
}
export enum ContentStudioMediaCardDtoKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum ContentStudioMediaCardDtoRuntimeAvailability {
    COMING_SOON = "COMING_SOON",
    AVAILABLE = "AVAILABLE"
}
export enum ContentStudioMediaCardDtoProvenance {
    CODE = "CODE",
    DATABASE = "DATABASE"
}
export enum ContentStudioMediaCardDtoEditorialStatus {
    CODE_OWNED = "CODE_OWNED",
    DRAFT = "DRAFT",
    PUBLISHED = "PUBLISHED"
}
export enum ContentStudioChapterMediaResponseDtoMissingKinds {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
export enum CreateComingSoonMediaDtoKind {
    AUDIOBOOK = "AUDIOBOOK",
    PODCAST = "PODCAST",
    VIDEO = "VIDEO"
}
