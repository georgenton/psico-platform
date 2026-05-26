const STEPS = [
  {
    icon: "📚",
    step: "01",
    title: "Elige tu guía",
    description:
      "Explora libros escritos por psicólogos y elige el que conecta con lo que estás viviendo ahora.",
  },
  {
    icon: "🎧",
    step: "02",
    title: "Aprende a tu ritmo",
    description:
      "Lee, escucha audios y completa ejercicios prácticos cuando y donde puedas.",
  },
  {
    icon: "🌱",
    step: "03",
    title: "Transforma tu bienestar",
    description:
      "Aplica lo aprendido y observa cómo cambia tu relación contigo mismo y con los demás.",
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="como-funciona"
      className="py-20 sm:py-24"
      style={{ background: "var(--color-warm-50)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-14 text-center">
          <h2
            className="mb-4 text-3xl font-bold sm:text-4xl"
            style={{ color: "var(--color-warm-800)" }}
          >
            Simple desde el primer día
          </h2>
          <p className="text-lg" style={{ color: "var(--color-warm-500)" }}>
            Sin jerga técnica, sin listas de espera, sin complicaciones.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="flex flex-col items-center rounded-3xl p-8 text-center"
              style={{
                background: "white",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div
                className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
                style={{ background: "var(--color-lavender-100)" }}
              >
                {s.icon}
              </div>
              <span
                className="mb-2 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--color-lavender-400)" }}
              >
                Paso {s.step}
              </span>
              <h3
                className="mb-3 text-lg font-semibold"
                style={{ color: "var(--color-warm-800)" }}
              >
                {s.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--color-warm-500)" }}
              >
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
