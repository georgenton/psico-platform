import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="border-t py-12"
      style={{
        background: "var(--color-warm-50)",
        borderColor: "var(--color-warm-200)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          {/* Brand */}
          <div>
            <span
              className="text-lg font-bold"
              style={{ color: "var(--color-lavender-700)" }}
            >
              Psico Platform
            </span>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-warm-400)" }}
            >
              Psicoeducación para Ecuador y LATAM
            </p>
          </div>

          {/* Nav */}
          <nav className="flex gap-8">
            <a
              href="#libros"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--color-warm-500)" }}
            >
              Libros
            </a>
            <a
              href="#planes"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--color-warm-500)" }}
            >
              Planes
            </a>
            <Link
              href="/login"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--color-warm-500)" }}
            >
              Iniciar sesión
            </Link>
          </nav>

          {/* Copyright */}
          <p className="text-sm" style={{ color: "var(--color-warm-400)" }}>
            © {new Date().getFullYear()} Psico Platform
          </p>
        </div>
      </div>
    </footer>
  );
}
