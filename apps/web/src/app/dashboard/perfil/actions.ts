"use server";

import { revalidatePath } from "next/cache";
import type {
  UpdatePreferencesRequest,
  UpdatePrivacyRequest,
} from "@psico/types";
import { serverFetch } from "@/lib/api.server";

export async function updatePreferencesAction(
  body: UpdatePreferencesRequest,
): Promise<{ ok: true }> {
  await serverFetch<{ ok: true }>("/user/preferences", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: true };
}

export async function updatePrivacyAction(
  body: UpdatePrivacyRequest,
): Promise<{ ok: true }> {
  await serverFetch<{ ok: true }>("/user/privacy", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: true };
}
