/**
 * Icons — Sprint B6 visual parity.
 *
 * Lucide-inspired outline set lifted from
 * `docs/design/redesign-v2/dashboard/index.html`. The design uses these as
 * inline SVG (`<svg class="ic">`) so they take their color from
 * `currentColor` and inherit the dashboard's CSS variables.
 *
 * Every icon shares the same base props (size, stroke width); only the
 * `<path>`/`<circle>` content differs. Inline SVG keeps the bundle lean —
 * no external icon font, no per-icon network request.
 */

type IconProps = {
  size?: number;
  className?: string;
};

function Base({
  size = 19,
  strokeWidth = 1.75,
  className,
  children,
}: IconProps & { children: React.ReactNode; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["ic", className].filter(Boolean).join(" ")}
    >
      {children}
    </svg>
  );
}

export function IconLogo(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" opacity="0.65" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconHome(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 11 L12 3.5 L21 11" />
      <path d="M5.5 9.5 V19.5 a1 1 0 0 0 1 1 H17.5 a1 1 0 0 0 1-1 V9.5" />
      <path d="M10 20.5 V14 H14 V20.5" />
    </Base>
  );
}

export function IconEvolution(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 18 C 6.5 18, 7 12, 10 12 C 13 12, 13.5 6, 16 6 L 20 6" />
      <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6" r="1.4" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconMap(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 3 L13.7 10.3 L21 12 L13.7 13.7 L12 21 L10.3 13.7 L3 12 L10.3 10.3 Z" />
    </Base>
  );
}

export function IconPatterns(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" opacity="0.65" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconReflections(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M7 4 H18 a1 1 0 0 1 1 1 V19 a1 1 0 0 1-1 1 H7 Z" />
      <path d="M11 9 H16" opacity="0.6" />
      <path d="M11 13 H16" opacity="0.6" />
      <circle cx="7" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7" cy="13" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconExplore(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21 L16.7 16.7" />
    </Base>
  );
}

export function IconBook(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3.5 5 C6 4.2 9 4.2 12 5.5 C15 4.2 18 4.2 20.5 5 V18.5 C18 17.7 15 17.7 12 19 C9 17.7 6 17.7 3.5 18.5 Z" />
      <path d="M12 5.5 V19" />
    </Base>
  );
}

export function IconEco(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 12 a7 7 0 1 0 4.5 -6.5" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21 L16.7 16.7" />
    </Base>
  );
}

export function IconBell(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5.5 16.5 C 7 14.5, 7 12, 7 10 a5 5 0 0 1 10 0 c0 2, 0 4.5, 1.5 6.5 Z" />
      <path d="M10 19.5 a2 2 0 0 0 4 0" />
    </Base>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Base {...p} strokeWidth={1.9}>
      <path d="M6 9l6 6 6-6" />
    </Base>
  );
}

export function IconMoodNeutral(p: IconProps) {
  return (
    <Base {...p} strokeWidth={1.7}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 14.5 H15" />
      <circle cx="9" cy="10" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.7" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconPencil(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 20 H21" />
      <path d="M16.5 3.5 a2.1 2.1 0 0 1 3 3 L7 19 l-4 1 1-4 Z" />
    </Base>
  );
}

export function IconWind(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12.8 19.6 A2 2 0 1 0 14 16 H2" />
      <path d="M17.5 8 A2.5 2.5 0 1 1 19.5 12 H2" />
      <path d="M9.8 4.4 A2 2 0 1 1 11 8 H2" />
    </Base>
  );
}

export function IconFlame(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M8.5 14.5 A2.5 2.5 0 0 0 11 12 c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5 a7 7 0 1 1-14 0 c0-1.2.4-2.3 1-3 a2.5 2.5 0 0 0 2.5 2.5 Z" />
    </Base>
  );
}

export function IconTrendUp(p: IconProps) {
  return (
    <Base {...p} strokeWidth={2.2}>
      <path d="M5 19 L12 8 L16 13 L21 6" />
    </Base>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Base {...p} strokeWidth={2}>
      <path d="M5 12.5 L10 17.5 L19 6.5" />
    </Base>
  );
}

export function IconArrowRight(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 12 H19" />
      <path d="M12 5 L19 12 L12 19" />
    </Base>
  );
}

export function IconLogout(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 17 L20 12 L15 7" />
      <path d="M20 12 H8" />
      <path d="M10 4 H5 V20 H10" />
    </Base>
  );
}
