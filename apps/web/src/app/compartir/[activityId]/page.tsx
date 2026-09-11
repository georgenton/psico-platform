import type { Metadata } from "next";
import { cookies } from "next/headers";
import type {
  CircleActivityView,
  CirclePreparationField,
  CircleSharingMode,
} from "@psico/types";
import { productionCircleTemplateRegistry } from "@psico/types";

import {
  guestScope,
  readActivityAsGuest,
  readActivityAsMember,
} from "@/lib/circulos/bff";
import { GUEST_COOKIE } from "@/lib/circulos/guest-cookie";
import { getAccessToken } from "@/lib/api.server";
import { SalaDuo } from "@/components/circulos/SalaDuo";
import { estilos as S } from "@/components/circulos/estilos";

/**
 * The Dúo room.
 *
 * The first paint comes from the server so the person does not watch a spinner
 * decide who they are: the same `CircleActivityView` the room will poll is
 * fetched here, with the credential the cookies carry, and handed down.
 *
 * Which credential is used is decided here, never by the URL. A guest cookie
 * makes it a guest read and the resolved scope is compared against the
 * `activityId` in the path, so editing the path reaches a refusal rather than
 * another person's room. There is no query parameter that selects a role and no
 * prop through which the browser could claim one.
 *
 * The preparation fields come from the template the activity is PINNED to —
 * `getExact`, not `getPublished`, because an activity already running on a
 * template that was later archived has to keep working. They are copy (labels
 * and limits), never anybody's answers.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu actividad | FeelVerse",
  robots: { index: false, follow: false, nocache: true },
};

interface Resolved {
  readonly view: CircleActivityView | null;
  readonly error: string | null;
  readonly isGuest: boolean;
}

async function resolve(activityId: string): Promise<Resolved> {
  const guestToken = cookies().get(GUEST_COOKIE)?.value ?? null;

  if (guestToken) {
    const scope = await guestScope(guestToken);
    if (!scope.ok || !scope.data) {
      return {
        view: null,
        error: scope.code ?? "CIRCLE_FORBIDDEN",
        isGuest: true,
      };
    }
    if (scope.data.activityId !== activityId) {
      return { view: null, error: "CIRCLE_FORBIDDEN", isGuest: true };
    }
    const read = await readActivityAsGuest(guestToken, activityId);
    return {
      view: read.ok ? read.data : null,
      error: read.ok ? null : (read.code ?? "CIRCLE_FORBIDDEN"),
      isGuest: true,
    };
  }

  const accessToken = getAccessToken();
  if (!accessToken) {
    return { view: null, error: "CIRCLE_FORBIDDEN", isGuest: false };
  }
  const read = await readActivityAsMember(accessToken, activityId);
  return {
    view: read.ok ? read.data : null,
    error: read.ok ? null : (read.code ?? "CIRCLE_FORBIDDEN"),
    isGuest: false,
  };
}

function templateShape(view: CircleActivityView | null): {
  fields: readonly CirclePreparationField[];
  allowedModes: readonly CircleSharingMode[];
} {
  if (!view) return { fields: [], allowedModes: [] };
  try {
    const definition = productionCircleTemplateRegistry.getExact(
      view.templateKey,
      view.templateVersion,
    );
    return {
      fields: definition.privatePreparation,
      allowedModes: definition.sharing.allowedModes,
    };
  } catch {
    // The activity is pinned to a template this build does not carry. The room
    // can still show state, the reveal and the artifact; what it cannot offer
    // is a preparation form whose questions it does not know. Better an honest
    // gap than invented fields.
    return { fields: [], allowedModes: ["KEEP_PRIVATE"] };
  }
}

export default async function SalaPage({
  params,
}: {
  params: { activityId: string };
}) {
  const { view, error, isGuest } = await resolve(params.activityId);

  if (!view && error === "CIRCLE_FORBIDDEN") {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Esta sala no está disponible</h1>
        <p style={S.p}>
          Puede que el enlace haya caducado, que ya se haya usado, o que esta
          sala no sea para este dispositivo. Pídele un enlace nuevo a la persona
          que te invitó.
        </p>
        <a href="/" style={S.secondary}>
          Ir al inicio
        </a>
      </main>
    );
  }

  const { fields, allowedModes } = templateShape(view);

  return (
    <SalaDuo
      activityId={params.activityId}
      initialView={view}
      initialError={error}
      fields={fields}
      allowedModes={allowedModes}
      isGuest={isGuest}
    />
  );
}
