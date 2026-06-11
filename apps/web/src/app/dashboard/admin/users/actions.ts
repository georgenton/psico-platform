"use server";

import { revalidatePath } from "next/cache";
import type {
  PulsoChangeRoleResponse,
  UserRole,
} from "@psico/types";
import { serverFetch } from "@/lib/api.server";

export async function changeUserRoleAction(
  userId: string,
  role: UserRole,
  reason: string,
): Promise<PulsoChangeRoleResponse> {
  const result = await serverFetch<PulsoChangeRoleResponse>(
    `/pulso/users/${userId}/role`,
    {
      method: "POST",
      body: JSON.stringify({ role, reason: reason.trim() || undefined }),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath("/dashboard/admin/users");
  return result;
}
