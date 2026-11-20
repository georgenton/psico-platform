"use client";

import { type FormEvent, useState } from "react";

import { authApi, ApiError } from "@/lib/api";

/**
 * Pedir otro enlace de verificación, desde la propia pantalla del enlace
 * muerto.
 *
 * POR QUÉ AQUÍ Y NO DETRÁS DEL LOGIN. Quien llega a esta pantalla acaba de
 * pulsar un enlace que ya no sirve, y es probable que no tenga sesión. El
 * copy anterior le decía que iniciara sesión «para que te enviemos uno nuevo
 * automáticamente»: ese recorrido no existía —`sendVerificationEmail` sólo se
 * disparaba al registrarse— así que la pantalla mandaba a la persona a dar
 * una vuelta que no llevaba a ninguna parte. El remedio vive donde está el
 * problema.
 *
 * EL MENSAJE ES EL MISMO SIEMPRE, A PROPÓSITO. El endpoint contesta 200 para
 * cualquier dirección —desconocida, ya confirmada, de Google, o pasada de su
 * cupo— para que nadie pueda usarlo como oráculo de «¿esta dirección tiene
 * cuenta aquí?». Si esta tarjeta dijera «ya está confirmada» o «no existe»
 * estaría filtrando por la interfaz justo lo que el servidor se cuida de no
 * decir, así que el texto habla en condicional y no promete más de lo que
 * sabe.
 */
export default function ResendVerificationPanel() {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // `useState` y no `useTransition`, que es lo que usa el formulario gemelo de
  // `forgot-password`. La razón es medida, no estética: en la sesión 54 un
  // `startTransition` con callback asíncrono no se vaciaba en jsdom, de modo
  // que el estado posterior al `await` era inobservable y su prueba quedaba
  // indeterminada. Aquí la bandera sólo deshabilita el botón mientras la
  // petición está en vuelo, que no es para lo que sirve una transición.
  const [isPending, setPending] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = (data.get("email") as string).trim();
    setError(null);
    setPending(true);
    // `void` sobre un manejador asíncrono en vez de un `onSubmit` async: lo
    // segundo devuelve una promesa que React descarta, y la regla
    // `no-misused-promises` lo marca con razón.
    void enviar(email);
  }

  async function enviar(email: string) {
    try {
      await authApi.resendVerification(email);
      setSubmitted(true);
    } catch (err) {
      // Un 429 es el único caso que conviene distinguir: es nuestro límite
      // por IP y tiene un remedio concreto —esperar—, mientras que el resto
      // no le dice nada útil a quien lo lee.
      const msg =
        err instanceof ApiError && err.status === 429
          ? "Pediste varios enlaces en poco tiempo. Espera un momento y vuelve a intentarlo."
          : err instanceof ApiError
            ? "No pudimos procesar tu pedido. Reintenta en unos minutos."
            : "Algo salió mal. Reintenta.";
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div
        className="rounded-2xl p-4 text-sm"
        style={{
          background: "var(--color-sage-100)",
          color: "var(--color-sage-700)",
          border: "1.5px solid var(--color-sage-200)",
        }}
        role="status"
      >
        <p className="font-medium mb-1">Revisa tu correo</p>
        <p>
          Si ese correo tiene una cuenta sin confirmar, te enviamos un enlace
          nuevo. Vence en 24 horas. Si no te llega, revisa la carpeta de spam.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--color-warm-100)",
        border: "1.5px solid var(--color-warm-200)",
      }}
    >
      <p
        className="text-sm font-medium mb-3"
        style={{ color: "var(--color-warm-700)" }}
      >
        Pide un enlace nuevo
      </p>

      {/* `method="post"` para que el envío nativo —el que ocurre si React aún
          no ha enganchado su manejador— mande el correo en el cuerpo y nunca
          en la URL. Ver #727 y la explicación larga en
          `app/(auth)/register/page.tsx`. */}
      <form
        method="post"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="resend-email"
            className="text-xs font-medium"
            style={{ color: "var(--color-warm-600)" }}
          >
            Tu correo
          </label>
          <input
            id="resend-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            placeholder="tu@correo.com"
            className="rounded-xl px-4 py-2.5 text-sm outline-none transition-all disabled:opacity-60"
            style={{
              background: "var(--color-warm-50)",
              border: "1.5px solid var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          />
        </div>

        {error ? (
          <p
            className="text-xs"
            style={{ color: "var(--color-rose-700)" }}
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl py-2.5 text-sm font-medium text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--bg-brand-strong)" }}
        >
          {isPending ? "Enviando..." : "Enviar enlace nuevo"}
        </button>
      </form>
    </div>
  );
}
