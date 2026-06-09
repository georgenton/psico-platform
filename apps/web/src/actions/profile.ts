"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserMeResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";

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
  revalidatePath("/dashboard/perfil");
  return me;
}

export async function requestEmailChangeAction(
  newEmail: string,
): Promise<{ ok: true; verificationSentTo: string }> {
  const res = await serverFetch<{ ok: true; verificationSentTo: string }>(
    "/user/email-change-request",
    {
      method: "POST",
      body: JSON.stringify({ newEmail }),
      headers: { "Content-Type": "application/json" },
    },
  );
  return res;
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

export async function requestAccountDeleteAction(
  password: string,
  reason?: string,
): Promise<{ ok: true; deleteAt: string }> {
  return await serverFetch<{ ok: true; deleteAt: string }>(
    "/user/delete-request",
    {
      method: "POST",
      body: JSON.stringify({ password, reason }),
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function logoutFromPerfilAction(): Promise<never> {
  const { cookies } = await import("next/headers");
  const { TOKEN_NAMES } = await import("@/lib/cookies");
  const store = cookies();
  store.delete(TOKEN_NAMES.access);
  store.delete(TOKEN_NAMES.refresh);
  redirect("/login");
}
