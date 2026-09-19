import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Newsreader, Source_Serif_4 } from "next/font/google";
import { feelVerseFaviconHref } from "@/components/brand/FeelVerse";
import "./globals.css";

/**
 * Las dos serif editoriales del sistema visual aprobado.
 *
 * El archivo de diseño las trae con un `@import` a fonts.googleapis.com. Aquí
 * se cargan con `next/font/google`, que las descarga en build y las sirve
 * desde el propio dominio: no añade un origen externo que la CSP tendría que
 * permitir, no hay petición a un tercero en tiempo de ejecución y no hay salto
 * de fuente mientras llega. Cada theme elige cuál usa a través de
 * `--fv-font-display` / `--fv-font-reader`.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: {
    default: "FeelVerse",
    template: "%s | FeelVerse",
  },
  description: "Psicoeducación para el bienestar emocional — Ecuador y LATAM.",
  // El favicon es el logo aprobado, servido como data-URI de una tinta. Lo
  // declara `metadata` en lugar de un `<link>` escrito desde el cliente.
  icons: { icon: [{ url: feelVerseFaviconHref(), type: "image/svg+xml" }] },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      // El theme por defecto. `:root` ya lleva los valores de contemporary, así
      // que el atributo es explícito y no cambia nada por sí solo; el ajuste de
      // cada persona lo aplica `ThemeApplier` donde hay preferencias.
      data-theme="contemporary"
      className={`${GeistSans.variable} ${GeistMono.variable} ${newsreader.variable} ${sourceSerif.variable}`}
    >
      <body className="min-h-screen bg-warm-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
