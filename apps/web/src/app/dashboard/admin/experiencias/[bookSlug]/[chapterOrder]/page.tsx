import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  AdminChapterExperiences,
  ChapterMediaManifestResponse,
} from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import { ExperienceRowActions } from "./ExperienceRowActions";
import { NewExperienceButton } from "./NewExperienceButton";

export const metadata: Metadata = { title: "Pulso · Capítulo" };
export const dynamic = "force-dynamic";

/**
 * CMS V1 (#637) — one chapter: its media, and its experiences.
 *
 * Media is read-only in V1. Upload, DAM and transcoding are not this vertical's
 * problem; showing an editor what a chapter already has, so they can write an
 * AUDIO or VIDEO scene that points at something real, is.
 */
export default async function AdminChapterExperiencesPage({
  params,
}: {
  params: { bookSlug: string; chapterOrder: string };
}) {
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  const chapterOrder = Number(params.chapterOrder);
  if (!Number.isInteger(chapterOrder) || chapterOrder < 1) {
    redirect(`/dashboard/admin/experiencias/${params.bookSlug}`);
  }

  let admin: AdminChapterExperiences | null = null;
  let media: ChapterMediaManifestResponse | null = null;
  try {
    [admin, media] = await Promise.all([
      serverFetch<AdminChapterExperiences>(
        `/pulso/experiences?bookSlug=${encodeURIComponent(params.bookSlug)}&chapterOrder=${chapterOrder}`,
      ),
      serverFetch<ChapterMediaManifestResponse>(
        `/lector/${encodeURIComponent(params.bookSlug)}/${chapterOrder}/media`,
      ).catch(() => null),
    ]);
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  const experiences = admin?.experiences ?? [];
  const published = experiences.filter((e) => e.status === "PUBLISHED");
  const drafts = experiences.filter((e) => e.status === "DRAFT");

  return (
    <div className="mx-auto max-w-[900px]">
      <header className="mb-6">
        <Link
          href={`/dashboard/admin/experiencias/${params.bookSlug}`}
          className="text-[12.5px]"
          style={{ color: "var(--color-lavender-600)" }}
        >
          ← Capítulos
        </Link>
        <h1
          className="mt-2 text-[22px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {params.bookSlug} · capítulo {chapterOrder}
        </h1>
      </header>

      <section className="mb-8" data-testid="admin-chapter-media">
        <h2
          className="mb-2.5 text-[13px] font-semibold"
          style={{ color: "var(--color-warm-800)" }}
        >
          Media
        </h2>
        {media && media.items.length > 0 ? (
          <ul
            className="overflow-hidden rounded-2xl"
            style={{
              background: "#fff",
              border: "1px solid var(--color-warm-200)",
            }}
          >
            {media.items.map((item, i) => (
              <li
                key={`${item.kind}-${item.mediaKey}`}
                className="flex items-center justify-between gap-4 px-5 py-3"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--color-warm-100)",
                }}
              >
                <span
                  className="text-[13.5px]"
                  style={{ color: "var(--color-warm-800)" }}
                >
                  {item.title ?? item.mediaKey}
                </span>
                <span
                  className="text-[12px] font-semibold uppercase tracking-[0.4px]"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {item.kind}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--color-warm-500)" }}>
            Este capítulo no declara media.
          </p>
        )}
      </section>

      <section data-testid="admin-chapter-experiences">
        <div className="mb-2.5 flex items-center justify-between gap-4">
          <h2
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-warm-800)" }}
          >
            Experiencias
          </h2>
          <NewExperienceButton
            bookSlug={params.bookSlug}
            chapterOrder={chapterOrder}
            guideAvailable={admin?.guidePin != null}
            lineageExists={experiences.length > 0}
            contentUnitId={admin?.contentUnitId ?? null}
          />
        </div>

        {experiences.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--color-warm-500)" }}>
            Este capítulo no tiene experiencias todavía.
          </p>
        ) : (
          <ul
            className="overflow-hidden rounded-2xl"
            style={{
              background: "#fff",
              border: "1px solid var(--color-warm-200)",
            }}
          >
            {[...published, ...drafts].map((row, i) => (
              <li
                key={`${row.experienceKey}@${row.experienceVersion}`}
                className="px-5 py-4"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--color-warm-100)",
                }}
                data-testid={`admin-experience-${row.experienceKey}-v${row.experienceVersion}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-[14.5px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {row.title}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.4px]"
                    style={
                      row.status === "PUBLISHED"
                        ? {
                            background: "var(--color-sage-100)",
                            color: "var(--color-sage-600)",
                          }
                        : {
                            background: "var(--color-lavender-50)",
                            color: "var(--color-lavender-600)",
                          }
                    }
                  >
                    {row.status === "PUBLISHED" ? "Publicada" : "Borrador"}
                  </span>
                  {row.source === "code" ? (
                    <span
                      className="text-[11.5px]"
                      style={{ color: "var(--color-warm-400)" }}
                      title="Definida en el código. Se puede clonar, no editar en su sitio."
                    >
                      en código
                    </span>
                  ) : null}
                </div>
                <p
                  className="mt-0.5 text-[12.5px]"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {row.experienceKey} · v{row.experienceVersion} ·{" "}
                  {row.sceneCount} {row.sceneCount === 1 ? "escena" : "escenas"}
                </p>
                <ExperienceRowActions
                  row={row}
                  bookSlug={params.bookSlug}
                  chapterOrder={chapterOrder}
                  contentUnitId={admin?.contentUnitId ?? null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
