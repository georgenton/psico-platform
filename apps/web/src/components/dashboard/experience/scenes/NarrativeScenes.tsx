"use client";

/**
 * GR-6 — the three panels that only say something.
 *
 * `INTRO`, `EXAMPLE` and `SUMMARY` are presentational by contract (ADR 0021):
 * none can bind to a guide step, so none can move anybody's record. Their
 * behaviour really is identical — read, then continue — which is why they share
 * a base. Three consumers, one shape; the abstraction is earned.
 *
 * They stay THREE registry entries even so. A summary is not an intro, and the
 * day one of them needs to differ, the entry is already there to change.
 *
 * Every word they render came over the wire.
 */

import type { ExperienceSceneContext } from "../scene-contract";
import { SceneAction, SceneActions, SceneBody, SceneHeading } from "./scene-ui";

function NarrativePanel({
  scene,
  goForward,
  testId,
}: ExperienceSceneContext & { testId: string }) {
  return (
    <div data-testid={testId}>
      <SceneHeading>{scene.payload.title}</SceneHeading>
      {scene.payload.body.map((line) => (
        <SceneBody key={line}>{line}</SceneBody>
      ))}
      <SceneActions>
        <SceneAction label="Continuar" onClick={goForward} />
      </SceneActions>
    </div>
  );
}

export function IntroScene(ctx: ExperienceSceneContext) {
  return <NarrativePanel {...ctx} testId="scene-intro" />;
}

export function ExampleScene(ctx: ExperienceSceneContext) {
  return <NarrativePanel {...ctx} testId="scene-example" />;
}

/**
 * The editorial close of ONE experience — not the global Completion Summary,
 * which is a separate surface still to come. It adds the session's own numbers
 * to the server's words, so it cannot claim more than the ledger says.
 */
export function SummaryScene(ctx: ExperienceSceneContext) {
  const { session } = ctx;
  const registered = session?.stepsCompleted ?? 0;
  const total = session?.totalSteps ?? 0;
  return (
    <div data-testid="scene-summary">
      <SceneHeading>{ctx.scene.payload.title}</SceneHeading>
      {total > 0 ? (
        <SceneBody>{`Registraste ${registered} de ${total} pasos.`}</SceneBody>
      ) : null}
      {ctx.scene.payload.body.map((line) => (
        <SceneBody key={line}>{line}</SceneBody>
      ))}
      <SceneActions>
        <SceneAction label="Continuar" onClick={ctx.goForward} />
      </SceneActions>
    </div>
  );
}
