import Link from "next/link";

export function Navbar() {
  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "rgba(250, 250, 248, 0.88)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--color-warm-200)",
      }}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="shrink-0 text-xl font-bold"
          style={{ color: "var(--color-lavender-700)" }}
        >
          Psico Platform
        </Link>

        {/* Nav links — hidden on mobile */}
        <div className="hidden flex-1 items-center gap-8 md:flex">
          <a
            href="#libros"
            className="text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--color-warm-600)" }}
          >
            Libros
          </a>
          <a
            href="#planes"
            className="text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--color-warm-600)" }}
          >
            Planes
          </a>
        </div>

        {/* CTAs */}
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium transition-opacity hover:opacity-70 sm:block"
            style={{ color: "var(--color-lavender-600)" }}
          >
            Iniciar sesión
          </Link>
          <Link href="/register" className="btn-sage">
            Empieza gratis
          </Link>
        </div>
      </nav>
    </header>
  );
}
