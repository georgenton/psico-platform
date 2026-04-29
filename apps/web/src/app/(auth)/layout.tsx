import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    default: "Acceso",
    template: "%s | Psico Platform",
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
      {/* Brand */}
      <Link
        href="/"
        className="mb-8 text-2xl font-bold"
        style={{ color: "var(--color-lavender-700)" }}
      >
        Psico Platform
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
