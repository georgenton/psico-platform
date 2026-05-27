"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Pagination — bottom of the books grid.
 *
 * Mutates the `page` querystring; the server component re-renders the grid
 * with the new page. The buttons are simple — no fancy ellipsis — because
 * for a v1 catalog the page count stays low (<10 typical).
 */
export function Pagination({
  page,
  perPage,
  total,
}: {
  page: number;
  perPage: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;

  function goTo(p: number) {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <nav
      aria-label="Paginación"
      className="mt-8 flex items-center justify-center gap-2"
    >
      <button
        type="button"
        onClick={() => goTo(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-700)",
        }}
      >
        ← Anterior
      </button>
      <span
        className="text-[12px]"
        style={{ color: "var(--color-warm-500)" }}
        aria-current="page"
      >
        Página{" "}
        <strong style={{ color: "var(--color-warm-800)" }}>{page}</strong> de{" "}
        {totalPages}
      </span>
      <button
        type="button"
        onClick={() => goTo(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-700)",
        }}
      >
        Siguiente →
      </button>
    </nav>
  );
}
