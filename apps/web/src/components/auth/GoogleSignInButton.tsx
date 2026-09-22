"use client";

import Script from "next/script";
import { useEffect, useRef, useState, useTransition } from "react";

import { loginWithGoogleAction } from "@/actions/auth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "small" | "medium" | "large";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
              locale?: string;
            },
          ) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

/**
 * GoogleSignInButton — Sprint S58.
 *
 * Renders the official Google Sign-In button via Google Identity Services
 * (GIS), the modern, frame-less SDK that emits a JWT id_token directly to
 * the page. We forward the token to the backend via the
 * `loginWithGoogleAction` server action, which verifies the signature with
 * Google's public keys and issues our own AuthResponse (same as the
 * email/password flow).
 *
 * Configuration required:
 *   - NEXT_PUBLIC_GOOGLE_CLIENT_ID env (the .apps.googleusercontent.com ID).
 *   - The deployed origin (e.g. https://psico-platform-web.vercel.app)
 *     must be listed under "Authorized JavaScript origins" in Google
 *     Cloud Console → OAuth consent screen → Credentials.
 *
 * If the env is unset, the button is hidden — we don't want to render a
 * broken control in dev environments.
 */
export function GoogleSignInButton({
  text = "continue_with",
  from,
}: {
  text?: "signin_with" | "signup_with" | "continue_with";
  from?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  /**
   * Ancho disponible para el botón, medido en nuestro propio contenedor.
   *
   * El botón se pedía con un `width: 320` fijo. Google dibuja algo más ancho
   * que lo pedido —unos 20 px de su propio marco—, así que a 320 px de
   * ventana el resultado medía 340 y empujaba el documento 10 px en
   * horizontal: la página se desplazaba de lado (WCAG 2.1 · 1.4.10). Y no
   * sólo ahí: a 375 px nuestro contenedor mide 279 y el botón seguía midiendo
   * 340, desalineado con el formulario en todos los anchos estrechos.
   *
   * Lo que cambia es sencillo: se le pide a Google el ancho que de verdad hay.
   */
  const [disponible, setDisponible] = useState<number | null>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Medir, y volver a medir si el ancho cambia (girar el móvil, hacer zoom,
  // abrir el inspector). Sin esto el botón quedaría cuadrado a la primera
  // medida y volvería a desencajarse en cuanto la ventana se moviera.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const leer = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0)
        setDisponible((prev) =>
          prev != null && Math.abs(prev - w) < 4 ? prev : w,
        );
    };
    // Medir siempre, aunque el navegador no tenga ResizeObserver: sin esta
    // primera lectura el botón no llegaría a dibujarse nunca, que es peor que
    // no seguir los cambios de tamaño.
    leer();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(leer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !clientId) return;
    if (disponible == null) return;
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => {
        setError(null);
        startTransition(async () => {
          const res = await loginWithGoogleAction(credential, from);
          // On success, the action calls redirect() — code below won't run.
          if (res?.error) setError(res.error);
        });
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const host = containerRef.current;
    const marco = frameRef.current;

    /**
     * Google admite `width` en píxeles dentro de [200, 400]. Fuera de ese
     * rango la configuración no es válida, así que el ancho pedido se ciñe a
     * él; por debajo de 200 no hay nada que negociar y el botón se queda en su
     * mínimo. A 320 px de ventana tenemos 224, de sobra.
     */
    const pedir = (n: number) => Math.max(200, Math.min(400, Math.round(n)));

    const dibujar = (ancho: number) => {
      // El contenedor es NUESTRO nodo: vaciarlo antes de volver a dibujar
      // evita apilar botones. Nada de esto toca el interior del iframe, que es
      // de otro origen y no nos pertenece.
      host.innerHTML = "";
      window.google!.accounts.id.renderButton(host, {
        theme: "outline",
        size: "large",
        text,
        shape: "pill",
        logo_alignment: "left",
        width: ancho,
      });
    };

    const pedido = pedir(disponible);
    dibujar(pedido);

    /**
     * Una sola pasada de corrección, y medida en vez de adivinada.
     *
     * El marco que Google añade alrededor de lo pedido son hoy unos 20 px,
     * pero escribir ese 20 en el código sería atarnos a un detalle suyo que
     * puede cambiar sin avisar. En vez de eso se mide lo que realmente dibujó
     * y, si se pasa del hueco, se le vuelve a pedir descontando el exceso.
     * Es una corrección acotada: se ejecuta una vez y no se realimenta.
     */
    const id = requestAnimationFrame(() => {
      if (!marco || !host.isConnected) return;
      const hueco = marco.getBoundingClientRect().width;
      const dibujado = host.getBoundingClientRect().width;
      const exceso = Math.ceil(dibujado - hueco);
      if (exceso > 0 && pedido > 200) dibujar(pedir(pedido - exceso));
    });
    return () => cancelAnimationFrame(id);
  }, [scriptLoaded, clientId, text, from, disponible]);

  if (!clientId) {
    // Hide the button in environments without the env var (dev, preview
    // deploys that don't have it). Email/password remains functional.
    return null;
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      {/* `frameRef` marca el hueco real: es lo que se mide para decidir qué
          ancho pedirle a Google. `max-w-full` lo mantiene dentro de la columna
          del formulario en cualquier ventana. No hay `overflow: hidden` en
          ninguna parte: esconder el desbordamiento cortaría el botón de
          acceso, que es justo lo que no se puede hacer. */}
      <div
        ref={frameRef}
        className="flex w-full max-w-full flex-col items-center gap-2"
      >
        <div ref={containerRef} data-testid="google-signin-container" />
        {error ? (
          <p
            className="text-xs"
            style={{ color: "var(--color-rose-700)" }}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}
