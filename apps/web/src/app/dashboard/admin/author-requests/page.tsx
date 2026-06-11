import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type {
  AuthorRequestStatus,
  PulsoAuthorRequestListResponse,
} from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import { AuthorRequestsList } from "@/components/dashboard/admin/AuthorRequestsList";
import { AuthorStatusTabs } from "@/components/dashboard/admin/AuthorStatusTabs";

export const metadata: Metadata = { title: "Pulso · Editor de autor" };
export const dynamic = "force-dynamic";

const STATUSES: AuthorRequestStatus[] = ["PENDING", "ALL"];

function parseStatus(raw: string | undefined): AuthorRequestStatus {
  return raw && (STATUSES as string[]).includes(raw)
    ? (raw as AuthorRequestStatus)
    : "PENDING";
}

export default async function PulsoAuthorRequestsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  // ADMIN-only. The backend gates too.
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const status = parseStatus(searchParams.status);

  let data: PulsoAuthorRequestListResponse | null = null;
  let error: string | null = null;
  try {
    data = await serverFetch<PulsoAuthorRequestListResponse>(
      `/pulso/author-requests?status=${status}&limit=100`,
      { cache: "no-store" },
    );
  } catch (e) {
    if (isNextThrow(e)) throw e;
    error =
      e instanceof Error ? e.message : "No pudimos cargar los pedidos.";
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <h1
          className="text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Pulso · Editor de autor
        </h1>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          {error ?? "No pudimos cargar los pedidos. Reintenta."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p
          className="text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-500)" }}
        >
          Pulso · v2
        </p>
        <h1
          className="mt-1 text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Editor de autor · Revisiones
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Libros enviados a revisión por autores B2B. Aprobar publica al
          catálogo (Book + Chapter + ChapterBlock). Rechazar regresa al
          autor con feedback editorial.
        </p>
      </header>

      <AuthorStatusTabs active={status} />
      <AuthorRequestsList data={data} status={status} />
    </div>
  );
}
