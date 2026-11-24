"use server";

import { revalidatePath } from "next/cache";
import type { UserMeResponse } from "@psico/types";

import { ApiError } from "@/lib/api";
import { isNextThrow, serverFetch } from "@/lib/api.server";

/**
 * Server actions — Sprint S57 (Perfil UI).
 *
 * Wraps the User module endpoints in `apps/api/src/users/users.controller.ts`
 * so the perfil page can submit forms without exposing the Bearer token to
 * the browser.
 */

export type UpdateProfileFields = {
  firstName?: string;
  city?: string | null;
  country?: string | null;
};

export async function updateProfileAction(
  fields: UpdateProfileFields,
): Promise<UserMeResponse> {
  const me = await serverFetch<UserMeResponse>("/user/profile", {
    method: "PATCH",
    body: JSON.stringify(fields),
    headers: { "Content-Type": "application/json" },
  });
  // El nombre ya no vive sólo en esta pantalla: el armazón lo pinta en la barra
  // y en el carril. Se invalida el layout entero para que cambie en los tres.
  revalidatePath("/dashboard", "layout");
  return me;
}

export async function requestDataExportAction(): Promise<{
  ok: true;
  expectedAt: string;
}> {
  return await serverFetch<{ ok: true; expectedAt: string }>(
    "/user/data-export",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
}

/**
 * Ask the API for a temporary download of the caller's finished export.
 *
 * The URL is minted per request and lives for two minutes, so it is fetched when
 * the button is pressed rather than rendered into the page — a signed URL sitting
 * in HTML is one that was already expired by the time anybody clicked it.
 *
 * `latest` instead of a row id: the 30-day cooldown means a user only ever has
 * one export in hand, and nothing in `/user/me` carries the id.
 */
export async function getDataExportDownloadAction(): Promise<{
  url: string;
  expiresInSec: number;
}> {
  return await serverFetch<{ url: string; expiresInSec: number }>(
    "/user/data-export/latest/download",
  );
}

export async function requestAccountDeleteAction(
  password: string,
  reason?: string,
): Promise<{ ok: true; deleteAt: string }> {
  const res = await serverFetch<{ ok: true; deleteAt: string }>(
    "/user/delete-request",
    {
      method: "POST",
      body: JSON.stringify({ password, reason }),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath("/dashboard/perfil");
  return res;
}

export type CancelAccountDeleteResult =
  | { ok: true }
  /** `null` when no answer arrived, which is not the same as a refusal. */
  | { ok: false; status: number | null };

/**
 * Undo a pending deletion.
 *
 * Returns the refusal instead of throwing it: in production Next replaces the
 * message of an error thrown by an action with a digest, so the screen could
 * never tell «it is too late» from «try again». The status is enough to choose
 * the sentence, and the sentence is written in `@psico/types`.
 *
 * Revalidates, like the request does. Without it the client router cache keeps
 * serving the page as it was, and somebody who cancels, looks at another screen
 * and comes back reads «Borrado programado» again.
 */
export async function cancelAccountDeleteAction(): Promise<CancelAccountDeleteResult> {
  try {
    await serverFetch("/user/delete-request/cancel", { method: "POST" });
  } catch (err) {
    // `redirect("/logout")` travels as a throw. Swallowing it would leave a
    // person without a session on a page that says «try again».
    if (isNextThrow(err)) throw err;
    return { ok: false, status: err instanceof ApiError ? err.status : null };
  }
  revalidatePath("/dashboard/perfil");
  return { ok: true };
}
