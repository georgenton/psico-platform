import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { AdminExperienceDraft } from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import { DraftEditor } from "./DraftEditor";
import { GuideBindingCard } from "./GuideBindingCard";

export const metadata: Metadata = { title: "Pulso · Borrador" };
export const dynamic = "force-dynamic";

/**
 * CMS V1 (#637) — the draft editor shell.
 *
 * A published version opens read-only rather than 404: an editor who followed a
 * stale link should be told what happened and where to go, not shown nothing.
 */
export default async function AdminDraftEditorPage({
  params,
}: {
  params: { bookSlug: string; chapterOrder: string; id: string };
}) {
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  const chapterOrder = Number(params.chapterOrder);
  let draft: AdminExperienceDraft | null = null;
  try {
    draft = await serverFetch<AdminExperienceDraft>(
      `/pulso/experiences/drafts/${encodeURIComponent(params.id)}`,
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }
  if (draft === null) notFound();

  const backHref = `/dashboard/admin/experiencias/${params.bookSlug}/${chapterOrder}`;

  return (
    <div className="mx-auto max-w-[900px]">
      <header className="mb-6">
        <Link
          href={backHref}
          className="text-[12.5px]"
          style={{ color: "var(--color-lavender-600)" }}
        >
          ← Experiencias del capítulo
        </Link>
        <h1
          className="mt-2 text-[22px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {draft.definition.title}
        </h1>
      </header>

      {draft.status === "PUBLISHED" ? (
        <p
          className="rounded-2xl px-5 py-4 text-[13.5px]"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
          data-testid="published-immutable-notice"
        >
          Esta versión ya está publicada y no se edita. Para cambiarla, crea una
          versión nueva a partir de ella desde{" "}
          <Link href={backHref} style={{ color: "var(--color-lavender-600)" }}>
            las experiencias del capítulo
          </Link>
          .
        </p>
      ) : (
        <>
          <DraftEditor
            id={draft.id}
            initial={draft.definition}
            bookSlug={params.bookSlug}
            chapterOrder={chapterOrder}
            contentUnitId={draft.contentUnitId}
          />
          <GuideBindingCard
            id={draft.id}
            bookSlug={params.bookSlug}
            chapterOrder={chapterOrder}
            experienceKey={draft.definition.experienceKey}
            currentPin={draft.definition.guidePin}
            rebindable={draft.rebindable}
            contentUnitId={draft.contentUnitId}
          />
        </>
      )}
    </div>
  );
}
