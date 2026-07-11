"use server";

import { revalidatePath } from "next/cache";
import { serverFetch } from "@/lib/api.server";

/**
 * Fase E (ARC cycle) — delete a confirmed resonance from the map for real.
 * V2 principle: every insight can be eliminated by its owner.
 */
export async function deleteResonanceAction(id: string): Promise<{ ok: true }> {
  await serverFetch<{ ok: true }>(`/resonances/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  revalidatePath("/dashboard/mapa");
  return { ok: true };
}
