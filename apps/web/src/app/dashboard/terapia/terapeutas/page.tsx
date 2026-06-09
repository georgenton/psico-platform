import type { Metadata } from "next";
import Link from "next/link";
import type { TherapistListResponse, TherapyFilters } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { TherapistCard } from "@/components/dashboard/terapia/TherapistCard";

export const metadata: Metadata = { title: "Terapeutas · Terapia" };
export const dynamic = "force-dynamic";

type SearchParams = {
  motivo?: string;
  modalidad?: string;
  language?: string;
  sort?: string;
  page?: string;
};

export default async function TerapeutasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");

  const qs = new URLSearchParams();
  if (params.motivo) qs.set("motivo", params.motivo);
  if (params.modalidad) qs.set("modalidad", params.modalidad);
  if (params.language) qs.set("language", params.language);
  if (params.sort) qs.set("sort", params.sort);
  qs.set("page", String(page));

  let list: TherapistListResponse | null = null;
  let filters: TherapyFilters | null = null;
  let loadError: string | null = null;
  try {
    [list, filters] = await Promise.all([
      serverFetch<TherapistListResponse>(`/terapia/therapists?${qs.toString()}`),
      serverFetch<TherapyFilters>("/terapia/therapists/filters"),
    ]);
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError = err instanceof Error ? err.message : "Error desconocido";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1
            className="text-[26px] font-bold tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Terapeutas
          </h1>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {list ? `${list.total} terapeutas verificados` : "Cargando…"}
          </p>
        </div>
        <Link
          href="/dashboard/terapia"
          className="text-[13px]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Volver al hub
        </Link>
      </header>

      {loadError ? (
        <div
          className="rounded-2xl border-[1.5px] bg-white p-5 text-[13px]"
          style={{
            borderColor: "var(--color-rose-200)",
            color: "var(--color-rose-700)",
          }}
        >
          {loadError}
        </div>
      ) : null}

      {/* Filter strip (zero-JS) */}
      {filters ? (
        <div
          className="flex flex-wrap gap-2 rounded-2xl border-[1.5px] bg-white p-3"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <FilterLink
            current={params.motivo}
            value={undefined}
            label="Todos"
            base={params}
            field="motivo"
          />
          {filters.motivo.slice(0, 6).map((m) => (
            <FilterLink
              key={m.id}
              current={params.motivo}
              value={m.id}
              label={`${m.label} (${m.count})`}
              base={params}
              field="motivo"
            />
          ))}
        </div>
      ) : null}

      {/* Sort */}
      <div className="flex items-center gap-3 text-[12px]">
        <span style={{ color: "var(--color-warm-500)" }}>Ordenar:</span>
        <SortLink current={params.sort} value="rating" label="Mejor rating" base={params} />
        <SortLink current={params.sort} value="price-asc" label="Precio ↑" base={params} />
        <SortLink current={params.sort} value="price-desc" label="Precio ↓" base={params} />
        <SortLink current={params.sort} value="popular" label="Más populares" base={params} />
      </div>

      {/* Grid */}
      {list && list.items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.items.map((t) => (
            <TherapistCard
              key={t.id}
              therapist={t}
              href={`/dashboard/terapia/terapeutas/${t.id}`}
            />
          ))}
        </div>
      ) : !loadError ? (
        <div
          className="rounded-2xl border-[1.5px] bg-white p-8 text-center text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          No encontramos terapeutas con esos criterios.
        </div>
      ) : null}

      {/* Pagination */}
      {list && list.totalPages > 1 ? (
        <div
          className="flex items-center justify-between rounded-2xl border-[1.5px] bg-white px-4 py-3 text-[12px]"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <PageLink
            disabled={page <= 1}
            page={page - 1}
            base={params}
            label="← Anterior"
          />
          <span style={{ color: "var(--color-warm-700)" }}>
            Página {page} de {list.totalPages}
          </span>
          <PageLink
            disabled={page >= list.totalPages}
            page={page + 1}
            base={params}
            label="Siguiente →"
          />
        </div>
      ) : null}
    </div>
  );
}

function FilterLink({
  current,
  value,
  label,
  base,
  field,
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
  base: SearchParams;
  field: keyof SearchParams;
}) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v && k !== field && k !== "page") next.set(k, v);
  }
  if (value) next.set(field, value);
  const active = current === value || (!current && !value);
  return (
    <Link
      href={`?${next.toString()}`}
      className="rounded-full px-3 py-1 text-[12px] font-medium"
      style={{
        background: active ? "var(--color-lavender-100)" : "var(--color-warm-50)",
        color: active ? "var(--color-lavender-700)" : "var(--color-warm-700)",
      }}
    >
      {label}
    </Link>
  );
}

function SortLink({
  current,
  value,
  label,
  base,
}: {
  current: string | undefined;
  value: string;
  label: string;
  base: SearchParams;
}) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v && k !== "sort" && k !== "page") next.set(k, v);
  }
  next.set("sort", value);
  const active = current === value;
  return (
    <Link
      href={`?${next.toString()}`}
      className="rounded-full px-2.5 py-1 font-medium"
      style={{
        background: active ? "var(--color-lavender-100)" : "transparent",
        color: active ? "var(--color-lavender-700)" : "var(--color-warm-500)",
      }}
    >
      {label}
    </Link>
  );
}

function PageLink({
  disabled,
  page,
  base,
  label,
}: {
  disabled: boolean;
  page: number;
  base: SearchParams;
  label: string;
}) {
  if (disabled) {
    return (
      <span
        className="opacity-30"
        style={{ color: "var(--color-warm-500)" }}
      >
        {label}
      </span>
    );
  }
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v && k !== "page") next.set(k, v);
  }
  next.set("page", String(page));
  return (
    <Link
      href={`?${next.toString()}`}
      style={{ color: "var(--color-lavender-700)" }}
    >
      {label}
    </Link>
  );
}
