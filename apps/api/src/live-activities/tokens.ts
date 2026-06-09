/**
 * DI token for the APNs provider binding. Same pattern as
 * STRIPE_PROVIDER, VOICE_PROVIDER. Lets us swap ConsoleApnsProvider for
 * Apns2Provider at module bind time without touching consumers.
 */
export const APNS_PROVIDER = Symbol("APNS_PROVIDER");
