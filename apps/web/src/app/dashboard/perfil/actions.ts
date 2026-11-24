"use server";

import { revalidatePath } from "next/cache";
import type { UpdatePreferencesRequest } from "@psico/types";
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
