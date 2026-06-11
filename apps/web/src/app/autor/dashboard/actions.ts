"use server";

import { revalidatePath } from "next/cache";
import type { CreateAuthorBookResponse } from "@psico/types";
import { serverFetch } from "@/lib/api.server";

export async function createBookAction(
  title: string,
): Promise<CreateAuthorBookResponse> {
  const result = await serverFetch<CreateAuthorBookResponse>(
    "/autor/libros",
    {
      method: "POST",
      body: JSON.stringify({ title }),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath("/autor/dashboard");
  return result;
}
