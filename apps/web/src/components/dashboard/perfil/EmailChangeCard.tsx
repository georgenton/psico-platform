import { EMAIL_CHANGE_UNAVAILABLE_NOTICE } from "@psico/types";
import type { UserMeResponse } from "@psico/types";

/**
 * El correo de la cuenta, sólo para leerlo.
 *
 * Aquí había un formulario que pedía el cambio y anunciaba un enlace de
 * confirmación. Ese enlace llevaba a una página que no existe, así que nadie
 * podía terminar. El servidor rechaza ahora la petición y esta tarjeta no la
 * ofrece; lo que falta para ofrecerla está en
 * `docs/product/tarea-cambio-de-correo.md`.
 */
export function EmailChangeCard({ me }: { me: UserMeResponse }) {
  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
      data-testid="email-change-card"
    >
      <h2
        className="text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Correo de la cuenta
      </h2>
      <p
        className="mt-0.5 text-[12px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Tu correo actual es{" "}
        <span style={{ color: "var(--color-warm-900)" }}>{me.user.email}</span>.{" "}
        {EMAIL_CHANGE_UNAVAILABLE_NOTICE}
      </p>
    </section>
  );
}
