import type { Metadata } from "next";
import type {
  CircleActivityView,
  CircleIntro,
  CirclePreparationField,
  CircleSharingMode,
} from "@psico/types";
import { productionCircleTemplateRegistry } from "@psico/types";

import { readActivityAs, resolveActor } from "@/lib/circulos/actor";
import { SalaDuo } from "@/components/circulos/SalaDuo";
import { estilos as S } from "@/components/circulos/estilos";

/**
 * The Dúo room.
 *
 * The first paint comes from the server so the person does not watch a spinner
 * decide who they are: the same `CircleActivityView` the room will poll is
 * fetched here and handed down.
 *
 * ── One resolver, not two ──────────────────────────────────────────────────
 *
 * Who is acting is decided by `resolveActor`, the same function the polling
 * read and every command use. This file used to carry its own copy of that
 * policy, and the copy was the old, wrong one: it read the guest cookie first
 * and refused outright when the cookie was expired or named another activity —
 * without ever trying the member's perfectly valid session.
 *
 * So the bug survived in the place it hurt most. A member who had once opened
 * an invitation on that browser got the refusal screen on the FIRST render of
 * their own activity: the polling read would have let them in, but they never
 * saw the room long enough to poll. Two implementations of one authority rule
 * is one implementation and one liability.
 *
 * The order now lives in exactly one place: authorised member wins; otherwise a
 * live guest session bound to exactly this activity; otherwise an opaque
 * refusal. A transient failure on the member path stops rather than silently
 * demoting anybody to guest.
 *
 * ── The template ──────────────────────────────────────────────────────────
 *
 * Preparation fields come from the template the activity is PINNED to —
 * `getExact`, not `getPublished`, because an activity already running on a
 * template that was later archived has to keep working. They are copy (labels
 * and limits), never anybody's answers.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu actividad | FeelVerse",
  robots: { index: false, follow: false, nocache: true },
};

function templateShape(view: CircleActivityView | null): {
  fields: readonly CirclePreparationField[];
  allowedModes: readonly CircleSharingMode[];
  noConviene: readonly string[];
  minutosEstimados: number | null;
  intro: CircleIntro | null;
} {
  if (!view)
    return {
      fields: [],
      allowedModes: [],
      noConviene: [],
      minutosEstimados: null,
      intro: null,
    };
  try {
    const definition = productionCircleTemplateRegistry.getExact(
      view.templateKey,
      view.templateVersion,
    );
    return {
      fields: definition.privatePreparation,
      allowedModes: definition.sharing.allowedModes,
      // Copy, like the labels: the situations in which this activity is the
      // wrong instrument. Shown to each person alone, before they write
      // anything. Nothing about their answer comes back here.
      noConviene: definition.safety.doNotSuggestWhen,
      // The template's own estimate, so the room quotes the same number the
      // public preview does rather than deriving a second one.
      minutosEstimados: definition.estimatedMinutes,
      // Copy again: what the activity is for, and an optional disclosure
      // explaining why it is shaped this way. Absent on templates written
      // before it existed, which is why the room treats it as optional.
      intro: definition.intro ?? null,
    };
  } catch {
    // The activity is pinned to a template this build does not carry. The room
    // can still show state, the reveal and the artifact; what it cannot offer
    // is a preparation form whose questions it does not know. Better an honest
    // gap than invented fields.
    return {
      fields: [],
      allowedModes: ["KEEP_PRIVATE"],
      noConviene: [],
      minutosEstimados: null,
      intro: null,
    };
  }
}

export default async function SalaPage({
  params,
}: {
  params: { activityId: string };
}) {
  const actor = await resolveActor(params.activityId);
  const read = await readActivityAs(actor, params.activityId);
  const isGuest = actor.kind === "GUEST";

  if (!read.view && read.code === "CIRCLE_FORBIDDEN") {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Esta sala no está disponible</h1>
        <p style={S.p}>
          Puede que el enlace haya caducado, que ya se haya usado, o que esta
          sala no sea para ti. Pídele un enlace nuevo a la persona que te
          invitó.
        </p>
        <a href="/" style={S.secondary}>
          Ir al inicio
        </a>
      </main>
    );
  }

  const { fields, allowedModes, noConviene, minutosEstimados, intro } =
    templateShape(read.view);

  return (
    <SalaDuo
      activityId={params.activityId}
      initialView={read.view}
      initialError={read.view ? null : read.code}
      fields={fields}
      allowedModes={allowedModes}
      noConviene={noConviene}
      minutosEstimados={minutosEstimados}
      intro={intro}
      isGuest={isGuest}
    />
  );
}
