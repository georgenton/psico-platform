import { redirect } from "next/navigation";

/**
 * /dashboard/diario/[id] — Sprint B4 redirect alias.
 *
 * Mirrors the parent `/dashboard/diario` redirect so detail-link bookmarks
 * keep working after the rename. Forwards the entry id so the new page can
 * fetch + decrypt the same row.
 */
export default async function DiarioEntryRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/reflexiones/${id}`);
}
