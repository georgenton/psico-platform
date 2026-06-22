"use client";

/**
 * ExportButton — Sprint F2.
 *
 * The design's `.btn.ghost` "Exportar" button that sits in the right of
 * the screen-head on Mapa + Evolución. Triggers the browser's native
 * print dialog, which lets the user save the surface as PDF.
 *
 * Not a full data-export endpoint (that lives in `UsersService.requestDataExport`
 * and ships a JSON of the whole account, not a single screen) — this is
 * purely a UI-side print path so the user can keep a snapshot of what
 * they're seeing right now.
 */
export function ExportButton({ label = "Exportar" }: { label?: string }) {
  function handleClick() {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  }

  return (
    <button
      type="button"
      className="btn ghost"
      onClick={handleClick}
      title="Imprime o guarda esta vista como PDF"
    >
      <svg
        className="ic"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3 V15" />
        <path d="M7.5 10.5 L12 15 L16.5 10.5" />
        <path d="M4 20 H20" />
      </svg>
      {label}
    </button>
  );
}
