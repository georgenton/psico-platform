import Link from "next/link";

/**
 * «Esto necesita Pro», dicho una sola vez.
 *
 * Esta tarjeta vivía suelta dentro de la ficha del libro. Cuando el lector tuvo
 * que decir lo mismo —#736: un enlace directo a un capítulo de pago acababa en
 * un 500 en blanco— la opción fácil era escribir otra. Dos tarjetas que dicen
 * lo mismo se separan con el primer cambio de precio o de copy, así que está
 * aquí y la usan las dos.
 *
 * `titulo` y `cuerpo` tienen el texto de la ficha por defecto. El lector pasa
 * el suyo porque la situación no es la misma: en la ficha la persona está
 * mirando un libro entero; en el lector venía siguiendo un capítulo concreto y
 * merece que se le diga eso.
 */
export function PaywallPro({
  titulo = "Este libro está disponible con Pro",
  cuerpo = "Por $7/mes accedes a todos los libros, audios guiados y Eco dentro del capítulo. Cancelas cuando quieras.",
  volver,
}: {
  titulo?: string;
  cuerpo?: string;
  /** Un segundo enlace, de salida. El lector lo usa para volver a la ficha. */
  volver?: { href: string; texto: string };
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-7 text-white"
      style={{
        background:
          "linear-gradient(135deg, var(--color-lavender-500), var(--color-lavender-800))",
      }}
    >
      <h2 className="text-[18px] font-bold leading-tight tracking-tight">
        {titulo}
      </h2>
      <p
        className="mt-2 max-w-md text-[13px] leading-relaxed"
        style={{ color: "rgba(255,255,255,0.85)" }}
      >
        {cuerpo}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/plan"
          className="inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-[13px] font-semibold text-white"
          style={{ background: "var(--bg-action)" }}
        >
          Hazte Pro →
        </Link>
        {volver ? (
          <Link
            href={volver.href}
            className="inline-flex items-center rounded-xl px-4 py-3 text-[13px] font-semibold"
            style={{
              color: "#fff",
              background: "rgba(255,255,255,0.16)",
            }}
          >
            {volver.texto}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
