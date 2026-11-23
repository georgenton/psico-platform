import type { Metadata } from "next";
import Link from "next/link";

import { FeelVerseLockup } from "@/components/brand/FeelVerse";
import { RUTA_AYUDA } from "@/lib/ayuda";

export const metadata: Metadata = {
  title: {
    default: "Acceso",
    template: "%s | FeelVerse",
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "var(--color-lavender-50)" }}
    >
      {/* Brand — Sprint H6 polish: tracking-tight for editorial feel */}
      <Link href="/" className="mb-8" aria-label="FeelVerse">
        <FeelVerseLockup size={26} />
      </Link>

      {/* Card */}
      <div
        className="w-full max-w-md rounded-3xl p-8"
        style={{
          background: "var(--color-warm-50)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {children}
      </div>

      {/* Footer note */}
      <p className="mt-6 text-sm" style={{ color: "var(--color-warm-500)" }}>
        Psicoeducación para el bienestar emocional · Ecuador y LATAM
      </p>

      {/* La ayuda no está detrás de la puerta, así que se dice en la puerta:
          aparece en el acceso, el registro, la recuperación y la
          verificación. Enlace nativo, para que funcione sin JavaScript. */}
      <a
        href={RUTA_AYUDA}
        className="mt-1 inline-flex min-h-[44px] items-center text-center text-sm font-semibold underline underline-offset-4"
        style={{ color: "var(--fg-link-strong)" }}
      >
        ¿Necesitas ayuda ahora? Ver líneas de ayuda
      </a>
    </div>
  );
}
