import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Psico Platform",
  description: "Psychoeducation SaaS for LATAM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
