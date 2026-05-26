import Link from "next/link";

export function CtaSection() {
  return (
    <section
      className="py-20 sm:py-24"
      style={{
        background:
          "linear-gradient(135deg, var(--color-lavender-600) 0%, var(--color-lavender-900) 100%)",
      }}
    >
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2
          className="mb-4 text-balance text-3xl font-bold sm:text-4xl"
          style={{ color: "white" }}
        >
          Tu bienestar emocional puede empezar hoy
        </h2>
        <p
          className="mb-10 text-balance text-lg"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          Únete a personas que ya están aprendiendo a entenderse mejor con la
          ayuda de psicología basada en evidencia.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/register"
            className="w-full rounded-2xl px-8 py-3.5 text-base font-semibold transition-opacity hover:opacity-90 sm:w-auto"
            style={{ background: "white", color: "var(--color-lavender-700)" }}
          >
            Empieza gratis — sin tarjeta
          </Link>
          <Link
            href="/login"
            className="w-full rounded-2xl px-8 py-3.5 text-base font-semibold transition-opacity hover:opacity-80 sm:w-auto"
            style={{
              border: "1.5px solid rgba(255,255,255,0.4)",
              color: "white",
            }}
          >
            Ya tengo cuenta →
          </Link>
        </div>
      </div>
    </section>
  );
}
