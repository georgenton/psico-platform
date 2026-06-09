/**
 * DI token for the video provider binding. Same pattern as APNS_PROVIDER
 * (ADR 0012) and VOICE_PROVIDER. Lets us swap ConsoleVideoProvider for
 * DailyVideoProvider at module bind time without touching consumers.
 */
export const VIDEO_PROVIDER = Symbol("VIDEO_PROVIDER");
