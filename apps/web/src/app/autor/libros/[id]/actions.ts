"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  UpdateAuthorBookRequest,
  UpdateAuthorChapterRequest,
  UpdateAuthorStructureRequest,
} from "@psico/types";
import { serverFetch } from "@/lib/api.server";

export async function updateBookAction(
  bookId: string,
  body: UpdateAuthorBookRequest,
): Promise<{ ok: true }> {
  await serverFetch<{ ok: true; updatedAt: Date }>(
    `/autor/libros/${bookId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath(`/autor/libros/${bookId}`);
  return { ok: true };
}

export async function archiveBookAction(bookId: string): Promise<void> {
  await serverFetch<{ ok: true }>(`/autor/libros/${bookId}`, {
    method: "DELETE",
  });
  revalidatePath("/autor/dashboard");
  redirect("/autor/dashboard");
}

export async function updateChapterAction(
  bookId: string,
  n: number,
  body: UpdateAuthorChapterRequest,
): Promise<{ ok: true; version: number }> {
  const result = await serverFetch<{ ok: true; version: number }>(
    `/autor/libros/${bookId}/capitulos/${n}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath(`/autor/libros/${bookId}/capitulos/${n}`);
  return result;
}

export async function updateStructureAction(
  bookId: string,
  body: UpdateAuthorStructureRequest,
): Promise<{ ok: true; count: number }> {
  const result = await serverFetch<{ ok: true; count: number }>(
    `/autor/libros/${bookId}/estructura`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath(`/autor/libros/${bookId}`);
  revalidatePath(`/autor/libros/${bookId}/estructura`);
  return result;
}

export async function submitForReviewAction(
  bookId: string,
): Promise<{ ok: true; submittedAt: Date }> {
  const result = await serverFetch<{ ok: true; submittedAt: Date }>(
    `/autor/libros/${bookId}/publicar`,
    {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath(`/autor/libros/${bookId}`);
  revalidatePath("/autor/dashboard");
  return result;
}

export async function unpublishAction(
  bookId: string,
): Promise<{ ok: true }> {
  const result = await serverFetch<{ ok: true }>(
    `/autor/libros/${bookId}/despublicar`,
    {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    },
  );
  revalidatePath(`/autor/libros/${bookId}`);
  revalidatePath("/autor/dashboard");
  return result;
}
