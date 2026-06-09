"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/actions/auth";
import type { SessionUser } from "@/lib/api.server";
import { DiaryKeyProvider } from "@/lib/crypto/diary-key-context";
import { TourOverlay } from "./_TourOverlay";

// ── Nav config ─────────────────────────────────────────────────────────────

// Sprint S5-front: nav lines up with the design system's sidebar order from
// docs/design/inicio/web.jsx and docs/design/biblioteca/web.jsx. Diary appears
// because the backend (Sprint S6) ships the endpoints; the page below renders
// a placeholder until the crypto module is wired client-side.
const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Inicio",
    icon: "🏠",
    exact: true,
    tourTarget: "inicio",
  },
  {
    href: "/dashboard/biblioteca",
    label: "Mi biblioteca",
    icon: "📚",
    exact: false,
    tourTarget: "biblioteca",
  },
  {
    href: "/dashboard/diario",
    label: "Diario",
    icon: "✎",
    exact: false,
    tourTarget: "diario",
  },
  {
    href: "/dashboard/eco",
    label: "Eco",
    icon: "🌿",
    exact: false,
    tourTarget: "eco",
  },
  {
    href: "/dashboard/patrones",
    label: "Patrones",
    icon: "📊",
    exact: false,
    tourTarget: "patrones",
  },
  {
    href: "/dashboard/terapia",
    label: "Terapia",
    icon: "💬",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/plan",
    label: "Mi plan",
    icon: "💳",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/perfil",
    label: "Perfil",
    icon: "👤",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/notifications",
    label: "Notificaciones",
    icon: "🔔",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/security",
    label: "Seguridad",
    icon: "🔐",
    exact: false,
    tourTarget: null,
  },
] as const;

// Sprint S42: admin-only nav item appended at render time when
// `user.role === "ADMIN"`. Lives in its own array so it never leaks into
// the regular tour catalog or analytics.
const ADMIN_NAV_ITEMS = [
  // Sprint S48 — overview goes first so it's the natural landing for admins.
  {
    href: "/dashboard/admin/overview",
    label: "Pulso · Overview",
    icon: "📊",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/reports",
    label: "Pulso · Reports",
    icon: "📋",
    exact: false,
    tourTarget: null,
  },
  // Sprint S51 — cohort retention heatmap. Sits last among admin items
  // because it's the most "analytics-deep" view.
  {
    href: "/dashboard/admin/cohorts",
    label: "Pulso · Cohorts",
    icon: "📐",
    exact: false,
    tourTarget: null,
  },
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
              data-tour-target={item.tourTarget ?? undefined}
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

        {/* Sprint S42: admin section — visible only to ADMIN users. */}
        {user?.role === "ADMIN" ? (
          <>
            <p
              className="mt-4 mb-1 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-warm-400)" }}
            >
              Pulso · Admin
            </p>
            {ADMIN_NAV_ITEMS.map((item) => {
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
          </>
        ) : null}
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
  cryptoSalt,
  showTour,
  children,
}: {
  user: SessionUser | null;
  /**
   * User's base64url Argon2id salt (or null for legacy accounts). Sourced
   * from /user/me at the layout level so the DiaryKeyProvider is hoisted
   * above every /dashboard/* page — that's what lets the diary unlock
   * survive navigation, which the security page needs.
   */
  cryptoSalt: string | null;
  /**
   * Sprint S37: when true, mounts the post-onboarding TourOverlay on top
   * of the dashboard. Computed at the layout level from `onboardingState`
   * so the check happens once per nav, not per render.
   */
  showTour: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <DiaryKeyProvider cryptoSalt={cryptoSalt}>
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
          <SidebarContent
            user={user}
            pathname={pathname}
            onNav={closeSidebar}
          />
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

        {/* Sprint S37: post-onboarding tour overlay. Mounts after the rest
            of the dashboard so target nav items exist in the DOM when the
            overlay queries for them. */}
        {showTour ? <TourOverlay /> : null}
      </div>
    </DiaryKeyProvider>
  );
}
