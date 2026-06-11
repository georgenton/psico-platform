"use server";

import { revalidatePath } from "next/cache";
import type {
  UpdateAuthorPayoutRequest,
  UpdateAuthorPayoutResponse,
} from "@psico/types";
import { serverFetch } from "@/lib/api.server";

export async function updatePayoutSettingsAction(
  body: UpdateAuthorPayoutRequest,
): Promise<UpdateAuthorPayoutResponse> {
  const result = await serverFetch<UpdateAuthorPayoutResponse>(
    "/autor/cobros/configuracion",
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath("/autor/cobros");
  return result;
}
