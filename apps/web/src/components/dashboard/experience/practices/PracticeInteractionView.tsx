"use client";

/**
 * The practice interaction, loaded and rendered by kind.
 *
 * Three states worth naming, because a practice that silently shows nothing is
 * indistinguishable from one that has nothing to show:
 *
 *   - loading, while the request is in flight;
 *   - error, with a retry, when it fails — recoverable, never a dead end;
 *   - absent, when the scene declares no `exerciseKey`, which is the older
 *     `guided_reflection` shape and renders as copy plus a button.
 *
 * A kind this build does not know renders the same honest fallback as an
 * error. Guessing at an unknown shape is how a reader ends up with an empty box
 * and no way to tell whether they missed something.
 *
 * Nothing in here can complete a step: the confirmation lives in the scene, and
 * this component has no callback that reaches it.
 */

import { useCallback, useEffect, useState } from "react";
import type { PracticePublicView } from "@psico/types";
import {
  BeliefLens,
  ContextPlausibility,
  FourPartDistinction,
  SignalContextCompare,
} from "./ChoicePractices";
import { SequenceOrdering } from "./SequenceOrdering";
import { practiceStyles as S } from "./practice-ui";

export interface PracticeFetchContext {
  apiBase: string;
  token: string;
}

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; view: PracticePublicView }
  | { phase: "error" };

export function PracticeInteractionView({
  exerciseKey,
  fetchContext,
}: {
  exerciseKey: string | undefined;
  fetchContext: PracticeFetchContext | null;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  const load = useCallback(async () => {
    if (!exerciseKey || !fetchContext) return;
    setState({ phase: "loading" });
    try {
      const res = await fetch(
        `${fetchContext.apiBase}/learning/practices/${encodeURIComponent(exerciseKey)}`,
        { headers: { Authorization: `Bearer ${fetchContext.token}` } },
      );
      if (!res.ok) {
        setState({ phase: "error" });
        return;
      }
      setState({
        phase: "ready",
        view: (await res.json()) as PracticePublicView,
      });
    } catch {
      setState({ phase: "error" });
    }
  }, [exerciseKey, fetchContext]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!exerciseKey || !fetchContext) return null;

  if (state.phase === "loading" || state.phase === "idle") {
    return (
      <p style={S.hint} data-testid="practice-loading" aria-live="polite">
        Cargando la práctica…
      </p>
    );
  }

  if (state.phase === "error") {
    return (
      <div data-testid="practice-error">
        <p style={S.hint}>
          No se pudo cargar la práctica. Puedes reintentar, o hacerla por tu
          cuenta y marcarla igual.
        </p>
        <button type="button" style={S.ghostButton} onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }

  const { interaction } = state.view;
  switch (interaction.kind) {
    case "belief_lens":
      return <BeliefLens interaction={interaction} />;
    case "context_plausibility":
      return <ContextPlausibility interaction={interaction} />;
    case "sequence_ordering":
      return <SequenceOrdering interaction={interaction} />;
    case "four_part_distinction":
      return <FourPartDistinction interaction={interaction} />;
    case "signal_context_compare":
      return <SignalContextCompare interaction={interaction} />;
    default:
      return (
        <p style={S.hint} data-testid="practice-unknown-kind">
          Esta práctica necesita una versión más reciente de la aplicación.
          Puedes seguir con el recorrido.
        </p>
      );
  }
}
