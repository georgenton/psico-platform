"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminExperienceRow } from "@psico/types";

import { createNextDraftAction } from "../../actions";

/**
 * CMS V1 (#637) — what an editor may do with one row.
 *
 * A published version has exactly one write action, and it is not "edit":
 * published definitions are immutable, so changing one means creating the next
 * version. Saying that with the button label is cheaper than explaining a 409
 * afterwards.
 */
export function ExperienceRowActions({
  row,
  bookSlug,
  chapterOrder,
}: {
  row: AdminExperienceRow;
  bookSlug: string;
  chapterOrder: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editHref =
    row.id === null
      ? null
      : `/dashboard/admin/experiencias/${bookSlug}/${chapterOrder}/borrador/${row.id}`;

  async function createNextVersion() {
    setBusy(true);
    setError(null);
    try {
      const created = await createNextDraftAction(
        bookSlug,
        chapterOrder,
        row.experienceKey,
        row.experienceVersion,
      );
      router.push(
        `/dashboard/admin/experiencias/${bookSlug}/${chapterOrder}/borrador/${created.id}`,
      );
    } catch {
      setError("No pudimos crear la versión nueva.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-3">
      {row.status === "DRAFT" && editHref ? (
        <a
          href={editHref}
          className="text-[13px] font-semibold"
          style={{ color: "var(--color-lavender-600)" }}
          data-testid={`edit-${row.experienceKey}`}
        >
          Editar
        </a>
      ) : null}

      {row.status === "PUBLISHED" ? (
        <button
          type="button"
          onClick={() => void createNextVersion()}
          disabled={busy}
          className="text-[13px] font-semibold disabled:opacity-60"
          style={{ color: "var(--color-lavender-600)", minHeight: 44 }}
          data-testid={`next-version-${row.experienceKey}`}
        >
          {busy ? "Creando…" : "Crear versión nueva"}
        </button>
      ) : null}

      {error ? (
        <span className="text-[12.5px]" style={{ color: "#B91C1C" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
