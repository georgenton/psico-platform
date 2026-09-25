import type { UserMeResponse } from "@psico/types";

/**
 * Las etiquetas que la insignia sabe pintar.
 *
 * Hoy sólo llegan dos: `tier` se deriva de `user.tier`, que es `"free" | "pro"`.
 * `ANNUAL` y `B2B` son código muerto — pero código muerto que algún día se
 * conectará, y las dos son de DOS PALABRAS, que es justo la forma que rompía la
 * píldora. Se exporta para que la prueba pueda recorrerlas todas y para que el
 * día que se enciendan lleguen ya cubiertas. Ver #733.
 */
export const PLAN_LABEL: Record<string, string> = {
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
      // ── Por qué esta fila envuelve ──────────────────────────────────────
      //
      // Tres piezas —monograma, identidad, insignia— y a 320 px no caben en una
      // línea. Sin permiso para envolver, `flex` no deja de repartir: le quita
      // sitio a quien se deje. Medido a 320 px antes de este cambio: el
      // monograma, que es un círculo de 64 px, se pintaba a 27.4 px de ancho
      // por 64 de alto —una elipse—, la columna de identidad se plantaba en su
      // mínimo de 152.5 px y no cedía más, y la insignia acababa 7.6 px fuera
      // de la tarjeta («Gratuito») o 29.2 px fuera y con la página
      // desplazándose 17 px («Empresarial»). Issue #733.
      //
      // Envolver la FILA es lo que arregla las tres cosas a la vez: cuando la
      // insignia no cabe, baja entera a una segunda línea en vez de que alguien
      // se estruje. No hace falta ningún breakpoint: el punto en el que ocurre
      // lo decide el contenido —cuánto mide el nombre, el correo y la etiqueta
      // del plan—, que es precisamente lo que un ancho fijo no sabría.
      //
      // `ms-auto` en la insignia la mantiene pegada a la derecha en las dos
      // situaciones, así que en la segunda línea sigue donde la vista la
      // buscaba y la cabecera se lee como una, no como tres bloques sueltos.
      className="flex flex-wrap items-center gap-4 rounded-2xl border-[1.5px] bg-white p-5"
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
        // `shrink-0`: un círculo con medida propia no negocia. `h-16 w-16` fija
        // los 64 px, pero sin esto era el primero al que la fila le quitaba
        // sitio, y a 320 px se pintaba a 27.4 px de ancho por 64 de alto. Un
        // círculo aplastado en óvalo con las iniciales apretadas dentro.
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold"
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
        // en una cápsula torcida. Por eso no se encoge ni envuelve su texto.
        //
        // Lo que sí puede es bajar de línea, y eso lo decide la fila (ver el
        // comentario de la sección). `ms-auto` la deja pegada al borde derecho
        // tanto si comparte línea como si baja sola.
        className="ms-auto shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold"
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
