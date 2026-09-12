import Link from "next/link";

import {
  resolveDuoEntry,
  type DuoEligibilityDeps,
  type ExperiencePinInput,
} from "@/lib/circulos/eligibility";

/**
 * The one place a reading surface can offer a Dúo.
 *
 * A SERVER component, and that is the whole design. It calls the server-only
 * resolver, and what reaches the browser is the rendered anchor — a label and
 * an href — or nothing at all. The catalog, the mappings, the template source
 * and the reasons never cross the boundary, so there is no client copy of the
 * policy to disagree with the server's.
 *
 * ── Not eligible means ABSENT ──────────────────────────────────────────────
 *
 * `null` renders nothing: no disabled button, no greyed row, no "próximamente",
 * no reserved space. This follows the same rule the chapter surfaces already
 * hold (`UNKNOWN_MODE=HIDDEN`), and here it matters more than layout. A
 * disabled "Hacer esto con alguien" would tell a reader that this chapter has a
 * two-person activity and that they are being kept from it — which is both
 * untrue and, on material about coercion, precisely the wrong thing to say.
 *
 * The CTA navigates. It does not create anything, does not touch a
 * `GuideSession`, and does not mark a Guide complete: reading about something
 * and deciding to do it with another person are different acts, and only the
 * organiser's explicit confirmation on the next screen creates a Dúo.
 */

export interface DuoEntryPointProps {
  readonly pin: ExperiencePinInput;
  /** Injected in tests. Production resolves against the real catalog. */
  readonly deps?: DuoEligibilityDeps;
}

export function DuoEntryPoint({ pin, deps }: DuoEntryPointProps) {
  const entry = deps ? resolveDuoEntry(pin, deps) : resolveDuoEntry(pin);
  if (!entry) return null;

  return (
    <div
      style={{
        margin: "16px 0",
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid var(--color-warm-200, #e7e2d9)",
        background: "var(--color-warm-50, #faf8f4)",
      }}
    >
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--color-warm-600, #6b655d)",
        }}
      >
        Esto también se puede hacer entre dos personas, cada una preparándose
        por su cuenta antes de compartir nada.
      </p>
      <Link
        href={entry.href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 44,
          padding: "0 18px",
          borderRadius: 10,
          background: "#3d3d45",
          color: "#fff",
          fontWeight: 600,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        {entry.label}
      </Link>
    </div>
  );
}
