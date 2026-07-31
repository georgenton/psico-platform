/**
 * GR-2 — reader mode, and the compatibility bridge to what is already stored.
 *
 * Visible copy changed; stored values did not. The reader has been writing
 * `"libro"` and `"guia"` into `localStorage` since the S6 sprint, so migrating
 * those strings would either lose people's preference or need a one-off
 * rewrite. Neither is worth it for a rename:
 *
 *     "libro"        → Leer       (the default for anything unrecognised)
 *     "guia"         → Escuchar   (legacy value, still honoured verbatim)
 *     "ver"          → Ver        (new in GR-2)
 *
 * `LEGACY_READER_MODE_LOCALSTORAGE_MIGRATION=false` in the spec, and this file
 * is why that flag can stay false.
 *
 * There is no `"guiada"` mode: «Lectura guiada» is GR-3, and until its runtime
 * is wired the reader must not show a button that leads nowhere.
 */

export type ReaderMode = "leer" | "escuchar" | "ver";

export function storedToMode(stored: string | null): ReaderMode {
  if (stored === "guia") return "escuchar";
  if (stored === "ver") return "ver";
  return "leer";
}

export function modeToStored(mode: ReaderMode): string {
  if (mode === "escuchar") return "guia";
  if (mode === "ver") return "ver";
  return "libro";
}
