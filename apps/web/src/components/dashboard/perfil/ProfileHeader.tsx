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
        // El monograma sobre relleno de marca: `--bg-brand-strong` es el token
        // que existe justamente para «relleno de marca que lleva texto», y cada
        // ambiente ya lo declara con el escalón de SU rampa que llega a AA con
        // blanco. Medido en las ocho combinaciones: peor caso 5.92:1 (Energía),
        // frente a 3.24:1 con `lavender-500`, que es donde estaba.
        //
        // Clavar un escalón concreto NO sirve: en Noche la rampa está invertida
        // y `lavender-600` mide 2.59:1 y `lavender-700`, 1.86:1. Por eso se usa
        // el token de rol y no un número.
        //
        // La negrita se queda: bajaba el umbral de 4.5 a 3 por tamaño, y ahora
        // que el relleno cumple 4.5 de todos modos, sigue siendo la que mejor
        // se lee en un círculo pequeño.
        className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
        style={{
          background: "var(--bg-brand-strong)",
          color: "var(--fg-on-brand)",
        }}
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
        // Una píldora no puede partirse en dos líneas: el redondeo la convierte
        // en una cápsula torcida. «Gratuito» cabe, pero el mismo componente
        // pinta «Pro Anual», y ese se partía a 320, 360 y 375 px porque la
        // píldora podía encogerse y el texto podía envolver. Se le quitan las
        // dos cosas a ESTA insignia; la columna del correo, que ya recorta con
        // puntos suspensivos, es la que cede sitio.
        className="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold"
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
