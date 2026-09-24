import type { UserMeResponse } from "@psico/types";

const PLAN_LABEL: Record<string, string> = {
  FREE: "Gratuito",
  PRO: "Pro",
  ANNUAL: "Pro Anual",
  B2B: "Empresarial",
};

const PLAN_BG: Record<string, string> = {
  FREE: "var(--color-warm-100)",
  PRO: "var(--color-lavender-100)",
  ANNUAL: "var(--color-lavender-200)",
  B2B: "var(--color-sage-100)",
};

const PLAN_FG: Record<string, string> = {
  FREE: "var(--color-warm-700)",
  PRO: "var(--color-lavender-700)",
  ANNUAL: "var(--color-lavender-800)",
  B2B: "var(--color-sage-700)",
};

export function ProfileHeader({ me }: { me: UserMeResponse }) {
  const { user } = me;
  const tier = user.tier === "pro" ? "PRO" : "FREE";
  return (
    <section
      className="flex items-center gap-4 rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div
        // Negrita, no semi: a 20 px el monograma pasa a contar como texto
        // grande, cuyo umbral es 3:1, y el blanco sobre el acento lo cumple en
        // los cuatro ambientes (3.24:1 el peor, Energía). Con semibold medía
        // 3.63:1 contra un umbral de 4.5:1.
        className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white"
        style={{ background: "var(--color-lavender-500)" }}
        aria-hidden
      >
        {user.initials}
      </div>
      <div className="flex-1">
        {/* El nombre de la persona encabeza ESTA tarjeta, no la pantalla: el
            título de «Perfil» es el de arriba, a 28 px. Mientras este era un
            <h1> había dos títulos de página compitiendo y el que ganaba —por
            orden— era el nombre, así que la pantalla se anunciaba con el nombre
            de quien la mira en vez de con lo que es. A 20 px, al lado de las
            demás tarjetas de la pantalla, su sitio es h2. */}
        <h2
          className="text-[20px] font-bold leading-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {user.firstName}
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-warm-500)" }}>
          {user.email}
        </p>
        <p
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Miembro desde{" "}
          {new Intl.DateTimeFormat("es-419", {
            month: "long",
            year: "numeric",
          }).format(new Date(user.joinedAt))}
        </p>
      </div>
      <div
        className="rounded-full px-3 py-1 text-[12px] font-semibold"
        style={{
          background: PLAN_BG[tier],
          color: PLAN_FG[tier],
        }}
        data-testid="plan-badge"
      >
        {PLAN_LABEL[tier]}
      </div>
    </section>
  );
}
