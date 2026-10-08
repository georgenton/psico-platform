"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AmbientId, DiaryMoodId } from "@psico/types";

import { logoutAction } from "@/actions/auth";
import type { SessionUser } from "@/lib/api.server";
import { DiaryKeyProvider } from "@/lib/crypto/diary-key-context";
import { MoodChip } from "@/components/dashboard/shell/MoodChip";
import { MoodCheckinProvider } from "@/components/dashboard/shell/mood-checkin-context";
import { AmbiencePicker } from "@/components/dashboard/shell/AmbiencePicker";
import { ThemePicker } from "@/components/dashboard/shell/ThemePicker";
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
import { NavToggleIcon } from "@/components/dashboard/shell/NavToggleIcon";
import { TourOverlay } from "./_TourOverlay";
import { FeelVerseLockup } from "@/components/brand/FeelVerse";

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
    href: "/dashboard/admin/circulos",
    label: "Pulso · Círculos",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/contenido",
    label: "Pulso · Contenido",
    iconKind: null,
    exact: false,
    tourTarget: null,
  },
  {
    href: "/dashboard/admin/experiencias",
    label: "Pulso · Experiencias",
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
  panelRef,
  inert,
}: {
  user: SessionUser | null;
  pathname: string;
  onNav: () => void;
  userMenuOpen: boolean;
  onToggleUserMenu: () => void;
  panelRef: React.RefObject<HTMLElement>;
  /** True when the drawer is parked off-canvas: nothing inside is reachable. */
  inert: boolean;
}) {
  return (
    <aside
      className="side"
      id="dashboard-nav"
      ref={panelRef}
      aria-label="Navegación principal"
      aria-hidden={inert || undefined}
    >
      <Link
        href="/dashboard"
        onClick={onNav}
        className="side-mark"
        style={{ textDecoration: "none" }}
      >
        <FeelVerseLockup size={17} />
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

      {/* Rail promo → Mapa Emocional. Replaces the old fabricated
          "Comprensión emocional 74%" sample card: under V2 (ADR 0014) the map
          has no global percentage and nothing is invented, so the rail points
          to the map with its honest framing instead of a made-up number. */}
      <Link
        href="/dashboard/mapa"
        onClick={() => onNav?.()}
        className="side-comp"
        style={{ display: "block", textDecoration: "none" }}
      >
        <div className="sc-h">
          <span>Tu Mapa Emocional</span>
        </div>
        <div className="sc-foot" style={{ marginTop: 0 }}>
          Lo que tú registras y confirmas — cada eje con su procedencia, sin
          porcentaje global.
        </div>
        <div className="sc-foot" style={{ fontWeight: 700 }}>
          Ver mi mapa →
        </div>
      </Link>

      {/* User menu trigger + collapsible items + logout, kept from B2 because
          the design source defers the user menu to the topbar avatar. We
          keep the click target near the rail bottom for desktop ergonomics. */}
      <button
        type="button"
        onClick={onToggleUserMenu}
        aria-expanded={userMenuOpen}
        className="nav-item"
        // The only place in the shell that renders the account's address.
        // Marked so documentation captures can redact exactly this box instead
        // of cropping the sidebar away and hiding the layout with it.
        data-account-block
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
              // La altura de línea va explícita porque `.nav-item` declara
              // `font: 500 14px/1`, y un `line-height` numérico se hereda y se
              // recalcula: a 12px daba una caja de 12 exactos. El área del tipo
              // necesita 14, así que el `overflow: hidden` que trunca de ancho
              // recortaba también por abajo. Con Geist cargada la tinta llegaba
              // a 11,94 y no se veía; con cualquier cara de reserva de la misma
              // pila —mientras el webfont carga o si falla— se cortaban 0,33 a
              // 0,67px de las descendentes de q, y, p.
              //
              // 1.35 da 16,2px de caja: sobra para el área del tipo en todas
              // ellas. La fila no cambia de alto porque la marca el avatar de
              // 28px, y la elipsis se conserva intacta (#746).
              lineHeight: 1.35,
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
  navOpen,
  onToggleNav,
  toggleRef,
  barRef,
}: {
  initialMood: DiaryMoodId | null;
  initialAmbient: AmbientId;
  navOpen: boolean;
  onToggleNav: () => void;
  toggleRef: React.RefObject<HTMLButtonElement>;
  // The shell measures this element to publish `--app-topbar-h`.
  barRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="topbar" ref={barRef}>
      {/* Below the desktop breakpoint the rail is a drawer, so it needs a
          trigger. CSS hides this button on desktop, where the rail is
          permanent — there is only ONE navigation, in two presentations. */}
      <button
        type="button"
        ref={toggleRef}
        className="nav-toggle"
        onClick={onToggleNav}
        aria-expanded={navOpen}
        aria-controls="dashboard-nav"
        aria-label={navOpen ? "Cerrar navegación" : "Abrir navegación"}
      >
        <NavToggleIcon open={navOpen} />
      </button>
      <label className="tb-search" data-gr2="search">
        <IconSearch size={17} />
        <span>Busca un patrón, un libro, una reflexión…</span>
      </label>
      <div className="tb-spacer" />
      <MoodChip initialMood={initialMood} />
      <AmbiencePicker initialAmbient={initialAmbient} />
      <ThemePicker />
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

  // ── Compact navigation (GR-2 responsive gate) ────────────────────────────
  //
  // ONE navigation, two presentations: a permanent rail on desktop and an
  // off-canvas drawer below the breakpoint. The breakpoint lives in CSS
  // (`dashboard-design.css`, max-width 1023px) and is mirrored here only so
  // the drawer can be made unreachable while it is parked — a drawer you can
  // tab into but cannot see is worse than no drawer.
  const [compact, setCompact] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);

  // ── How tall is the global bar, right now? ────────────────────────────────
  //
  // A route that sticks something of its own to the top — the reader's header
  // is the one that matters — has to come to rest BENEATH this bar rather than
  // BEHIND it. Both pin to `top: 0`, so without an offset they claim the same
  // band and whichever loses on z-index simply vanishes.
  //
  // The height cannot be written down: measured on this page it is 65 px on a
  // phone, 69 px on a tablet, 85 px on a desktop, and 113 px at 320 px, where
  // the bar wraps to three rows. A constant would be a desktop-only fix. So it
  // is published as a custom property and kept current.
  //
  // Same shape as `GoogleSignInButton`: measure unconditionally, and only
  // subscribe where `ResizeObserver` exists — jsdom does not have it, and a
  // first measurement is still better than none.
  useEffect(() => {
    const bar = topbarRef.current;
    if (!bar) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--app-topbar-h",
        `${Math.round(bar.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(publish);
    ro.observe(bar);
    return () => {
      ro.disconnect();
      // Leaving a stale height behind would offset a page that no longer has
      // a bar above it.
      document.documentElement.style.removeProperty("--app-topbar-h");
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const closeNav = useCallback(() => setNavOpen(false), []);

  // Navigating is the end of the drawer's job.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Growing past the breakpoint hands navigation back to the permanent rail.
  useEffect(() => {
    if (!compact) setNavOpen(false);
  }, [compact]);

  // Escape closes it, and focus goes back to the button that opened it —
  // otherwise the keyboard lands nowhere.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  // `inert` (not just aria-hidden) so a parked drawer is out of the tab order.
  // React 18 has no `inert` prop, so it is set on the node.
  //
  // Un-parking and moving focus have to happen in this order inside ONE effect:
  // an inert subtree refuses focus, so focusing first and clearing inert after
  // would silently drop the focus on the floor.
  const parked = compact && !navOpen;
  useEffect(() => {
    const node = panelRef.current as (HTMLElement & { inert?: boolean }) | null;
    if (node) node.inert = parked;
    if (!navOpen) return;
    node
      ?.querySelector<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])')
      ?.focus();
  }, [parked, navOpen]);

  return (
    <MoodCheckinProvider>
      <DiaryKeyProvider
        cryptoSalt={cryptoSalt}
        initialWrapKey={initialDiaryWrapKey}
      >
        <AmbientThemeApplier ambient={initialAmbient} />
        <div className="app" data-nav-open={navOpen ? "true" : "false"}>
          <Sidebar
            user={user}
            pathname={pathname}
            onNav={() => {
              setUserMenuOpen(false);
              setNavOpen(false);
            }}
            userMenuOpen={userMenuOpen}
            onToggleUserMenu={() => setUserMenuOpen((v) => !v)}
            panelRef={panelRef}
            inert={parked}
          />

          {/* Tapping outside is the fastest way out, and it is a real button so
            the keyboard and a screen reader can use it too. */}
          <button
            type="button"
            className="nav-scrim"
            onClick={closeNav}
            tabIndex={navOpen ? 0 : -1}
            aria-hidden={navOpen ? undefined : "true"}
            aria-label="Cerrar navegación"
          />

          <div className="main">
            <Topbar
              initialMood={initialMood}
              initialAmbient={initialAmbient}
              navOpen={navOpen}
              onToggleNav={() => setNavOpen((v) => !v)}
              toggleRef={toggleRef}
              barRef={topbarRef}
            />
            {/* ══ ESTRUCTURA SEMÁNTICA DEL PANEL · #732 ══════════════════════
                Tres dueños, y sólo tres:

                  · EL ARMAZÓN es dueño de `<main>`. Este de aquí. Una ruta del
                    panel NO declara el suyo: dos `<main>` anidados dejan la
                    navegación por landmarks sin un destino claro, que es
                    justamente lo que un lector de pantalla usa para saltarse el
                    rail y la barra.
                  · LA RUTA es dueña del `<h1>`. El patrón nativo es
                    `.screen-head` + `<h1 className="screen-title">`.
                  · UN COMPONENTE REUTILIZABLE no fija su nivel de heading: lo
                    RECIBE, porque su nivel depende de dónde se inserte. El
                    precedente es `UnlockGate`, que ya toma `nivel`.

                Va en `<main>` y no en `.main` a propósito: la barra superior
                vive dentro de `.main` y no es el contenido de la ruta.

                Hay trinquetes que lo cobran en
                `components/a11y-semantic-structure.test.ts`. ═══════════════ */}
            <main className="screen" id="dashboard-main">
              {children}
            </main>
          </div>

          {showTour ? <TourOverlay /> : null}
        </div>
      </DiaryKeyProvider>
    </MoodCheckinProvider>
  );
}
