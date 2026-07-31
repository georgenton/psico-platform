/**
 * The drawer trigger's glyph — hamburger when closed, cross when open.
 *
 * Two paths in one component so the button's meaning is visible at a glance
 * and the state is not communicated by colour alone.
 */
export function NavToggleIcon({
  open,
  size = 19,
}: {
  open: boolean;
  size?: number;
}) {
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}
