"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { AmbientId, DiaryMoodId } from "@psico/types";

import { logoutAction } from "@/actions/auth";
import type { SessionUser } from "@/lib/api.server";
import { DiaryKeyProvider } from "@/lib/crypto/diary-key-context";
import { MoodChip } from "@/components/dashboard/shell/MoodChip";
import { AmbiencePicker } from "@/components/dashboard/shell/AmbiencePicker";
import { AmbientThemeApplier } from "@/components/dashboard/shell/AmbientThemeApplier";
import { TourOverlay } from "./_TourOverlay";

// ── Nav config ─────────────────────────────────────────────────────────────
//
// Sprint B2: the sidebar is rewritten to match the redesign v2 dashboard. Order
// + labels lifted from `docs/design/redesign-v2/dashboard/README.md` §7. The
// "Recursos" divider visually separates the transformation track (top half)
// from the supporting resources (bottom half).
//
// Routes that don't have a real page yet (Mi Evolución, Mapa Emocional,
// Exploraciones) point at "Próximamente" placeholders shipped in this PR
// so the nav is always navigable — no dead links.
//
// Profile / Mi Plan / Seguridad / Notificaciones move to deep-link-only —
// they're surfaced from inside the user menu (logout area) instead of the
// main rail.

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact: boolean;
  tourTarget: string | null;
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    icon: "🏠",
    exact: true,
    tourTarget: "inicio",
  },
  {
    href: "/dashboard/evolucion",
    label: "Mi Evolución",
    icon: "📈",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/mapa",
    label: "Mapa Emocional",
    icon: "🗺️",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/patrones",
    label: "Patrones IA",
    icon: "📊",
    exact: false,
    tourTarget: "patrones",
  },
  {
    href: "/dashboard/reflexiones",
    label: "Reflexiones",
    icon: "✎",
    exact: false,
    tourTarget: "diario",
  },
  {
    href: "/dashboard/exploraciones",
    label: "Exploraciones",
    icon: "🧭",
    exact: false,
    tourTarget: null,
  },
];

const RESOURCE_NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard/biblioteca",
    label: "Biblioteca",
    icon: "📚",
    exact: false,
    tourTarget: "biblioteca",
  },
  {
    href: "/dashboard/eco",
    label: "Eco",
    icon: "🌿",
    exact: false,
    tourTarget: "eco",
  },
];

// Sprint S42: admin-only nav appended when `user.role === "ADMIN"`.
const ADMIN_NAV_ITEMS: readonly NavItem[] = [
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
  {
    href: "/dashboard/admin/cohorts",
    label: "Pulso · Cohorts",
    icon: "📐",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/author-requests",
    label: "Pulso · Autores",
    icon: "📚",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/users",
    label: "Pulso · Usuarios",
    icon: "👤",
    exact: false,
    tourTarget: null,
  },
];

// Deep-link items kept out of the rail but reachable from the user menu in
// the footer. Plus the legacy /dashboard/reflexiones path which now redirects to
// /dashboard/reflexiones — listed here so the path matcher recognises it
// during transitions.
const USER_MENU_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard/perfil",
    label: "Perfil",
    icon: "👤",
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
  {
    href: "/dashboard/terapia",
    label: "Terapia",
    icon: "💬",
    exact: false,
    tourTarget: null,
  },
];

function matchesRoute(href: string, pathname: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

function getPageTitle(pathname: string): string {
  const all = [
    ...NAV_ITEMS,
    ...RESOURCE_NAV_ITEMS,
    ...ADMIN_NAV_ITEMS,
    ...USER_MENU_ITEMS,
  ];
  return (
    all.find((item) => matchesRoute(item.href, pathname, item.exact))?.label ??
    "Dashboard"
  );
}

function getInitials(email: string): string {
  return email.charAt(0).toUpperCase();
}

// ── NavRow ─────────────────────────────────────────────────────────────────

function NavRow({
  item,
  pathname,
  onNav,
}: {
  item: NavItem;
  pathname: string;
  onNav: () => void;
}) {
  const active = matchesRoute(item.href, pathname, item.exact);
  return (
    <Link
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
}

// ── Sidebar content ────────────────────────────────────────────────────────

function SidebarContent({
  user,
  pathname,
  onNav,
  userMenuOpen,
  onToggleUserMenu,
}: {
  user: SessionUser | null;
  pathname: string;
  onNav: () => void;
  userMenuOpen: boolean;
  onToggleUserMenu: () => void;
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
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_ITEMS.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            pathname={pathname}
            onNav={onNav}
          />
        ))}

        <p
          className="mt-4 mb-1 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-warm-400)" }}
        >
          Recursos
        </p>
        {RESOURCE_NAV_ITEMS.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            pathname={pathname}
            onNav={onNav}
          />
        ))}

        {user?.role === "ADMIN" ? (
          <>
            <p
              className="mt-4 mb-1 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-warm-400)" }}
            >
              Pulso · Admin
            </p>
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                pathname={pathname}
                onNav={onNav}
              />
            ))}
          </>
        ) : null}
      </nav>

      {/* User section */}
      <div
        className="border-t p-3"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <button
          type="button"
          onClick={onToggleUserMenu}
          aria-expanded={userMenuOpen}
          className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-opacity hover:opacity-80"
          style={{ background: "var(--color-warm-100)" }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: "var(--color-lavender-500)" }}
          >
            {user ? getInitials(user.email) : "?"}
          </div>
          <div className="min-w-0 flex-1 text-left">
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
          <span
            aria-hidden
            className="text-xs"
            style={{ color: "var(--color-warm-400)" }}
          >
            {userMenuOpen ? "▾" : "▸"}
          </span>
        </button>

        {userMenuOpen ? (
          <div className="mb-2">
            {USER_MENU_ITEMS.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                pathname={pathname}
                onNav={onNav}
              />
            ))}
          </div>
        ) : null}

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
  initialDiaryWrapKey,
  initialMood,
  initialAmbient,
  children,
}: {
  user: SessionUser | null;
  cryptoSalt: string | null;
  showTour: boolean;
  initialDiaryWrapKey: string | null;
  /**
   * Sprint B2: current mood from `/user/me` so the Topbar MoodChip renders
   * the right state on first paint. `null` when no mood was ever logged.
   */
  initialMood: DiaryMoodId | null;
  /**
   * Sprint B2: active ambient theme from `UserPreferences.ambient`. Drives
   * both the Topbar AmbiencePicker initial state AND the AmbientThemeApplier
   * that sets `body.amb-{ambient}` on every dashboard mount.
   */
  initialAmbient: AmbientId;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <DiaryKeyProvider
      cryptoSalt={cryptoSalt}
      initialWrapKey={initialDiaryWrapKey}
    >
      <AmbientThemeApplier ambient={initialAmbient} />
      <div className="flex h-screen overflow-hidden">
        {sidebarOpen && (
          <div
            aria-hidden
            className="fixed inset-0 z-20 bg-black/25 lg:hidden"
            onClick={closeSidebar}
          />
        )}

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
            userMenuOpen={userMenuOpen}
            onToggleUserMenu={() => setUserMenuOpen((v) => !v)}
          />
        </aside>

        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{ background: "var(--color-warm-100)" }}
        >
          <header
            className="flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6"
            style={{
              background: "white",
              borderBottom: "1px solid var(--color-warm-200)",
            }}
          >
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
              className="flex-1 truncate text-base font-semibold"
              style={{ color: "var(--color-warm-800)" }}
            >
              {getPageTitle(pathname)}
            </h1>

            <div className="hidden items-center gap-2 sm:flex">
              <MoodChip initialMood={initialMood} />
              <AmbiencePicker initialAmbient={initialAmbient} />
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
        </div>

        {showTour ? <TourOverlay /> : null}
      </div>
    </DiaryKeyProvider>
  );
}
