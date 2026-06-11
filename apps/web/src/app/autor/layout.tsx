import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/api.server";

/**
 * /autor layout — workspace de autor (B2B).
 *
 * Diseño handoff (16-author.md): "Producto distinto. Auth, dashboard,
 * lifecycle propios." Por eso vive fuera de /dashboard.
 *
 * Gate: AUTHOR-only. Frontend redirect + backend RolesGuard del API.
 */
export default function AuthorLayout({ children }: { children: ReactNode }) {
  const user = getSessionUser();
  if (!user) redirect("/login?next=/autor/dashboard");
  if (user.role !== "AUTHOR") redirect("/dashboard");

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-warm-50)" }}
    >
      <header
        className="sticky top-0 z-10 border-b-[1.5px] bg-white"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Link
            href="/autor/dashboard"
            className="text-[14.5px] font-bold tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            📚 Editor de autor
          </Link>
          <nav
            className="flex items-center gap-3 text-[12.5px]"
            style={{ color: "var(--color-warm-600)" }}
          >
            <Link
              href="/autor/dashboard"
              className="hover:underline"
            >
              Mis libros
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full px-3 py-1.5 font-medium"
              style={{
                background: "var(--color-warm-100)",
                color: "var(--color-warm-700)",
              }}
            >
              Ir al consumer
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
