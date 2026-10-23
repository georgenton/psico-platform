"use client";

/**
 * CrisisModal — Sprint front-eco.
 *
 * Non-negotiable surface per ADR 0007 + docs/design/handoff/08-eco.md.
 * When the server emits a `crisis` SSE event (layer-1 regex or layer-2
 * LLM sentinel), the chat suspends normal flow and shows this modal with
 * the verbatim derivation message + hotline.
 *
 * UX rules:
 *   - Modal is dismissable (the user can acknowledge and close), but the
 *     hotline link opens in a new tab so the user keeps the modal visible
 *     while they dial.
 *   - Body text comes from the server (canned in `crisis.ts`) — we render
 *     it as-is. Localising or rewriting it client-side would defeat the
 *     audit trail.
 */
export function CrisisModal({
  text,
  hotline,
  onClose,
}: {
  text: string;
  hotline: string;
  /** Path within the app where the full crisis page lives. */
  crisisPath: string;
  onClose: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="crisis-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl"
        style={{
          background: "var(--fv-surface)",
          border: "1.5px solid var(--color-error-border)",
        }}
      >
        <div
          className="px-6 pt-6 pb-3"
          style={{ background: "var(--color-error-bg)" }}
        >
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "var(--fv-surface)" }}
            aria-hidden
          >
            <span className="text-2xl">💛</span>
          </div>
          <h2
            id="crisis-title"
            className="mt-3 text-center text-[18px] font-bold"
            style={{ color: "var(--color-error-text)" }}
          >
            Estamos contigo
          </h2>
        </div>
        <div className="px-6 py-5">
          <p
            className="whitespace-pre-wrap text-sm leading-relaxed"
            style={{ color: "var(--color-warm-800)" }}
          >
            {text}
          </p>

          <a
            href={`tel:${hotline.replace(/\s|\(.+?\)/g, "")}`}
            className="mt-5 block w-full rounded-2xl px-5 py-3 text-center text-sm font-bold text-white"
            style={{ background: "#B91C1C" }}
          >
            📞 Llamar ahora · {hotline}
          </a>

          <button
            type="button"
            onClick={onClose}
            // `py-3` y no `py-2.5`: con el relleno anterior el control medía
            // 40 px y el objetivo táctil del proyecto son 44. Es el mismo
            // relleno que ya tiene el botón de llamada, que mide 44 justos.
            className="mt-3 block w-full rounded-2xl px-5 py-3 text-center text-sm font-semibold"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            Entendido
          </button>

          <p
            className="mt-4 text-center text-[11px]"
            // `--fv-muted` en vez de `--color-warm-500`, y la razón NO es
            // el contraste: es que una rampa no promete nada.
            //
            // Conviene decirlo así porque la medida, sola, no sostiene el
            // cambio. En el panel, sobre la superficie de la tarjeta:
            // Noche 5,99 → 7,10 · Calma sin cambio · Enfoque 6,93 → 5,29 y
            // 6,05 · Energía 5,85 → 5,29 y 6,05. Mejora uno y empeora dos, y
            // los ocho estados estaban ya por encima de 4,5 antes y después.
            // Como reparación de contraste, no lo es.
            //
            // Lo que sí cambia es la garantía. `--color-warm-500` es un valor
            // de rampa: `color-contracts.ts` prohíbe expresamente que un
            // contrato apunte a una —«las rampas no prometen nada, y por eso
            // no se prueban»—, así que este texto no tenía ningún suelo
            // vigilado y su valor puede moverse por tema y por ambiente sin
            // que nada lo note. `--fv-muted` es el token auxiliar del sistema
            // aprobado, está bajo contrato y se mide en los ocho estados.
            //
            // Se cambia por eso, y se declara como alineación con el sistema,
            // no como arreglo de un incumplimiento que no existía.
            style={{ color: "var(--fv-muted)" }}
          >
            Si no estás en Ecuador, busca tu línea local — los números
            internacionales están en{" "}
            <a
              href="https://findahelpline.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              findahelpline.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
