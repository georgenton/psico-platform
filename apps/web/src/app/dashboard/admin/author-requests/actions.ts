"use server";

import { revalidatePath } from "next/cache";
import { serverFetch } from "@/lib/api.server";

/**
 * Server actions for the author-requests admin page (Sprint S71.B-front).
 *
 * Both actions revalidate /dashboard/admin/author-requests so the list
 * refreshes optimistically. Errors bubble up as Error throws — the
 * Client Component catches and surfaces an inline message.
 */
export async function approveAuthorRequestAction(
  requestId: string,
): Promise<{ ok: true; bookId: string; slug: string; chapters: number }> {
  const result = await serverFetch<{
    ok: true;
    bookId: string;
    slug: string;
    chapters: number;
  }>(`/pulso/author-requests/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
  });
  revalidatePath("/dashboard/admin/author-requests");
  return result;
}

export async function rejectAuthorRequestAction(
  requestId: string,
  feedback: string,
): Promise<{ ok: true }> {
  const result = await serverFetch<{ ok: true }>(
    `/pulso/author-requests/${requestId}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ feedback: feedback.trim() || undefined }),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath("/dashboard/admin/author-requests");
  return result;
}
