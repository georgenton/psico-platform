"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectableGuideOption } from "@psico/types";

import { listSelectableGuidesAction } from "../../actions";

/**
 * C.4 (#639) — picking the guide an experience binds to.
 *
 * ── The three states are three states ───────────────────────────────────────
 *
 * `AVAILABLE`, `OWNED_BY_THIS_EXPERIENCE`, `RESERVED_BY_ANOTHER_EXPERIENCE`. A
 * reserved guide is shown, disabled, and named as reserved — never hidden. "That
 * guide does not exist" would be false and unactionable: an editor who cannot
 * see the collision cannot resolve it. Who holds it is not disclosed.
 *
 * ── Availability is the server's answer ─────────────────────────────────────
 *
 * Nothing here filters. The list arrives decided, and the server decides again
 * under the chapter lock when the write happens — because between rendering
 * this and clicking it, a colleague can reserve the same guide.
 *
 * ── The load is a state machine, and a failure keeps the choice ─────────────
 *
 * Same discipline C.2 settled on for the reader's cards: idle/loading/ready/
 * error, no CTA while the answer is missing, an explicit retry, and — the part
 * that matters to somebody mid-edit — a failed reload does not throw away what
 * they had already selected.
 */

type Load =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; options: SelectableGuideOption[] }
  | { status: "error" };

const LABEL: Record<SelectableGuideOption["availability"], string> = {
  AVAILABLE: "Disponible",
  OWNED_BY_THIS_EXPERIENCE: "Ya es de esta experiencia",
  RESERVED_BY_ANOTHER_EXPERIENCE: "Reservada por otra experiencia",
};

export function GuideSelector({
  bookSlug,
  chapterOrder,
  experienceKey,
  value,
  onChange,
  disabled = false,
}: {
  bookSlug: string;
  chapterOrder: number;
  /** Whose point of view, so the guide this lineage holds reads as its own. */
  experienceKey: string | null;
  value: { guideKey: string; guideVersion: number } | null;
  onChange: (pin: { guideKey: string; guideVersion: number }) => void;
  disabled?: boolean;
}) {
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const [nonce, setNonce] = useState(0);
  // The selection lives here, not in the load: a failed reload must not discard
  // what the editor already chose.
  const chosen = useRef(value);
  chosen.current = value;

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    void listSelectableGuidesAction(bookSlug, chapterOrder, experienceKey).then(
      (options) => {
        if (!cancelled) setLoad({ status: "ready", options });
      },
      () => {
        if (!cancelled) setLoad({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bookSlug, chapterOrder, experienceKey, nonce]);

  if (load.status === "idle" || load.status === "loading") {
    return (
      <p
        role="status"
        data-testid="guide-selector-loading"
        className="text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Consultando las guías disponibles…
      </p>
    );
  }

  if (load.status === "error") {
    return (
      <div role="alert" data-testid="guide-selector-error">
        <p className="text-[12.5px]" style={{ color: "#B91C1C" }}>
          No pudimos consultar las guías de este capítulo.
        </p>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="mt-1 text-[13px] font-semibold"
          style={{ color: "var(--color-lavender-600)", minHeight: 44 }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (load.options.length === 0) {
    return (
      <p
        data-testid="guide-selector-empty"
        className="text-[12.5px]"
        style={{ color: "var(--color-warm-600)" }}
      >
        Este capítulo no tiene ninguna guía cuyo pasaje viva aquí.
      </p>
    );
  }

  return (
    <fieldset data-testid="guide-selector" className="mt-2">
      <legend className="text-[12.5px] font-semibold">Guía</legend>
      {load.options.map((option) => {
        const id = `guide-${option.guideKey}-${option.guideVersion}`;
        const selectable =
          option.availability !== "RESERVED_BY_ANOTHER_EXPERIENCE";
        const isChosen =
          chosen.current?.guideKey === option.guideKey &&
          chosen.current?.guideVersion === option.guideVersion;
        return (
          <div key={id} className="mt-1.5 flex items-center gap-2">
            <input
              type="radio"
              id={id}
              name="guidePin"
              checked={isChosen}
              disabled={disabled || !selectable}
              onChange={() =>
                onChange({
                  guideKey: option.guideKey,
                  guideVersion: option.guideVersion,
                })
              }
              aria-describedby={`${id}-state`}
            />
            <label htmlFor={id} className="text-[13px]">
              {option.guideKey} · v{option.guideVersion} · {option.stepCount}{" "}
              pasos
            </label>
            <span
              id={`${id}-state`}
              data-testid={`${id}-state`}
              className="text-[11.5px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {LABEL[option.availability]}
            </span>
          </div>
        );
      })}
    </fieldset>
  );
}
