import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Psico Platform",
    template: "%s | Psico Platform",
  },
  description: "Psicoeducación para el bienestar emocional — Ecuador y LATAM.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-warm-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
