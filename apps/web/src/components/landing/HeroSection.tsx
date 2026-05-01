import Link from "next/link";

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden py-20 sm:py-28"
      style={{
        background:
          "linear-gradient(145deg, var(--color-lavender-50) 0%, var(--color-warm-50) 65%)",
      }}
    >
      {/* Decorative blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-40 h-96 w-96 rounded-full opacity-30"
        style={{
          background:
            "radial-gradient(circle, var(--color-lavender-300), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(circle, var(--color-sage-200), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <span
            className="mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"
            style={{
              background: "var(--color-lavender-100)",
              color: "var(--color-lavender-700)",
            }}
          >
            ✨ Psicología accesible para Ecuador y LATAM
          </span>

          <h1
            className="mb-6 text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
            style={{ color: "var(--color-warm-900)" }}
          >
            Aprende a entenderte.{" "}
            <span style={{ color: "var(--color-lavender-600)" }}>
              Transforma tu vida.
            </span>
          </h1>

          <p
            className="mb-10 text-balance text-lg leading-relaxed sm:text-xl"
            style={{ color: "var(--color-warm-500)" }}
          >
            Psicoeducación basada en evidencia para comprender tus emociones,
            mejorar tus relaciones y construir una vida más plena — a tu ritmo,
            en tu idioma.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="btn-sage w-full sm:w-auto"
              style={{ padding: "0.875rem 2rem", fontSize: "1rem" }}
            >
              Empieza gratis →
            </Link>
            <a
              href="#como-funciona"
              className="btn-outline-lavender w-full sm:w-auto"
              style={{ padding: "0.875rem 2rem", fontSize: "1rem" }}
            >
              Cómo funciona
            </a>
          </div>

          <p
            className="mt-6 text-sm"
            style={{ color: "var(--color-warm-400)" }}
          >
            Sin tarjeta de crédito · Cancela cuando quieras
          </p>
        </div>
      </div>
    </section>
  );
}
