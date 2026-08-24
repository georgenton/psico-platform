"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { rebindDraftAction } from "../../../../actions";
import { GuideSelector } from "../../GuideSelector";

/**
 * C.4 (#639) — changing the guide a draft is bound to.
 *
 * ── Why it lives here and not in the chapter list ───────────────────────────
 *
 * The binding is a property of the draft, and the draft editor is where an
 * editor already has the context to judge it: they can see the scenes that
 * reference the guide's steps. Offering it from the list would mean changing
 * something you are not currently looking at.
 *
 * ── The control is absent, not disabled, once it cannot be used ─────────────
 *
 * `rebindable` is decided by the server and is about the LINEAGE: one published
 * version anywhere fixes the guide forever. A disabled button with a tooltip
 * would still read as "this might work"; saying the rule in a sentence and
 * showing no control says what is true.
 *
 * ── A failed change keeps the choice ────────────────────────────────────────
 *
 * Same discipline as everywhere else in this CMS: the selection lives above the
 * request, so a colleague taking the guide first leaves the editor looking at
 * what they picked and a message about what happened — not an empty form.
 */
export function GuideBindingCard({
  id,
  bookSlug,
  chapterOrder,
  experienceKey,
  currentPin,
  rebindable,
  contentUnitId,
}: {
  id: string;
  bookSlug: string;
  chapterOrder: number;
  /** Whose point of view, so this lineage's own guide reads as its own. */
  experienceKey: string;
  currentPin: { guideKey: string; guideVersion: number };
  rebindable: boolean;
  contentUnitId: string | null;
}) {
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const [pin, setPin] = useState<{
    guideKey: string;
    guideVersion: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed =
    pin !== null &&
    (pin.guideKey !== currentPin.guideKey ||
      pin.guideVersion !== currentPin.guideVersion);

  async function confirm() {
    // Guarded in the handler, not only by `disabled`: a double click must not
    // send two rebinds, and the second would race the first's own result.
    if (busy || !changed) return;
    setBusy(true);
    setError(null);
    try {
      await rebindDraftAction(bookSlug, chapterOrder, id, pin, contentUnitId);
      setChoosing(false);
      setPin(null);
      router.refresh();
    } catch {
      // The selection survives on purpose. Making the editor pick again would
      // punish them for a collision they did not cause.
      setError(
        "No pudimos cambiar la guía. Puede que otra persona la haya tomado, " +
          "o que esta experiencia ya tenga una versión publicada.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-6 rounded-2xl px-5 py-4"
      style={{ background: "#fff", border: "1px solid var(--color-warm-200)" }}
      data-testid="guide-binding-card"
    >
      <h2
        className="text-[13px] font-semibold"
        style={{ color: "var(--color-warm-800)" }}
      >
        Guía
      </h2>
      <p
        className="mt-0.5 text-[13px]"
        style={{ color: "var(--color-warm-700)" }}
        data-testid="guide-binding-current"
      >
        {currentPin.guideKey} · v{currentPin.guideVersion}
      </p>

      {!rebindable ? (
        <p
          className="mt-2 text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
          data-testid="guide-binding-locked"
        >
          Esta experiencia ya tiene una versión publicada, así que su guía queda
          fija. Para otra guía, crea una experiencia nueva.
        </p>
      ) : !choosing ? (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="mt-2 text-[13px] font-semibold"
          style={{ color: "var(--color-lavender-600)", minHeight: 44 }}
          data-testid="guide-binding-change"
        >
          Cambiar guía
        </button>
      ) : (
        <div className="mt-2">
          <GuideSelector
            bookSlug={bookSlug}
            chapterOrder={chapterOrder}
            experienceKey={experienceKey}
            value={pin ?? currentPin}
            onChange={setPin}
            disabled={busy}
          />

          {error ? (
            <p
              role="alert"
              className="mt-2 text-[12.5px]"
              style={{ color: "#B91C1C" }}
            >
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy || !changed}
              className="rounded-full px-4 text-[13px] font-semibold text-white disabled:opacity-60"
              style={{
                background: "var(--color-lavender-500)",
                minHeight: 44,
              }}
              data-testid="guide-binding-confirm"
            >
              {busy ? "Cambiando…" : "Confirmar cambio"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChoosing(false);
                setPin(null);
                setError(null);
              }}
              disabled={busy}
              className="text-[13px] disabled:opacity-60"
              style={{ color: "var(--color-warm-600)", minHeight: 44 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
