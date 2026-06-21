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
import {
  IconBell,
  IconBook,
  IconChevronDown,
  IconEco,
  IconEvolution,
  IconExplore,
  IconHome,
  IconLogo,
  IconLogout,
  IconMap,
  IconPatterns,
  IconReflections,
  IconSearch,
} from "@/components/dashboard/shell/icons";
import { TourOverlay } from "./_TourOverlay";

// ── Nav config ─────────────────────────────────────────────────────────────
//
// Sprint B6 visual parity: structure + class names lifted verbatim from
// `docs/design/redesign-v2/dashboard/index.html`. SVG icons replace the B2
// emojis so the rail renders with the design's exact stroke weight, hover
// states and active highlight.

type IconKind =
  | "home"
  | "evolucion"
  | "mapa"
  | "patrones"
  | "reflexiones"
  | "exploraciones"
  | "biblioteca"
  | "eco";

type NavItem = {
  href: string;
  label: string;
  iconKind: IconKind | null;
  exact: boolean;
  tourTarget: string | null;
  badge?: number;
};

const NAV_ICONS: Record<IconKind, React.ComponentType<{ size?: number }>> = {
  home: IconHome,
  evolucion: IconEvolution,
  mapa: IconMap,
  patrones: IconPatterns,
  reflexiones: IconReflections,
  exploraciones: IconExplore,
  biblioteca: IconBook,
  eco: IconEco,
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    iconKind: "home",
    exact: true,
    tourTarget: "inicio",
  },
  {
    href: "/dashboard/evolucion",
    label: "Mi Evolución",
    iconKind: "evolucion",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/mapa",
    label: "Mapa Emocional",
    iconKind: "mapa",
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/patrones",
    label: "Patrones IA",
    iconKind: "patrones",
    exact: false,
    tourTarget: "patrones",
  },
  {
    href: "/dashboard/reflexiones",
    label: "Reflexiones",
    iconKind: "reflexiones",
    exact: false,
    tourTarget: "diario",
  },
  {
    href: "/dashboard/exploraciones",
    label: "Exploraciones",
    iconKind: "exploraciones",
    exact: false,
    tourTarget: null,
  },
];

const RESOURCE_NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard/biblioteca",
    label: "Biblioteca",
    iconKind: "biblioteca",
    exact: false,
    tourTarget: "biblioteca",
  },
  {
    href: "/dashboard/eco",
    label: "Eco",
    iconKind: "eco",
    exact: false,
    tourTarget: "eco",
  },
];

const ADMIN_NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard/admin/overview",
    label: "Pulso · Overview",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/reports",
    label: "Pulso · Reports",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/cohorts",
    label: "Pulso · Cohorts",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/author-requests",
    label: "Pulso · Autores",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/users",
    label: "Pulso · Usuarios",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
];

const USER_MENU_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard/perfil",
    label: "Perfil",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/plan",
    label: "Mi plan",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/notifications",
    label: "Notificaciones",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/security",
    label: "Seguridad",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/terapia",
    label: "Terapia",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
];

function matchesRoute(href: string, pathname: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

function getInitials(email: string): string {
  return email.charAt(0).toUpperCase();
}

// ── Sidebar nav row ────────────────────────────────────────────────────────

function NavLink({
  item,
  pathname,
  onNav,
}: {
  item: NavItem;
  pathname: string;
  onNav: () => void;
}) {
  const active = matchesRoute(item.href, pathname, item.exact);
  const Icon = item.iconKind ? NAV_ICONS[item.iconKind] : null;
  return (
    <Link
      href={item.href}
      onClick={onNav}
      data-tour-target={item.tourTarget ?? undefined}
      className={`nav-item${active ? " on" : ""}`}
    >
      {Icon ? <Icon size={19} /> : null}
      {item.label}
      {item.badge != null ? (
        <span className="nav-badge">{item.badge}</span>
      ) : null}
    </Link>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({
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
    <aside className="side">
      <Link
        href="/dashboard"
        onClick={onNav}
        className="side-mark"
        style={{ textDecoration: "none" }}
      >
        <span className="mk">
          <IconLogo size={19} />
        </span>
        Psico
      </Link>

      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          onNav={onNav}
        />
      ))}

      <div className="side-eyebrow">Recursos</div>
      {RESOURCE_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          onNav={onNav}
        />
      ))}

      {user?.role === "ADMIN" ? (
        <>
          <div className="side-eyebrow">Pulso · Admin</div>
          {ADMIN_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNav={onNav}
            />
          ))}
        </>
      ) : null}

      <div className="side-spacer" />

      {/* Comprensión emocional block — v1 ships sample numbers; Sprint D wires
          them to the real /api/emotional-map summary. */}
      <div className="side-comp">
        <div className="sc-h">
          <span>Comprensión emocional</span>
        </div>
        <div className="sc-val">
          <b>74%</b>
          <span>+12 este mes</span>
        </div>
        <div className="sc-bar">
          <i />
        </div>
        <div className="sc-foot">
          Tu mapa creció con 9 reflexiones esta semana.
        </div>
      </div>

      {/* User menu trigger + collapsible items + logout, kept from B2 because
          the design source defers the user menu to the topbar avatar. We
          keep the click target near the rail bottom for desktop ergonomics. */}
      <button
        type="button"
        onClick={onToggleUserMenu}
        aria-expanded={userMenuOpen}
        className="nav-item"
        style={{ marginTop: 14, justifyContent: "space-between" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--gradient-cover-lavender)",
              color: "white",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {user ? getInitials(user.email) : "?"}
          </span>
          <span
            style={{
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
              maxWidth: 130,
              fontSize: 12,
            }}
          >
            {user?.email ?? "Usuario"}
          </span>
        </span>
        <IconChevronDown size={14} />
      </button>
      {userMenuOpen ? (
        <div style={{ paddingLeft: 4 }}>
          {USER_MENU_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNav={onNav}
            />
          ))}
        </div>
      ) : null}
      <form action={logoutAction}>
        <button type="submit" className="nav-item" style={{ width: "100%" }}>
          <IconLogout size={19} />
          Cerrar sesión
        </button>
      </form>
    </aside>
  );
}

// ── Topbar ─────────────────────────────────────────────────────────────────

function Topbar({
  initialMood,
  initialAmbient,
}: {
  initialMood: DiaryMoodId | null;
  initialAmbient: AmbientId;
}) {
  return (
    <div className="topbar">
      <label className="tb-search">
        <IconSearch size={17} />
        <span>Busca un patrón, un libro, una reflexión…</span>
      </label>
      <div className="tb-spacer" />
      <MoodChip initialMood={initialMood} />
      <AmbiencePicker initialAmbient={initialAmbient} />
      <Link
        href="/dashboard/notifications"
        className="tb-icon"
        aria-label="Notificaciones"
      >
        <span className="dot" />
        <IconBell size={19} />
      </Link>
      <Link
        href="/dashboard/perfil"
        className="tb-ava"
        aria-label="Perfil"
        style={{ textDecoration: "none" }}
      >
        AV
      </Link>
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
  initialMood: DiaryMoodId | null;
  initialAmbient: AmbientId;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <DiaryKeyProvider
      cryptoSalt={cryptoSalt}
      initialWrapKey={initialDiaryWrapKey}
    >
      <AmbientThemeApplier ambient={initialAmbient} />
      <div className="app">
        <Sidebar
          user={user}
          pathname={pathname}
          onNav={() => setUserMenuOpen(false)}
          userMenuOpen={userMenuOpen}
          onToggleUserMenu={() => setUserMenuOpen((v) => !v)}
        />

        <div className="main">
          <Topbar initialMood={initialMood} initialAmbient={initialAmbient} />
          <section className="screen">{children}</section>
        </div>

        {showTour ? <TourOverlay /> : null}
      </div>
    </DiaryKeyProvider>
  );
}
