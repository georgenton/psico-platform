import type { Metadata } from "next";
import Link from "next/link";

import { FeelVerseLockup } from "@/components/brand/FeelVerse";

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
    </div>
  );
}
