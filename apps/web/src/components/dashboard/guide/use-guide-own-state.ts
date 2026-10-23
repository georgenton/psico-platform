"use client";

/**
 * B4 — dónde está ESTA persona en un pin exacto, según el servidor.
 *
 * Una lectura pequeña y deliberadamente separada de `useGuideRun`: ese monta
 * un recorrido y necesita el reproductor entero, y hay dos sitios que sólo
 * quieren saber «¿esta persona tiene algo aquí?» sin montar nada —la tarjeta
 * de Exploraciones y la pantalla cuando la guía no está habilitada—.
 *
 * ── Por qué el servidor y no `localStorage` ────────────────────────────────
 *
 * La tarjeta decidía su rótulo con un registro local, que es una pista y no
 * una sesión: dice que ESTE navegador empezó algo alguna vez, no que exista
 * un recorrido abierto, ni de quién es, ni en qué punto está. Con él se
 * prometía «Continuar» sobre sesiones que ya no existían y se decía «Abrir»
 * a quien sí tenía progreso. El ledger es la autoridad; esto lo pregunta.
 *
 * ── Por qué se pregunta incluso cuando la guía no está habilitada ──────────
 *
 * Porque el servidor contesta. `GET /guide/sessions/state` no pasa por el
 * guard de rollout —sólo lo hacen los cinco COMANDOS—, así que consultar el
 * propio avance sigue permitido cuando ejecutar nuevas operaciones de
 * aprendizaje no lo está. Son dos permisos distintos y el servidor ya los
 * distingue; lo que faltaba era que el cliente dejara de confundirlos.
 */

import { useEffect, useState } from "react";
import { guideApi } from "@psico/api-client";
import type { GuideSessionView } from "@psico/types";
import type { GuidePin } from "./guide-pin";

export type OwnStateStatus = "loading" | "ready" | "error";

export interface OwnState {
  status: OwnStateStatus;
  /** `null` mientras no se sabe; nunca se adivina. */
  state: "NOT_STARTED" | "ACTIVE" | "COMPLETED" | null;
  session: GuideSessionView | null;
}

const DESCONOCIDO: OwnState = {
  status: "loading",
  state: null,
  session: null,
};

export function useGuideOwnState(pin: GuidePin, enabled: boolean): OwnState {
  const [estado, setEstado] = useState<OwnState>(DESCONOCIDO);
  const { guideKey, guideVersion } = pin;

  useEffect(() => {
    if (!enabled) {
      setEstado(DESCONOCIDO);
      return;
    }
    let cancelado = false;
    void (async () => {
      try {
        const r = await guideApi.getExperienceState({ guideKey, guideVersion });
        if (cancelado) return;
        setEstado({
          status: "ready",
          state: r.state,
          session: r.session ?? null,
        });
      } catch {
        // Falla cerrado, y «cerrado» aquí significa «no sé», no «no tienes
        // nada»: quien lo lee no debe poder confundir un fallo de red con la
        // ausencia de un recorrido.
        if (!cancelado) {
          setEstado({ status: "error", state: null, session: null });
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [enabled, guideKey, guideVersion]);

  return estado;
}
