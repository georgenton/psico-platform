/**
 * Content Core — pure identity / diff / anchor libraries (CC-1).
 *
 * No schema, no NestJS, no I/O — deterministic functions consumed later by the
 * ingest tool (CC-5) and the API read/anchor paths (CC-4+). See
 * docs/architecture/content-core.md and ADR 0016.
 */
export * from "./block-key";
export * from "./content-hash";
export * from "./matcher";
export * from "./revision-manifest";
export * from "./anchor-resolver";
export * from "./map-projection";
