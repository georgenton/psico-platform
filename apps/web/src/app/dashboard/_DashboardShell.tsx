"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/actions/auth";
import type { SessionUser } from "@/lib/api.server";

// ── Nav config ─────────────────────────────────────────────────────────────

// Sprint S5-front: nav lines up with the design system's sidebar order from
// docs/design/inicio/web.jsx and docs/design/biblioteca/web.jsx. Diary appears
// because the backend (Sprint S6) ships the endpoints; the page below renders
// a placeholder until the crypto module is wired client-side.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: "🏠", exact: true },
  {
    href: "/dashboard/biblioteca",
    label: "Mi biblioteca",
    icon: "📚",
    exact: false,
  },
  { href: "/dashboard/diario", label: "Diario", icon: "✎", exact: false },
  { href: "/dashboard/plan", label: "Mi plan", icon: "💳", exact: false },
] as const;

function matchesRoute(href: string, pathname: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

function getPageTitle(pathname: string): string {
  return (
    NAV_ITEMS.find((item) => matchesRoute(item.href, pathname, item.exact))
      ?.label ?? "Dashboard"
  );
}

function getInitials(email: string): string {
  return email.charAt(0).toUpperCase();
}

// ── Sidebar content ────────────────────────────────────────────────────────

function SidebarContent({
  user,
  pathname,
  onNav,
}: {
  user: SessionUser | null;
  pathname: string;
  onNav: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-6 py-5">
        <Link
          href="/dashboard"
          onClick={onNav}
          className="text-lg font-bold"
          style={{ color: "var(--color-lavender-700)" }}
        >
          Psico Platform
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 pb-4">
        {NAV_ITEMS.map((item) => {
          const active = matchesRoute(item.href, pathname, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNav}
              className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
              style={
                active
                  ? {
                      background: "var(--color-lavender-100)",
                      color: "var(--color-lavender-700)",
                    }
                  : { color: "var(--color-warm-600)" }
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div
        className="border-t p-3"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        {/* Avatar + info */}
        <div
          className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5"
          style={{ background: "var(--color-warm-100)" }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: "var(--color-lavender-500)" }}
          >
            {user ? getInitials(user.email) : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-xs font-medium"
              style={{ color: "var(--color-warm-800)" }}
            >
              {user?.email ?? "Usuario"}
            </p>
            <p className="text-xs" style={{ color: "var(--color-warm-400)" }}>
              Plan {user?.plan ?? "FREE"}
            </p>
          </div>
        </div>

        {/* Logout */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--color-warm-500)" }}
          >
            <span className="text-base">🚪</span>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────

export function DashboardShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-20 bg-black/25 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-60 shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "white",
          borderRight: "1px solid var(--color-warm-200)",
        }}
      >
        <SidebarContent user={user} pathname={pathname} onNav={closeSidebar} />
      </aside>

      {/* Main column */}
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        style={{ background: "var(--color-warm-100)" }}
      >
        {/* Top bar */}
        <header
          className="flex h-16 shrink-0 items-center gap-4 px-4 sm:px-6"
          style={{
            background: "white",
            borderBottom: "1px solid var(--color-warm-200)",
          }}
        >
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded-lg p-2 transition-opacity hover:opacity-70 lg:hidden"
            style={{ color: "var(--color-warm-600)" }}
            aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <h1
            className="text-base font-semibold"
            style={{ color: "var(--color-warm-800)" }}
          >
            {getPageTitle(pathname)}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
